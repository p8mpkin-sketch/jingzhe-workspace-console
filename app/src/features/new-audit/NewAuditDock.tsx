// NewAuditDock.tsx — right column of the new assessment page: pre-check result and launch summary.
// Presentational only: state and handlers come from NewAuditPage. All data-* hooks are kept.
import React from 'react';
import { Package, FileSearch, Shield, DoorOpen, ListChecks, Loader2 } from 'lucide-react';
import { Button, Badge, StatusBadge, Tag, CodePill, Panel, Checkbox, InlineAlert, SegmentedControl, cx } from '@/components/ui';
import { PipelineStepper } from '@/components/ui/PipelineStepper';
import type { StepperPhase } from '@/components/ui/PipelineStepper';

// What the pre-check returns once an asset is provided. Descriptions only, no data.
const PREVIEW_CAPS: Array<{ icon: React.ElementType; title: string; desc: string }> = [
  { icon: FileSearch, title: '包结构与签名指纹', desc: '包名、版本、ABI 和 SHA256' },
  { icon: Shield, title: '加固识别', desc: '加固类型的初步判断,仅作展示' },
  { icon: DoorOpen, title: '导出组件与权限', desc: '四类组件的导出数量和权限条目数' },
  { icon: ListChecks, title: '推荐模块', desc: '根据预检结果标出建议勾选的模块' },
];

export type RecItem = { name: string; rec: boolean; basis: string };

const KeyVal: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex min-w-0 items-baseline justify-between gap-2">
    <dt className="flex-none text-jz-muted">{label}</dt>
    <dd className="truncate font-mono tnum text-jz-ink">{children}</dd>
  </div>
);

// ─── Pre-check result ───

