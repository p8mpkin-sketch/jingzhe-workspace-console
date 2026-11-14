// services/websocketBridge.ts — R108-3(指令3④) SSE 抽象层: 断线重连(指数退避)+环形缓冲。
// 口径(指令书明示降级档,如实记录): 「仅封装不切换」——既有 stores/pentest.ts openEventStream
// EventSource 拓扑(R47 P0-2 三态/R41 定位/R105 bridge 源/R49 语义)本轮零触碰;本层作为新增
// 防护封装,事件语义与既有逐字对齐(同 URL 契约/同 JSON.parse 容错忽略 ping 帧),是否切换由
// 收口轮(R108-4)评估。命名沿方案口径 websocketBridge,承载的是既有 SSE(EventSource)通道。

import { getToken } from './apiClient';
import type { TerminalLogEvent } from '@/types/api';

export type BridgeState = 'connecting' | 'live' | 'reconnecting' | 'closed';

export interface WebsocketBridgeOptions {
  onEvent: (e: TerminalLogEvent) => void;
  onState?: (s: BridgeState) => void;
  /** 事件源(既有契约: hook/progress/evidence/bridge;默认 hook 与 stores/pentest 同源) */
  source?: string;
  /** 环形缓冲容量(默认 2000,与 stores/pentest MAX_EVENTS 同口径;溢出丢最旧) */
  bufferCap?: number;
  /** 重连基值 ms(默认 2000) */
  retryBaseMs?: number;
  /** 重连封顶 ms(默认 30000) */
  retryCapMs?: number;
}

/** 环形缓冲: 定容量 append,溢出丢最旧(O(1) 摊还,slice 截断语义与 store 一致) */
class RingBuffer<T> {
  private items: T[] = [];
  constructor(private cap: number) {}
  push(v: T): void {
    this.items.push(v);
    if (this.items.length > this.cap) this.items = this.items.slice(this.items.length - this.cap);
  }
  snapshot(): T[] { return [...this.items]; }
  lastSeq(): number {
    return this.items.reduce((m, e) => Math.max(m, (e as TerminalLogEvent)?.seq || 0), 0);
  }
  clear(): void { this.items = []; }
  get size(): number { return this.items.length; }
}

export class WebsocketBridge {
  private es: EventSource | null = null;
  private buf: RingBuffer<TerminalLogEvent>;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closedByUser = false;
  readonly sid: number;
  private opts: Required<Pick<WebsocketBridgeOptions, 'source' | 'bufferCap' | 'retryBaseMs' | 'retryCapMs'>> &
    Pick<WebsocketBridgeOptions, 'onEvent' | 'onState'>;

  constructor(sid: number, opts: WebsocketBridgeOptions) {
    this.sid = sid;
    this.opts = {
      onEvent: opts.onEvent,
      onState: opts.onState,
      source: opts.source ?? 'hook',
      bufferCap: opts.bufferCap ?? 2000,
      retryBaseMs: opts.retryBaseMs ?? 2000,
      retryCapMs: opts.retryCapMs ?? 30000,
    };
    this.buf = new RingBuffer<TerminalLogEvent>(this.opts.bufferCap);
  }

  /** 断线重连退避: 基值×2^n 封顶(断线防护;EventSource 原生重连仍并存,叠加不冲突) */
  private backoffMs(): number {
    return Math.min(this.opts.retryBaseMs * 2 ** this.attempt, this.opts.retryCapMs);
  }

  private setState(s: BridgeState): void {
    this.opts.onState?.(s);
  }

  /** 建流: URL/解析语义与既有 openEventStream 逐字对齐(token 走 query,后端契约);
   *  重连起点=环形缓冲最大 seq(既有 cursor 口径,断线期间事件不重不漏由 since_seq 续传承载) */
  connect(): void {
    if (this.es || this.closedByUser) return;
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const es = new EventSource(
      `/api/pentest/sessions/${this.sid}/events/stream?source=${this.opts.source}` +
      `&since_seq=${this.buf.lastSeq()}&token=${encodeURIComponent(getToken())}`
    );
    es.onopen = () => { this.attempt = 0; this.setState('live'); };
    es.onerror = () => {
      // EventSource 原生重连保留;本层退避定时器作为兜底防护(原生命周期被 close 时重建)
      this.setState('reconnecting');
      if (this.retryTimer != null) return;
      const ms = this.backoffMs();
      this.attempt += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        try { es.close(); } catch { /* 已关闭 */ }
        if (!this.closedByUser) { this.es = null; this.connect(); }
      }, ms);
    };
    es.onmessage = (m) => {
      try {
        const e = JSON.parse(m.data) as TerminalLogEvent;
        this.buf.push(e);
        this.opts.onEvent?.(e);
      } catch { /* ping/注释帧,与既有 openEventStream 同容错 */ }
    };
    this.es = es;
  }

  /** 断线期间/离线补拉缓冲快照(环形缓冲真值,不编造) */
  getBuffered(): TerminalLogEvent[] { return this.buf.snapshot(); }

  /** 主动关闭: 停退避定时器+关流,状态 closed(重连不再自启) */
  close(): void {
    this.closedByUser = true;
    if (this.retryTimer != null) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { this.es?.close(); } catch { /* 已关闭 */ }
    this.es = null;
    this.setState('closed');
  }
}
