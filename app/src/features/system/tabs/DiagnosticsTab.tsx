// DiagnosticsTab.tsx — 诊断: resource usage (GET /api/system/resource-stats, read when the tab opens) and the
// feedback on assistant suggestions (GET /api/feedback, read with the page's first load as before).
// A field the backend did not return says 未返回; nothing missing is computed as 0 or throws.
import React from 'react';
import { Metric, Panel } from '@/components/ui';
import { hasValue } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import { MISSING, ReadBlock, StaleLine, num } from './sysShared';

const fmtTok = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

export const ResourceStats: React.FC<{ read: Read<any> }> = ({ read }) => {
  const block = <ReadBlock read={read} what="资源用量" skeleton="metrics" />;
  if (!hasValue(read)) return <Panel title="资源用量" data-resource-stats>{block}</Panel>;
  const s = read.value || {};
  const pin = num(s.llm?.prompt_tokens_30d), pout = num(s.llm?.completion_tokens_30d), calls = num(s.llm?.calls_30d);
  const runs = num(s.disk?.runs_mb), pool = num(s.disk?.apk_pool_mb), db = num(s.disk?.db_mb), quota = num(s.disk?.quota_storage_mb);
  const running = num(s.slots?.running), cap = num(s.slots?.quota_concurrent);
  const diskParts = [runs, pool, db];
  const diskTotal = diskParts.every((x) => x != null) ? (runs! + pool! + db!) : null;
  const full = running != null && cap != null && running >= cap;
  return (
    <div className="space-y-3" data-resource-stats>
      <StaleLine read={read} what="资源用量" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 desktop:gap-4">
        <Metric label="已用 Token(近 30 天)" data-resource="tokens"
          title="近 30 天所有模型调用回传的输入和输出 Token 合计。没有回传用量的调用不计入。"
          value={pin != null && pout != null ? fmtTok(pin + pout) : MISSING}
          hint={<>输入 {pin != null ? fmtTok(pin) : MISSING} · 输出 {pout != null ? fmtTok(pout) : MISSING} · {calls != null ? <><span className="tnum">{calls}</span> 次调用</> : `调用次数${MISSING}`}</>} />
        <Metric label="磁盘占用" data-resource="disk"
          title={`任务产物、安装包池和数据库三处的占用。后台每 10 分钟重新计算一次${s.disk?.computed_at ? `,当前数据计算于 ${s.disk.computed_at}` : ''}。${quota != null && quota >= 0 ? `组织配额 ${quota}MB。` : quota != null ? '组织没有设置配额。' : ''}`}
          value={s.disk?.computing ? <span className="text-section text-jz-muted" data-disk-computing>正在计算</span> : diskTotal != null ? `${diskTotal} MB` : MISSING}
          hint={s.disk?.computing ? '后台计算中,约 1–2 分钟后刷新查看'
            : <>产物 {runs ?? MISSING} · 安装包 {pool ?? MISSING} · 数据库 {db ?? MISSING}{quota != null && quota >= 0 ? ` · 配额 ${quota}MB` : ''}</>} />
        <Metric label="并发" tone={full ? 'attention' : 'default'} data-resource="slots"
          title="正在运行和排队的任务数,对比组织允许的最大并发数。达到上限后新任务会被拒绝。"
          value={running != null && cap != null ? `${running}/${cap}` : MISSING}
          hint={running == null || cap == null ? '接口没有返回并发占用或配额' : full ? '已达上限,新任务会被拒绝' : '运行中和排队的任务 / 最大并发'} />
      </div>
      <p className="text-meta text-jz-muted">Token 和并发是请求时的实时数值;磁盘是后台每 10 分钟计算一次的结果{s.disk?.computed_at ? `(计算于 ${s.disk.computed_at})` : ''}。“{MISSING}”表示接口没有给这个字段,不按 0 计。</p>
    </div>
  );
};

export const DiagnosticsTab: React.FC<{ stats: Read<any>; feedback: React.ReactNode }> = ({ stats, feedback }) => (
  <div className="space-y-6" data-system-diagnostics>
    <ResourceStats read={stats} />
    {feedback}
  </div>
);