export const ParseBoard: React.FC<{
  preview: any | null; previewing: boolean;
  recs: RecItem[]; applyRecs: () => void;
}> = ({ preview, previewing, recs, applyRecs }) => {
  const meta = preview?.meta || null;
  const comp = meta?.components || {};
  const strong = !!preview?.strong_shell;
  return (
    <Panel title="预检结果" data-parse-board
      actions={(
        <>
          {!preview && !previewing && <StatusBadge tone="neutral">等待资产</StatusBadge>}
          {previewing && <StatusBadge tone="brand">预检中</StatusBadge>}
          {preview && !previewing && (meta
            ? <StatusBadge tone="success">预检完成</StatusBadge>
            : <StatusBadge tone="attention" title={preview.meta_error || 'manifest 解析失败'}>部分完成</StatusBadge>)}
        </>
      )}>
      {!preview && !previewing && (
        <div data-parse-skeleton data-cap-grid>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PREVIEW_CAPS.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="rounded-card border border-dashed border-jz-border px-3 py-2.5" data-cap-card={title}>
                <div className="flex items-center gap-2">
                  <Icon size={14} aria-hidden className="flex-none text-jz-muted" />
                  <span className="text-label font-semibold text-jz-ink-2">{title}</span>
                </div>
                <p className="mt-1 text-meta text-jz-muted">{desc}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-meta text-jz-muted">在左侧提供资产后,这里显示预检结果。</p>
        </div>
      )}

      {previewing && (
        <div className="flex items-center justify-center gap-2 rounded-card bg-jz-surface-2 px-4 py-6 text-label text-jz-muted" role="status" data-parse-scanning>
          <Loader2 size={16} aria-hidden className="animate-spin motion-reduce:animate-none" />
          正在预检:加固检测、manifest 元数据、ABI
        </div>
      )}

      {preview && (
        <div className="divide-y divide-jz-border" data-asset-board>
          <div className="flex items-start gap-3 pb-4">
            <span aria-hidden className="grid h-10 w-10 flex-none place-items-center rounded-card bg-jz-brand-soft text-section font-semibold text-jz-brand">
              {(meta?.app_name || preview.filename || 'A').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-section font-semibold text-jz-ink" title={meta?.app_name || preview.filename}>
                {meta?.app_name || preview.filename}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {meta?.package
                  ? <CodePill value={meta.package} textCls="text-meta" />
                  : <span className="font-mono text-meta text-jz-muted">没有包名(元数据不完整)</span>}
                {preview.platform && preview.platform !== 'android' && (
                  <span data-preview-pf><Tag>{preview.platform === 'harmony' ? '鸿蒙' : 'iOS'}</Tag></span>
                )}
                {meta?.platform === 'harmony' && meta.harden && (
                  <Tag title="鸿蒙加固的初步判断,只区分无迹象和疑似">加固初判:{meta.harden === 'suspected' ? '疑似' : '无迹象'}</Tag>
                )}
                {meta?.platform === 'ios' && (
                  <StatusBadge tone={meta.fairplay_encrypted ? 'attention' : 'success'}
                    title={meta.fairplay_encrypted ? 'App Store FairPlay 加密(cryptid=1):代码段为密文,静态分析范围受限,解密需要设备' : '未加密(企业签名、TestFlight 或重签),可完整静态分析'}>
                    {meta.fairplay_encrypted ? `FairPlay 加密(cryptid=${meta.cryptid})` : `cryptid=${meta.cryptid} 未加密`}
                  </StatusBadge>
                )}
              </div>
            </div>
            {strong
              ? <StatusBadge tone="attention" title={`加固类型:${preview.packer}(仅展示,不写入授权字段)`}>加固:{preview.packer}</StatusBadge>
              : <StatusBadge tone="success">未检测到已知加固</StatusBadge>}
          </div>

          <div className="space-y-2 py-4">
            <h4 className="text-label font-semibold text-jz-ink">包结构</h4>
            <div className="space-y-1 overflow-x-auto rounded-control bg-jz-surface-2 px-3 py-2 font-mono text-meta" data-pkg-tree>
              <div className="flex flex-wrap items-center gap-1.5" data-tree-node="root">
                <Package size={12} aria-hidden className="flex-none text-jz-muted" />
                <span className="break-all text-jz-ink">{meta?.package || preview.filename || '—'}</span>
                {meta && <span className="tnum text-jz-muted">v{meta.version_name ?? '—'} ({meta.version_code ?? '—'})</span>}
              </div>
              {(preview.abis || []).length ? (
                <div className="flex flex-wrap items-center gap-1.5 pl-4" data-tree-node="lib">
                  <span className="text-jz-muted">└ lib/</span>
                  {preview.abis.map((a: string) => <Tag key={a} mono>{a}</Tag>)}
                </div>
              ) : (
                <div className="pl-4 text-jz-muted" data-tree-node="lib">└ lib/ 没有原生库</div>
              )}
              {meta && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-4" data-tree-node="manifest"
                  title="来自 AndroidManifest 的静态解析:前一个数是声明总数,导出数是 exported 或带 intent-filter 的组件数">
                  <span className="text-jz-muted">└ AndroidManifest</span>
                  {(['activity', 'service', 'receiver', 'provider'] as const).map((t) => (
                    <span key={t} className="tnum text-jz-ink-2">{t} {comp[t]?.total ?? 0}<span className="text-jz-muted">(导出 {comp[t]?.exported ?? 0})</span></span>
                  ))}
                </div>
              )}
              {meta && (
                <div className="pl-4 text-jz-muted" data-tree-node="perm"
                  title="manifest 中声明的 uses-permission 条目数,不含自定义 permission 定义">└ 权限 {meta.permissions_count} 项</div>
              )}
            </div>
            <p className="text-meta text-jz-muted">这里只列出预检返回的内容,不是完整的目录树。</p>
          </div>

          {strong && (
            <div className="py-4">
              <InlineAlert tone="attention" data-shell-warning>
                检测到加固 {preview.packer}。提交后会先脱壳再分析。加固信息不写入任务的授权字段。
              </InlineAlert>
            </div>
          )}

          <div className="space-y-2 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-label font-semibold text-jz-ink">推荐模块</h4>
              <Button size="sm" variant="secondary" onClick={applyRecs} data-rec-apply-btn
                title="把带“推荐”标记的模块设为当前勾选范围。没有可推荐的模块时会提示。">
                应用推荐模块
              </Button>
            </div>
            <ul className="flex flex-wrap gap-1.5" data-rec-modules>
              {recs.map((r) => (
                <li key={r.name} data-rec-module={r.name} title={r.basis}
                  className={cx('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta',
                    r.rec ? 'border-jz-brand bg-jz-brand-soft text-jz-ink' : 'border-jz-border text-jz-ink-2')}>
                  {r.name}
                  <span className={r.rec ? 'font-semibold text-jz-brand' : 'text-jz-muted'}>{r.rec ? '推荐' : '默认纳入'}</span>
                </li>
              ))}
            </ul>
            <p className="text-meta text-jz-muted">“推荐”只依据预检结果(导出组件数大于 0)。其余模块默认纳入。静态评估始终按平台的全部规则执行,不受勾选影响。</p>
          </div>

          <div className="space-y-2 pt-4">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-label sm:grid-cols-2">
              <KeyVal label="版本">{meta ? `${meta.version_name ?? '—'} (${meta.version_code ?? '—'})` : '—'}</KeyVal>
              <KeyVal label="SDK 范围">{meta ? `min ${meta.min_sdk ?? '—'} · target ${meta.target_sdk ?? '—'}` : '—'}</KeyVal>
              <KeyVal label="大小">{preview.size_mb ? `${preview.size_mb}MB` : '—'}</KeyVal>
              <KeyVal label="权限数">{meta ? meta.permissions_count : '—'}</KeyVal>
            </dl>
            <p className="break-all font-mono text-meta text-jz-muted" title={preview.sha256 ? `SHA256: ${preview.sha256}` : undefined}>
              SHA256 {preview.sha256 ? preview.sha256.slice(0, 16) + '…' : '—'}
              {preview.meta_error ? ` · 元数据不完整: ${preview.meta_error}` : ''}
            </p>
          </div>
        </div>
      )}
    </Panel>
  );
};

