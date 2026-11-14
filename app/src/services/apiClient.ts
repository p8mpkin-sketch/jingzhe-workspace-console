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
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** 请求超时默认值(60s): smoke 全量端点实测均在秒级,60s 仅拦悬挂态 */
export const DEFAULT_TIMEOUT_MS = 60_000;

export async function request<T = any>(path: string, opts: RequestInit = {}, silent = false): Promise<T> {
  const headers = Object.assign(
    { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    opts.headers || {}
  );
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
  if (r.status === 401) {
    if (!silent) console.warn('[v2] 401', path);
    throw new ApiError(401, '未登录或会话过期');
  }
  const d = (await r.json().catch(() => ({}))) as T;
  if (!r.ok) throw new ApiError(r.status, (d as any)?.detail || r.statusText);
  return d;
}
