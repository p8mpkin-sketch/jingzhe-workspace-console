import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, CheckCircle2, CircleAlert, FlaskConical,
  GitBranch, Radar, ShieldCheck, Smartphone, Sparkles,
} from 'lucide-react';
import { api } from '@/services/api';

type Confirmed = {
  hypothesis_id: string;
  task: string;
  provenance: string;
  device: string;
  finding_id: string;
  proof_level: string;
  synthetic: boolean;
  source: string;
};
type TaskRow = { task: string; paths: number; dataflow: number };
type Stage = { id: string; label: string; state: string };
type Overview = {
  tasks_total: number;
  candidates_total: number;
  confirmed_total: number;
  real_confirmed: number;
  synthetic_confirmed: number;
  silver_total: number;
  unresolved_total: number;
  apk_with_confirmed: number;
  sink_families: number;
  tasks: TaskRow[];
  confirmed: Confirmed[];
  pipeline: Stage[];
};

const KPI = [
  { key: 'tasks_total', label: '接入 APK', hint: '可读 V2 task', icon: GitBranch, tone: 'text-jz-accent-cyan' },
  { key: 'candidates_total', label: '候选路径', hint: 'Property-gated', icon: Radar, tone: 'text-neon-accent' },
  { key: 'confirmed_total', label: 'Confirmed', hint: 'Verifier passed', icon: ShieldCheck, tone: 'text-vuln-safe' },
  { key: 'unresolved_total', label: '未决', hint: 'No dynamic evidence', icon: CircleAlert, tone: 'text-vuln-medium' },
] as const;

const toneForStage = (state: string) =>
  state === 'done' ? 'bg-vuln-safe/15 text-vuln-safe border-vuln-safe/40'
    : state === 'active' ? 'bg-neon-accent/15 text-neon-accent border-neon-accent/40'
      : 'bg-jz-elevated text-jz-text-muted border-jz-border/50';

const shortTask = (s: string) => s.replace(/^com\./, '').replace(/\.(consultant|zhenbaoxian|browser)$/, '');
const shortId = (s: string) => s.length > 22 ? s.slice(0, 12) + '…' + s.slice(-6) : s;

