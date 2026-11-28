// RuntimeTab.tsx — 运行: the Agent web-access switch (the same setting as the Agent's slash command), the web service
// status, and concurrency. Reads when the tab opens: GET /api/agent/settings, GET /api/agent/web/status,
// GET /api/system/resource-stats; the switch sends PATCH /api/agent/settings {web_enabled}. A failed settings read
// disables the switch and says 未读取; it is not shown as off.
import React, { useState } from 'react';
import { Globe } from 'lucide-react';
import { api } from '@/services/api';
import { Button, EmptyState, Panel, StatusBadge, toast } from '@/components/ui';
import { READ_WORD, hasValue, isDenied } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import { MISSING, ReadBlock, StaleLine, num } from './sysShared';

const Row: React.FC<{ label: string; children: React.ReactNode; attrs?: Record<string, string> }> = ({ label, children, attrs }) => (
  <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 border-b border-jz-border py-2.5 text-label last:border-b-0 max-[760px]:grid-cols-1 max-[760px]:gap-1" {...attrs}>
    <dt className="text-jz-muted">{label}</dt><dd className="min-w-0 text-jz-ink">{children}</dd>
  </div>
);

export const RuntimeTab: React.FC<{ settings: Read<{ web_enabled: boolean }>; web: Read<any>; stats: Read<any> }> = ({ settings, web, stats }) => {
  const [busy, setBusy] = useState(false);
  const known = hasValue(settings);
  const on = known ? !!settings.value.web_enabled : null;
  const toggle = async () => {
    if (on == null) return;
    setBusy(true);
    try {
      await api('/api/agent/settings', { method: 'PATCH', body: JSON.stringify({ web_enabled: !on }) });
      toast.ok(!on ? 'Agent 联网已开启' : 'Agent 联网已关闭');
      settings.reload();
    } catch (e: any) { toast.err(isDenied(e) ? '没有修改联网设置的权限(403)' : '联网开关保存失败: ' + (e?.message || '')); }
    setBusy(false);
  };
  const w = hasValue(web) ? web.value || {} : null;
  const s = hasValue(stats) ? stats.value || {} : null;
  const running = num(s?.slots?.running), cap = num(s?.slots?.quota_concurrent);
  return (
    <div className="space-y-6" data-system-runtime>
      <Panel title="Agent 联网" description="Agent 回答时能否检索公开网络。与 Agent 输入框里的“/开启联网”是同一个设置。" data-runtime-web>
        <StaleLine read={settings} what="联网设置" />
        <dl>
          <Row label="联网开关" attrs={{ 'data-runtime-switch-row': '' }}>
            <span className="flex flex-wrap items-center gap-3">
              <span data-runtime-switch={on == null ? settings.state : on ? 'on' : 'off'}
                className="sr-only">{on == null ? READ_WORD[settings.state as 'loading'] || '未读取' : on ? '已开启' : '已关闭'}</span>
              <StatusBadge tone={on ? 'success' : 'neutral'}>{on == null ? (settings.state === 'stale' ? '最近一次刷新未成功' : READ_WORD[settings.state as 'loading' | 'unread' | 'permission'] || '未读取') : on ? '已开启' : '已关闭'}</StatusBadge>
              <Button size="sm" variant="secondary" icon={<Globe size={14} aria-hidden />} loading={busy} disabled={on == null || busy} onClick={toggle} data-runtime-toggle>
                {on == null ? '开关不可用' : on ? '关闭联网' : '开启联网'}
              </Button>
              {on == null && settings.state !== 'loading' && <span className="text-meta text-jz-muted">联网设置{settings.state === 'permission' ? '无权限读取' : '未读取'},不按“关闭”显示。</span>}
            </span>
          </Row>
        </dl>
        {!known && settings.state !== 'loading' && <div className="pt-2"><ReadBlock read={settings} what="联网设置" /></div>}
      </Panel>

      <Panel title="联网服务" description="Agent 检索时使用的服务。" data-runtime-web-status>
        <ReadBlock read={web} what="联网服务状态" />
        <StaleLine read={web} what="联网服务状态" />
        {w && (w.provider || w.enabled ? (
          <dl>
            <Row label="状态">{w.enabled ? <StatusBadge tone="success">可用</StatusBadge> : <StatusBadge tone="neutral">未启用</StatusBadge>}</Row>
            <Row label="服务"><span className="font-mono text-mono">{w.provider === 'tavily' ? 'Tavily' : w.provider ? String(w.provider) : MISSING}</span></Row>
          </dl>
        ) : (
          <div data-runtime-web-empty>
            <EmptyState compact icon={Globe} title="联网服务未配置" cause="后端没有配置检索服务。配置后,开启联网的 Agent 才能检索公开网络;没有配置时开关打开也不会检索。" />
          </div>
        ))}
      </Panel>

      <Panel title="并发" description="正在运行和排队的任务,对比组织允许的最大并发。" data-runtime-slots>
        <ReadBlock read={stats} what="并发占用" skeleton="metrics" />
        <StaleLine read={stats} what="并发占用" />
        {s && (
          <dl>
            <Row label="当前占用"><span className="font-mono tnum" data-runtime-running>{running ?? MISSING}</span></Row>
            <Row label="最大并发"><span className="font-mono tnum" data-runtime-quota>{cap ?? MISSING}</span></Row>
            {running != null && cap != null && running >= cap && <Row label="说明"><span className="text-jz-amber">已达上限,新任务会被拒绝。</span></Row>}
          </dl>
        )}
      </Panel>
    </div>
  );
};
