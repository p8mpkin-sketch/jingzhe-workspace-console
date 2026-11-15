// services/apiClient.ts — R108-3(指令3②) 统一请求客户端(收敛实现落本文件)。
// 与既有 services/api.ts api() 助手语义等价: 同 token 键(localStorage 'token',旧前端契约)/
// 同 headers(Content-Type+Bearer,opts.headers 可覆盖)/同 401 分支(silent 免 console.warn)/
// 同错误抛出(ApiError, detail||statusText)/同 JSON 容错(catch→{})。
// 收敛口径(二选一如实记录): 实现收敛于本文件,services/api.ts 转为委托门面——对外导出签名零变,
// 既有导入方零触碰。超时=指令②明列的客户端职责(默认 60s AbortController): 仅缩短「后端无应答
// 永久悬挂」路径(新增防护,同 SSE 重连定位),正常请求路径零感知;调用方自传 opts.signal 时不叠加
// (语义让位调用方)。BaseURL=同源相对路径(既有契约,零绝对地址,零额外配置)。

const TOKEN_KEY = 'token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
  invalidateGetCache();
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  invalidateGetCache();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** 请求超时默认值(60s): smoke 全量端点实测均在秒级,60s 仅拦悬挂态 */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** How long an identical GET may be answered from the last response (covers several components mounting together). */
export const GET_TTL_MS = 2_000;

type RawResponse = { status: number; ok: boolean; statusText: string; text: string };
const inflight = new Map<string, Promise<RawResponse>>();
const recent = new Map<string, { at: number; raw: RawResponse }>();

// A remembered response never answers a request made after the user acted: any click or key press makes
// older entries ineligible, so a refresh button always reaches the server. The TTL only folds together the
// burst of identical reads that components fire while a page mounts.
let lastUserInputAt = 0;
if (typeof window !== 'undefined') {
  const mark = () => { lastUserInputAt = Date.now(); };
  window.addEventListener('pointerdown', mark, true);
  window.addEventListener('keydown', mark, true);
}

/** Drop every remembered GET. Called on any write, on sign-in / sign-out, and available to callers that must re-read. */
export function invalidateGetCache() { recent.clear(); }

async function send(path: string, opts: RequestInit, headers: Record<string, string>): Promise<RawResponse> {
  let r: Response;
  if (opts.signal) {
    // 调用方自带信号: 不叠加超时(语义让位),与既有行为完全一致
    r = await fetch(path, { ...opts, headers });
  } else {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
    try {
      r = await fetch(path, { ...opts, headers, signal: ctrl.signal });
    } catch (e) {
      if (ctrl.signal.aborted) throw new ApiError(408, `请求超时(${DEFAULT_TIMEOUT_MS}ms 无应答)`);
      throw e;   // 网络错误原样抛出(与既有 fetch reject 行为一致)
    } finally {
      clearTimeout(timer);
    }
  }
  // 401 has no useful body; everything else is read once as text so each caller parses its own copy.
  const text = r.status === 401 ? '' : await r.text().catch(() => '');
  return { status: r.status, ok: r.ok, statusText: r.statusText, text };
}

/**
 * One request path for the app.
 * Plain GETs (no body, no caller signal, no custom headers, cache not 'no-store' / 'reload') are coalesced:
 * identical calls share one in-flight request, and a successful response answers repeats for GET_TTL_MS.
 * Any non-GET request clears that memory first, and so does any user input, so a read after a write or a
 * click on a refresh control always reaches the server.
 * Every caller gets its own parsed object. Pass `{ cache: 'no-store' }` to force a fresh read.
 */
export async function request<T = any>(path: string, opts: RequestInit = {}, silent = false): Promise<T> {
  const token = getToken();
  const headers = Object.assign(
    { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    opts.headers || {}
  ) as Record<string, string>;
  const method = (opts.method || 'GET').toUpperCase();
  const shareable = method === 'GET' && !opts.body && !opts.signal && !opts.headers && opts.cache !== 'no-store' && opts.cache !== 'reload';
  let raw: RawResponse;
  if (!shareable) {
    if (method !== 'GET') invalidateGetCache();
    raw = await send(path, opts, headers);
    if (method !== 'GET') invalidateGetCache();
  } else {
    const key = token + ' ' + path;
    const now = Date.now();
    const hit = recent.get(key);
    if (hit && now - hit.at < GET_TTL_MS && hit.at > lastUserInputAt) raw = hit.raw;
    else {
      let pending = inflight.get(key);
      if (!pending) {
        pending = send(path, opts, headers).then((res) => {
          if (res.ok) {
            const at = Date.now();
            for (const [k, v] of recent) if (at - v.at >= GET_TTL_MS) recent.delete(k);
            recent.set(key, { at, raw: res });
          }
          return res;
        }).finally(() => { inflight.delete(key); });
        inflight.set(key, pending);
      }
      raw = await pending;
    }
  }
  if (raw.status === 401) {
    if (!silent) console.warn('[v2] 401', path);
    throw new ApiError(401, '未登录或会话过期');
  }
  let d: any = {};
  try { d = raw.text ? JSON.parse(raw.text) : {}; } catch { d = {}; }
  if (!raw.ok) throw new ApiError(raw.status, d?.detail || raw.statusText);
  return d as T;
}