export const DiscoveryPage: React.FC = () => {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'real' | 'synthetic'>('all');

  useEffect(() => {
    api<Overview>('/api/v2/overview')
      .then(setData)
      .catch((e) => setError(e?.message || '加载失败'));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.confirmed.filter((r) => filter === 'all' || (filter === 'synthetic' ? r.synthetic : !r.synthetic));
  }, [data, filter]);

  if (error) {
    return <div className="p-6 text-sm text-vuln-critical" data-discovery-error>{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-sm text-jz-text-muted" data-discovery-loading>加载 V2 discovery…</div>;
  }

  const real = data.real_confirmed;
  const synthetic = data.synthetic_confirmed;

  return (
    <div className="h-full overflow-y-auto" data-discovery-page>
      <div className="max-w-[1320px] mx-auto px-5 py-5 space-y-4">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.2em] text-neon-accent">
              <Sparkles size={12} /> AGENT / V2 DISCOVERY
            </div>
            <h1 className="mt-1 text-[23px] leading-8 font-semibold text-jz-text-primary">
              漏洞发现管线
            </h1>
            <p className="mt-1 text-[12px] text-jz-text-muted">
              Property → Hypothesis → Graph → Planner → Oracle → Verifier。只有通过证据门的候选才进入 confirmed。
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-jz-surface border border-jz-border/50 shadow-jz-card">
            <span className="w-2 h-2 rounded-full bg-vuln-safe animate-breathe" />
            <span className="text-[12px] text-jz-text-secondary">证据门开启</span>
            <span className="text-[11px] font-mono text-vuln-safe">{real} real</span>
            <span className="text-jz-text-muted">/</span>
            <span className="text-[11px] font-mono text-jz-text-muted">{synthetic} synthetic</span>
          </div>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-discovery-kpis>
          {KPI.map(({ key, label, hint, icon: Icon, tone }) => (
            <div key={key} className="rounded-2xl bg-jz-surface border border-jz-border/50 p-3.5 shadow-jz-card" data-discovery-kpi={key}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-jz-text-muted">{label}</span>
                <Icon size={15} className={tone} />
              </div>
              <div className={`mt-2 text-[26px] leading-7 font-semibold font-mono tnum ${tone}`} data-discovery-value={key}>
                {data[key as keyof Overview] as number}
              </div>
              <div className="mt-1 text-[11px] text-jz-text-muted">{hint}</div>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-jz-surface border border-jz-border/50 p-4 shadow-jz-card" data-discovery-pipeline>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[12px] font-semibold text-jz-text-primary">Agent Pipeline</div>
            <div className="text-[11px] font-mono text-jz-text-muted">2 / 15 APK 有真实 confirmed</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 gap-y-1.5 pb-1">
            {data.pipeline.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] whitespace-nowrap ${toneForStage(s.state)}`} data-discovery-stage={s.id}>
                  <span className="font-mono text-[10px] opacity-70">{String(i + 1).padStart(2, '0')}</span>
                  {s.label}
                </div>
                {i < data.pipeline.length - 1 && <ArrowRight size={12} className="text-jz-text-muted/50 flex-none" />}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4">
          <div className="rounded-2xl bg-jz-surface border border-jz-border/50 shadow-jz-card overflow-hidden" data-discovery-confirmed>
            <div className="px-4 py-3 border-b border-jz-border/40 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-vuln-safe" />
                <span className="text-[13px] font-semibold text-jz-text-primary">Confirmed Evidence</span>
                <span className="text-[11px] font-mono text-jz-text-muted">{rows.length}</span>
              </div>
              <div className="flex items-center gap-1">
                {([['all', '全部'], ['real', 'Real'], ['synthetic', 'Synthetic']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} data-discovery-filter={k}
                    className={`px-2 py-1 rounded-md text-[11px] ${filter === k ? 'bg-neon-accent/15 text-neon-accent' : 'text-jz-text-muted hover:bg-jz-elevated'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase tracking-wider text-jz-text-muted/70">
                  <tr>
                    <th className="px-4 py-2 font-medium">Hypothesis</th>
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Evidence</th>
                    <th className="hidden lg:table-cell px-3 py-2 font-medium">Device</th>
                    <th className="hidden lg:table-cell px-4 py-2 font-medium text-right">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-[12px] text-jz-text-muted">当前筛选无 confirmed</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.finding_id || r.hypothesis_id} className="border-t border-jz-border/30 hover:bg-jz-elevated/40" data-discovery-row={r.hypothesis_id}>
                      <td className="px-4 py-2.5">
                        <div className="text-[12px] font-mono text-jz-text-primary">{shortId(r.hypothesis_id)}</div>
                        <div className="text-[10px] text-jz-text-muted truncate max-w-[220px]">{r.source || 'device source'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-jz-text-secondary">{shortTask(r.task)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.synthetic ? 'bg-vuln-medium/15 text-vuln-medium' : 'bg-vuln-safe/15 text-vuln-safe'}`}>
                          {r.synthetic ? <FlaskConical size={10} /> : <ShieldCheck size={10} />}
                          {r.synthetic ? 'synthetic' : r.provenance}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-[11px] text-jz-text-muted">
                        <span className="inline-flex items-center gap-1"><Smartphone size={10} /> {r.device || '—'}</span>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-2.5 text-right text-[10px] font-mono text-jz-text-muted">{r.proof_level || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl bg-jz-surface border border-jz-border/50 p-4 shadow-jz-card" data-discovery-provenance>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-jz-text-primary">
                <Activity size={14} className="text-neon-accent" /> Provenance
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ['real', real, 'bg-vuln-safe'],
                  ['synthetic', synthetic, 'bg-vuln-medium'],
                  ['silver', data.silver_total, 'bg-neon-accent/60'],
                ].map(([label, n, cls]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${cls}`} />
                    <span className="text-[11px] text-jz-text-secondary capitalize">{label}</span>
                    <span className="flex-1" />
                    <span className="text-[11px] font-mono text-jz-text-muted">{n as number}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-jz-border/30 text-[10px] text-jz-text-muted leading-relaxed">
                confirmed 只来自 Oracle + Verifier；synthetic 已标记，未当真实设备值。
              </div>
            </div>

            <div className="rounded-2xl bg-jz-surface border border-jz-border/50 p-4 shadow-jz-card" data-discovery-unresolved>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-jz-text-primary">
                <CircleAlert size={14} className="text-vuln-medium" /> 未决候选
              </div>
              <div className="mt-2 text-[28px] font-mono font-semibold text-vuln-medium tnum">{data.unresolved_total}</div>
              <div className="text-[11px] text-jz-text-muted">缺少动态证据；不进入 confirmed</div>
              <div className="mt-3 space-y-1.5">
                {data.tasks.slice(0, 4).map((t) => (
                  <div key={t.task} className="flex items-center gap-2 text-[11px]">
                    <span className="text-jz-text-secondary truncate">{shortTask(t.task)}</span>
                    <span className="flex-1" />
                    <span className="font-mono text-jz-text-muted">{t.dataflow}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="text-[10px] text-jz-text-muted/70 px-1 pb-2">
          口径：candidates = dataflow hypotheses；confirmed = Oracle pass + independent verifier；real/synthetic 按证据来源区分。
        </div>
      </div>
    </div>
  );
};
