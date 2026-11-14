import React, { useEffect, useMemo, useRef, useState } from 'react';

/** P2-④: 上下文感知动态建议 chips——未绑任务=通用审计词库(原 8 条在案保留);
 *  会话绑定 task_id 后插入该 APK 专属追问模板(插值只用包名/任务名真值,不编造检出结果)。
 *  「换一批」=前端轮播窗口;横滚右缘渐隐仅在溢出时出现(纯显示层状态)。 */

export interface BoundTask { id: number; name?: string; pkg?: string }

interface Chip { label: string; q: string }

const GENERIC: Chip[] = [
  { label: '硬编码密钥提取', q: '汇总当前项目全部 APK 中发现的所有硬编码 key,按任务分组列出' },
  { label: '证书锁定绕过', q: '哪些 APP 启用了证书锁定(SSL Pinning)?结合 ssl_bypass 钩子给出绕过思路与风险提示' },
  { label: '导出组件审计', q: '汇总所有 APP 的导出组件(exported activity/service/receiver/provider),标出未加权限保护的' },
  { label: '危险 API 清单', q: '列出各 APP 的危险函数调用与高危权限使用,按风险等级分组' },
  { label: 'VPN/隧道特征', q: '检测哪些 APP 存在 VPN/代理/隧道(SDP)等内网接入通道特征' },
  { label: '高危漏洞清单', q: '列出当前高危漏洞清单,包含任务号与出处' },
  { label: '会话要点小结', q: '总结当前会话讨论要点,并给出下一步审计建议' },
  { label: 'MASVS 归类', q: '把当前项目的发现按 MASVS 域归类输出清单' },
];

const taskChips = (t: BoundTask): Chip[] => {
  const app = t.name || t.pkg || `#${t.id}`;
  return [
    { label: `#${t.id} 高危复核`, q: `针对任务 #${t.id}(${app}),列出已检出发现中的高危项,逐条给出复核思路与所需证据` },
    { label: `#${t.id} 攻击面梳理`, q: `梳理任务 #${t.id}(${app})的攻击面:导出组件/WebView 配置/权限面,按可利用性排序` },
    { label: `#${t.id} 修复优先级`, q: `对任务 #${t.id}(${app})的发现按修复优先级排序输出清单,并说明排序依据` },
    { label: `#${t.id} 报告小结`, q: `总结任务 #${t.id}(${app})的整体安全态势,给出结论与下一步建议` },
  ];
};

const WINDOW = 8;

export const ContextualChips: React.FC<{
  boundTask: BoundTask | null;
  onPick: (q: string) => void;
}> = ({ boundTask, onPick }) => {
  const chipsRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [page, setPage] = useState(0);

  const pool = useMemo<Chip[]>(
    () => (boundTask ? [...taskChips(boundTask), ...GENERIC] : GENERIC),
    [boundTask]);

  useEffect(() => { setPage(0); }, [boundTask?.id]);   // eslint-disable-line

  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 4);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 轮播窗口: 每页 WINDOW 条,越界回卷(pool 大于窗口时才可翻)
  const pages = Math.max(1, Math.ceil(pool.length / WINDOW));
  const safePage = ((page % pages) + pages) % pages;
  const visible = pool.length > WINDOW ? pool.slice(safePage * WINDOW, safePage * WINDOW + WINDOW) : pool;

  return (
    <div className="relative">
      {overflow && <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-jz-surface z-10" data-intent-chips-fade />}
      <div ref={chipsRef} className="flex items-center gap-1.5 mb-1.5 flex-nowrap overflow-x-auto pb-1" data-intent-chips>
        {boundTask && (
          <span className="flex-none whitespace-nowrap px-1.5 py-1 text-meta font-semibold text-jz-brand" data-chips-task-tag
            title={`已关联任务 #${boundTask.id}${boundTask.pkg ? ' · ' + boundTask.pkg : ''}——推荐词已切换为该 APK 专属`}>
            🎯 #{boundTask.id}
          </span>
        )}
        {visible.map((it) => (
          <button key={it.label} data-intent-chip={it.label} onClick={() => onPick(it.q)}
            title={it.q}
            className="flex-none whitespace-nowrap px-2.5 py-1 rounded-pill bg-jz-surface-2/70 text-meta text-jz-muted hover:text-jz-brand hover:bg-jz-surface-2 active:scale-95 transition-all">
            {it.label}
          </button>
        ))}
        {pool.length > WINDOW && (
          <button onClick={() => setPage((p) => p + 1)} data-chips-rotate
            title={`换一批(${safePage + 1}/${pages} 页,共 ${pool.length} 条)`}
            className="flex-none whitespace-nowrap px-2 py-1 rounded-pill text-meta text-jz-brand hover:bg-jz-brand/10 transition-all">
            ↻ 换一批
          </button>
        )}
      </div>
    </div>
  );
};

export default ContextualChips;