// ─── Launch summary ───

export const LaunchDock: React.FC<{
  preview: any | null; apkPath: string;
  mode: string; baseline: string; rateLimit: number;
  device: string; staticOnly: boolean;
  blueprint: StepperPhase[];
  authorized: boolean; setAuthorized: (v: boolean) => void;
  busy: boolean; webTargetErr: string;
  submit: (gotoPentest: boolean) => void;
  status: string; createdId: number | null;
}> = (p) => {
  const [after, setAfter] = React.useState<'tasks' | 'pentest'>('tasks');
  const launchDisabled = p.busy || !p.preview || !p.authorized || !!p.webTargetErr;
  const blocker = !p.preview ? '先在第 1 步提供资产并完成预检。'
    : p.webTargetErr ? 'Web 目标的格式不正确。'
    : !p.authorized ? '请先确认测试授权。' : '';
  return (
    <Panel title="确认并创建" description="创建前核对资产、模式和设备" data-launch-dock>
      <div className="space-y-4">
        <dl className="divide-y divide-jz-border rounded-card border border-jz-border text-label" data-summary-list>
          <div className="flex items-start justify-between gap-3 px-3 py-2" data-summary-asset>
            <dt className="flex-none text-jz-muted">资产</dt>
            <dd className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 break-all text-right font-mono text-jz-ink">
              {p.preview?.filename || (p.apkPath ? p.apkPath.split('/').pop() : '') || <span className="font-sans text-jz-muted">尚未提供</span>}
              {p.preview?.strong_shell && <Badge level="medium">加固</Badge>}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3 px-3 py-2" data-summary-mode>
            <dt className="flex-none text-jz-muted">模式</dt>
            <dd className="min-w-0 text-right text-jz-ink" title={`${p.mode} · ${p.baseline} · ${p.rateLimit} req/s`}>
              {p.mode} · {p.baseline} · <span className="font-mono tnum">{p.rateLimit} req/s</span>
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3 px-3 py-2" data-summary-device>
            <dt className="flex-none text-jz-muted">设备</dt>
            <dd className={cx('min-w-0 break-all text-right', p.device ? 'font-mono text-jz-ink' : 'text-jz-muted')}>
              {p.device || (p.staticOnly ? '静态评估不需要设备' : '未选择(动态阶段需要真机)')}
            </dd>
          </div>
        </dl>

        <div className="space-y-1.5" data-exec-blueprint>
          <h4 className="text-label font-semibold text-jz-ink">执行阶段</h4>
          <PipelineStepper phases={p.blueprint} />
          <p className="text-meta text-jz-muted">
            预检已在本页完成,其余阶段在任务创建后执行{p.device ? `,设备 ${p.device} 优先用于动态脱壳` : ''}。实际进度以任务页为准。
          </p>
        </div>

        <div className="space-y-1.5" data-exec-outputs>
          <h4 className="text-label font-semibold text-jz-ink">将产出</h4>
          <ul className="space-y-1 text-label text-jz-ink-2">
            <li>任务队列中的一条评估任务,进度在任务页跟踪</li>
            <li>规则扫描得到的发现,以及任务完成后生成的评估报告</li>
            <li>{p.preview?.strong_shell ? '脱壳、反编译和扫描的任务产物' : '反编译和扫描的任务产物'}</li>
            <li>设备、范围和模式的预选会保存在本机,供渗透会话沿用</li>
          </ul>
        </div>

        <Checkbox checked={p.authorized} onChange={(e) => p.setAuthorized(e.target.checked)} data-authorized-check
          label="我确认对该样本拥有合法的测试授权" hint="确认记录会随任务保存。" />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2" data-after-create>
            <span className="text-label text-jz-ink-2">创建后前往</span>
            <SegmentedControl label="创建后前往" value={after} onChange={setAfter}
              items={[
                { key: 'tasks', label: '任务队列', dataAttrs: { 'data-after-tasks': '' } },
                { key: 'pentest', label: '渗透会话', dataAttrs: { 'data-submit-pentest': '' } },
              ]} />
          </div>
          <Button variant="primary" size="lg" className="w-full justify-center" loading={p.busy}
            onClick={() => p.submit(after === 'pentest')} disabled={launchDisabled} data-launch-btn data-submit-task
            title={launchDisabled ? blocker || '正在处理' : '创建评估任务,并保存设备、范围和模式的预选'}>
            {p.busy ? '创建中…' : '创建评估任务'}
          </Button>
          {launchDisabled && !p.busy && blocker && <p className="text-meta text-jz-muted" data-launch-blocker>{blocker}</p>}
        </div>

        {p.status && <p className="text-label text-jz-ink-2" role="status" data-status-line>{p.status}</p>}
        {p.createdId != null && <p className="text-label text-jz-teal" data-created-line>任务 #{p.createdId} 已创建,正在前往{after === 'pentest' ? '渗透会话' : '任务队列'}…</p>}
      </div>
    </Panel>
  );
};
