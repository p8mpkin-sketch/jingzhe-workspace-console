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
  { key: 'tasks_total', label: '接入 APK', hint: '可读 V2 task', icon: GitBranch, tone: 'text-jz-brand' },
  { key: 'candidates_total', label: '候选路径', hint: 'Property-gated', icon: Radar, tone: 'text-jz-brand' },
  { key: 'confirmed_total', label: 'Confirmed', hint: 'Verifier passed', icon: ShieldCheck, tone: 'text-jz-teal' },
  { key: 'unresolved_total', label: '未决', hint: 'No dynamic evidence', icon: CircleAlert, tone: 'text-jz-sev-medium' },
] as const;

const toneForStage = (state: string) =>
  state === 'done' ? 'bg-jz-teal/15 text-jz-teal border-jz-teal/40'
    : state === 'active' ? 'bg-jz-brand/15 text-jz-brand border-jz-brand/40'
      : 'bg-jz-surface-2 text-jz-muted border-jz-border/50';

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
    return <div className="p-6 text-body text-jz-sev-critical" data-discovery-error>{error}</div>;
  }
  if (!data) {
    return <div className="p-6 text-body text-jz-muted" data-discovery-loading>加载 V2 discovery…</div>;
  }

  const real = data.real_confirmed;
  const synthetic = data.synthetic_confirmed;

  return (
    <div className="h-full overflow-y-auto" data-discovery-page>
      <div className="max-w-[1320px] mx-auto px-5 py-5 space-y-4">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-meta font-mono text-jz-brand">
              <Sparkles size={12} /> AGENT / V2 DISCOVERY
            </div>
            <h1 className="mt-1 text-title leading-8 font-semibold text-jz-ink">
              漏洞发现管线
            </h1>
            <p className="mt-1 text-meta text-jz-muted">
              Property → Hypothesis → Graph → Planner → Oracle → Verifier。只有通过证据门的候选才进入 confirmed。
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-card bg-jz-surface border border-jz-border/50 shadow-card">
            <span className="w-2 h-2 rounded-pill bg-jz-teal" />
            <span className="text-meta text-jz-ink-2">证据门开启</span>
            <span className="text-meta font-mono text-jz-teal">{real} real</span>
            <span className="text-jz-muted">/</span>
            <span className="text-meta font-mono text-jz-muted">{synthetic} synthetic</span>
          </div>
        </header>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-discovery-kpis>
          {KPI.map(({ key, label, hint, icon: Icon, tone }) => (
            <div key={key} className="rounded-panel bg-jz-surface border border-jz-border/50 p-3.5 shadow-card" data-discovery-kpi={key}>
              <div className="flex items-center justify-between">
                <span className="text-meta uppercase text-jz-muted">{label}</span>
                <Icon size={15} className={tone} />
              </div>
              <div className={`mt-2 text-page leading-7 font-semibold font-mono tnum ${tone}`} data-discovery-value={key}>
                {data[key as keyof Overview] as number}
              </div>
              <div className="mt-1 text-meta text-jz-muted">{hint}</div>
            </div>
          ))}
        </section>

        <section className="rounded-panel bg-jz-surface border border-jz-border/50 p-4 shadow-card" data-discovery-pipeline>
          <div className="flex items-center justify-between mb-3">
            <div className="text-meta font-semibold text-jz-ink">Agent Pipeline</div>
            <div className="text-meta font-mono text-jz-muted">2 / 15 APK 有真实 confirmed</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 gap-y-1.5 pb-1">
            {data.pipeline.map((s, i) => (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border text-meta whitespace-nowrap ${toneForStage(s.state)}`} data-discovery-stage={s.id}>
                  <span className="font-mono text-meta opacity-70">{String(i + 1).padStart(2, '0')}</span>
                  {s.label}
                </div>
                {i < data.pipeline.length - 1 && <ArrowRight size={12} className="text-jz-muted flex-none" />}
              </React.Fragment>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-4">
          <div className="rounded-panel bg-jz-surface border border-jz-border/50 shadow-card overflow-hidden" data-discovery-confirmed>
            <div className="px-4 py-3 border-b border-jz-border/40 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-jz-teal" />
                <span className="text-label font-semibold text-jz-ink">Confirmed Evidence</span>
                <span className="text-meta font-mono text-jz-muted">{rows.length}</span>
              </div>
              <div className="flex items-center gap-1">
                {([['all', '全部'], ['real', 'Real'], ['synthetic', 'Synthetic']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} data-discovery-filter={k}
                    className={`px-2 py-1 rounded-control text-meta ${filter === k ? 'bg-jz-brand/15 text-jz-brand' : 'text-jz-muted hover:bg-jz-surface-2'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-meta uppercase text-jz-muted">
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
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-meta text-jz-muted">当前筛选无 confirmed</td></tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.finding_id || r.hypothesis_id} className="border-t border-jz-border/30 hover:bg-jz-surface-2/40" data-discovery-row={r.hypothesis_id}>
                      <td className="px-4 py-2.5">
                        <div className="text-meta font-mono text-jz-ink">{shortId(r.hypothesis_id)}</div>
                        <div className="text-meta text-jz-muted truncate max-w-[220px]">{r.source || 'device source'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-meta text-jz-ink-2">{shortTask(r.task)}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-control text-meta font-semibold ${r.synthetic ? 'bg-jz-sev-medium/15 text-jz-sev-medium' : 'bg-jz-teal/15 text-jz-teal'}`}>
                          {r.synthetic ? <FlaskConical size={10} /> : <ShieldCheck size={10} />}
                          {r.synthetic ? 'synthetic' : r.provenance}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-meta text-jz-muted">
                        <span className="inline-flex items-center gap-1"><Smartphone size={10} /> {r.device || '—'}</span>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-2.5 text-right text-meta font-mono text-jz-muted">{r.proof_level || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-panel bg-jz-surface border border-jz-border/50 p-4 shadow-card" data-discovery-provenance>
              <div className="flex items-center gap-2 text-meta font-semibold text-jz-ink">
                <Activity size={14} className="text-jz-brand" /> Provenance
              </div>
              <div className="mt-3 space-y-2">
                {[
                  ['real', real, 'bg-jz-teal'],
                  ['synthetic', synthetic, 'bg-jz-sev-medium'],
                  ['silver', data.silver_total, 'bg-jz-brand/60'],
                ].map(([label, n, cls]) => (
                  <div key={String(label)} className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-pill ${cls}`} />
                    <span className="text-meta text-jz-ink-2 capitalize">{label}</span>
                    <span className="flex-1" />
                    <span className="text-meta font-mono text-jz-muted">{n as number}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-jz-border/30 text-meta text-jz-muted leading-relaxed">
                confirmed 只来自 Oracle + Verifier；synthetic 已标记，未当真实设备值。
              </div>
            </div>

            <div className="rounded-panel bg-jz-surface border border-jz-border/50 p-4 shadow-card" data-discovery-unresolved>
              <div className="flex items-center gap-2 text-meta font-semibold text-jz-ink">
                <CircleAlert size={14} className="text-jz-sev-medium" /> 未决候选
              </div>
              <div className="mt-2 text-page font-mono font-semibold text-jz-sev-medium tnum">{data.unresolved_total}</div>
              <div className="text-meta text-jz-muted">缺少动态证据；不进入 confirmed</div>
              <div className="mt-3 space-y-1.5">
                {data.tasks.slice(0, 4).map((t) => (
                  <div key={t.task} className="flex items-center gap-2 text-meta">
                    <span className="text-jz-ink-2 truncate">{shortTask(t.task)}</span>
                    <span className="flex-1" />
                    <span className="font-mono text-jz-muted">{t.dataflow}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="text-meta text-jz-muted px-1 pb-2">
          口径：candidates = dataflow hypotheses；confirmed = Oracle pass + independent verifier；real/synthetic 按证据来源区分。
        </div>
      </div>
    </div>
  );
};
