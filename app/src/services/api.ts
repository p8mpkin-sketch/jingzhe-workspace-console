// services/api.ts — REST 客户端门面(token 复用旧前端 localStorage 契约)+ SSE 助手。
// R108-3(指令3②)收敛口径: 实现收敛于 apiClient.ts(同源/超时/Bearer/错误统一),本文件转为
// 委托门面——对外导出(getToken/setToken/clearToken/ApiError/api/openEventStream)签名零变,
// 既有导入方零触碰;openEventStream 仍驻此文件(stores/pentest SSE 拓扑零触碰,R47 P0-2 契约)。
export { getToken, setToken, clearToken, ApiError } from './apiClient';
import { request, getToken } from './apiClient';

export async function api<T = any>(path: string, opts: RequestInit = {}, silent = false): Promise<T> {
  return request<T>(path, opts, silent);
}

/** SSE 事件流(token 走 query,后端契约;R47 P0-2: onerror 支撑顶栏三态) */
export function openEventStream(sid: number, source: string, sinceSeq: number,
                                onEvent: (e: any) => void, onOpen?: () => void,
                                onError?: () => void): EventSource {
  const es = new EventSource(
    `/api/pentest/sessions/${sid}/events/stream?source=${source}&since_seq=${sinceSeq}&token=${encodeURIComponent(getToken())}`
  );
  es.onopen = () => onOpen?.();
  es.onerror = () => onError?.();
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data)); } catch { /* ping/注释帧 */ }
  };
  return es;
}
