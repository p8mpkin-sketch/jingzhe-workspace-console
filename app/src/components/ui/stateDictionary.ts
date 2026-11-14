// One dictionary for machine status values → visible label + tone. Every status shown in the UI reads from here,
// so the same state never appears as an English machine value on one page and a Chinese label on another.
// Presentation only: keys are the values the API already returns; nothing here changes what is sent or stored.

export type Tone = 'success' | 'attention' | 'danger' | 'neutral' | 'brand';
export interface StateDef { label: string; tone: Tone }

const D = (label: string, tone: Tone): StateDef => ({ label, tone });

export const STATE: Record<string, StateDef> = {
  // execution
  queued: D('排队中', 'neutral'),
  pending: D('待处理', 'neutral'),
  discovered: D('未执行', 'neutral'),
  idle: D('空闲', 'neutral'),
  running: D('执行中', 'brand'),
  generating: D('生成中', 'brand'),
  waiting_login: D('等待登录', 'attention'),
  paused: D('已暂停', 'attention'),
  interrupted: D('已中断', 'attention'),
  done: D('已完成', 'success'),
  ok: D('正常', 'success'),
  ready: D('就绪', 'success'),
  failed: D('失败', 'danger'),
  error: D('出错', 'danger'),
  cancelled: D('已取消', 'neutral'),
  skipped: D('已跳过', 'neutral'),
  closed: D('已关闭', 'neutral'),
  // discovery candidates
  needs_verification: D('待核验', 'attention'),
  manual_required: D('需人工处理', 'attention'),
  verified: D('可下载', 'brand'),
  downloaded: D('已下载', 'brand'),
  imported: D('已导入', 'success'),
  rejected: D('已排除', 'neutral'),
  // knowledge and accounts
  active: D('启用', 'success'),
  draft: D('草稿', 'neutral'),
  disabled: D('停用', 'neutral'),
  approved: D('已通过', 'success'),
  // infrastructure
  online: D('在线', 'success'),
  offline: D('离线', 'neutral'),
  stale: D('数据可能已过期', 'attention'),
};

/** Unknown values are shown as-is with a neutral tone rather than hidden. */
export function stateOf(status: string | null | undefined, fallback = '未知'): StateDef {
  if (!status) return D(fallback, 'neutral');
  return STATE[status] ?? D(status, 'neutral');
}

/** Finding severity levels → label. Colors come from the --jz-sev-* tokens. */
export const SEVERITY_LABEL: Record<string, string> = { critical: '严重', high: '高', medium: '中', low: '低', info: '提示', safe: '通过' };
