// NewAuditSections.tsx — left column of the new assessment page: 1 asset, 2 scope and mode, 3 device.
// Presentational only: every value and handler comes from NewAuditPage. All data-* hooks are kept.
import React from 'react';
import {
  Upload, HardDrive, Search, FolderOpen, Smartphone, History, ChevronDown, ChevronLeft, ChevronRight,
  Package, RefreshCw, Activity, Wrench, Download, Check, FileUp, FileDown,
} from 'lucide-react';
import {
  Button, IconButton, Badge, StatusBadge, Tag, Panel, Input, Textarea, Checkbox, Radio, SearchField, InlineAlert, EmptyState, PermissionState, cx,
} from '@/components/ui';

export type Channel = 'upload' | 'path' | 'search' | 'batch';
export type BatchItem = { name: string; size: number; status: 'uploading' | 'done' | 'failed'; apkPath?: string; err?: string };
export type PoolRow = { key: string; pkg: string; path: string; size: number; taskId?: number; appName?: string };

/** Numbered section title: the number matches the readiness steps in the page header. */
export const ModuleHead: React.FC<{ no: string; title: string }> = ({ no, title }) => (
  <span className="flex items-center gap-2">
    <span aria-hidden className="grid h-6 w-6 flex-none place-items-center rounded-pill bg-jz-surface-2 font-mono text-meta font-semibold text-jz-ink-2">{no}</span>
    {title}
  </span>
);

/** A selectable card (channel, preset, baseline, device). Selected = brand border on brand-soft. */
const choice = (on: boolean) => cx(
  'rounded-card border text-left transition-colors duration-hover',
  on ? 'border-jz-brand bg-jz-brand-soft' : 'border-jz-border bg-jz-surface hover:border-jz-border-strong hover:bg-jz-surface-2',
);
const SubHead: React.FC<{ title: string; hint?: React.ReactNode; aside?: React.ReactNode }> = ({ title, hint, aside }) => (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-label font-semibold text-jz-ink">{title}</h4>
      {aside}
    </div>
    {hint && <p className="mt-0.5 text-meta text-jz-muted">{hint}</p>}
  </div>
);
const mb = (n: number, d = 1) => `${(n / 1048576).toFixed(d)} MB`;

// ─── 1 Asset: four channels, upload drop zone, batch queue, cached samples ───

const CHANNELS: Array<[Channel, string, string, React.ElementType]> = [
  ['upload', '本地上传', '拖入或选择安装包', Upload],
  ['path', '服务器路径', '服务器磁盘上已有的文件', HardDrive],
  ['search', '在线搜索', '按应用名搜索并下载', Search],
  ['batch', '批量目录', '对整个目录批量脱壳', FolderOpen],
];

const SRC_LABELS: Record<string, string> = { appchina: '应用汇', wandoujia: '豌豆荚', myapp: '应用宝', vivo: 'Vivo' };
const UPLOAD_EXTS = ['.apk', '.xapk', '.hap', '.app', '.ipa'];

export const AssetSection: React.FC<{
  channel: Channel; setChannel: (c: Channel) => void;
  busy: boolean; previewing: boolean;
  dragActive: boolean; setDragActive: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  batchUp: BatchItem[] | null; batchAuthorized: boolean; setBatchAuthorized: (v: boolean) => void;
  batchCreating: boolean; batchCreate: () => void;
  poolOpen: boolean; togglePool: () => void;
  poolQ: string; setPoolQ: (v: string) => void;
  poolRows: PoolRow[]; poolTotal: number;
  reusePoolRow: (c: PoolRow) => void;
  apkPath: string; setApkPath: (v: string) => void; pathErr: string; runPreview: (p: string) => void;
  appName: string; setAppName: (v: string) => void;
  results: any[]; searching: boolean; degraded: boolean;
  srcFilter: string; setSrcFilter: (v: string) => void;
  searchPage: number; setSearchPage: (p: number) => void;
  doSearch: () => void; doDownload: (r: any, i: number) => void;
  dlIdx: number | null;
  cachedFor: (r: any) => any; partFor: (r: any) => any;
  batchDir: string; setBatchDir: (v: string) => void; batchErr: string;
  batchList: any[]; scanBatchDir: () => void; batchUnpack: () => void;
}> = (p) => {
  const doneN = p.batchUp ? p.batchUp.filter((it) => it.status === 'done').length : 0;
  return (
    <Panel id="na-section-asset" data-wizard-step1 title={<ModuleHead no="1" title="资产来源" />}
      description="文件上传或路径命中后自动做静态预检,结果显示在“预检结果”里">
      <div className="space-y-4">
        <div role="radiogroup" aria-label="资产来源" className="grid grid-cols-2 gap-2 desktop:grid-cols-4" data-channel-rail>
          {CHANNELS.map(([k, label, desc, Icon]) => (
            <button key={k} type="button" role="radio" aria-checked={p.channel === k} onClick={() => p.setChannel(k)} data-channel={k}
              className={cx(choice(p.channel === k), 'flex items-start gap-2.5 px-3 py-2.5')}>
              <Icon size={16} aria-hidden className={cx('mt-0.5 flex-none', p.channel === k ? 'text-jz-brand' : 'text-jz-muted')} />
              <span className="min-w-0">
                <span className="block text-label font-semibold text-jz-ink">{label}</span>
                <span className="block text-meta text-jz-muted">{desc}</span>
              </span>
            </button>
          ))}
        </div>

        {p.channel === 'upload' && (
          <label
            data-dropzone={p.dragActive ? 'drag' : (p.busy || p.previewing) ? 'busy' : 'idle'}
            onDragOver={(e) => { e.preventDefault(); p.setDragActive(true); }}
            onDragLeave={() => p.setDragActive(false)}
            onDrop={p.onDrop}
            className={cx('flex cursor-pointer flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 text-center transition-colors duration-hover focus-within:border-jz-brand',
              p.dragActive ? 'border-jz-brand bg-jz-brand-soft' : 'border-jz-border-strong hover:bg-jz-surface-2')}>
            <input type="file" accept=".apk,.xapk,.hap,.app,.ipa" multiple className="sr-only" onChange={p.onUpload} disabled={p.busy || p.previewing} />
            <Upload size={20} aria-hidden className={p.dragActive ? 'text-jz-brand' : 'text-jz-muted'} />
            <span className="text-label text-jz-ink" role="status">
              {p.busy ? '正在上传' : p.previewing ? '正在做静态预检' : p.dragActive ? '松开即可上传' : '点击选择,或把安装包拖到这里(可多选)'}
            </span>
            <span className="flex flex-wrap items-center justify-center gap-1" data-dropzone-formats>
              {UPLOAD_EXTS.map((ext) => <Tag key={ext} mono>{ext}</Tag>)}
            </span>
          </label>
        )}

        {p.channel === 'upload' && p.batchUp && p.batchUp.length > 0 && (
          <div className="overflow-hidden rounded-card border border-jz-border" data-upload-queue>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-jz-border bg-jz-surface-2 px-3 py-2">
              <span className="text-label font-semibold text-jz-ink">批量上传</span>
              <span className="text-label tnum text-jz-muted">已上传 {doneN} / {p.batchUp.length}</span>
              <span className="flex-1" />
              <span data-batch-auth-label>
                <Checkbox className="!items-center" checked={p.batchAuthorized} onChange={(e) => p.setBatchAuthorized(e.target.checked)} data-batch-auth-check
                  label={<span className="text-label">我确认对这些样本拥有合法测试授权</span>} />
              </span>
              <Button size="sm" onClick={p.batchCreate} loading={p.batchCreating} disabled={!p.batchAuthorized || doneN === 0} data-batch-create-btn>
                {p.batchCreating ? '正在创建' : `创建 ${doneN} 个评估任务`}
              </Button>
            </div>
            <ul className="divide-y divide-jz-border">
              {p.batchUp.map((it, i) => (
                <li key={i} className="flex items-center gap-3 px-3 py-2 text-label">
                  <span className="min-w-0 flex-1 truncate text-jz-ink-2" title={it.name}>{it.name}</span>
                  <span className="flex-none font-mono text-meta tnum text-jz-muted">{mb(it.size)}</span>
                  <span className="max-w-48 flex-none truncate" title={it.err}>
                    {it.status === 'done' ? <StatusBadge tone="success">已上传</StatusBadge>
                      : it.status === 'failed' ? <StatusBadge tone="danger">失败: {it.err}</StatusBadge>
                        : <StatusBadge tone="brand">上传中</StatusBadge>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-jz-border px-3 py-2 text-meta text-jz-muted">批量模式直接创建评估任务,预检在任务内执行,右侧不逐个显示。失败的文件可以单独再拖入一次。</p>
          </div>
        )}

        {p.channel === 'path' && (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <Input className="font-mono" value={p.apkPath} onChange={(e) => p.setApkPath(e.target.value)} placeholder="/绝对路径/xxx.apk" aria-label="服务器上的安装包路径"
                aria-invalid={p.pathErr ? true : undefined} data-path-input data-path-invalid={p.pathErr ? '1' : ''} />
              <Button className="flex-none" variant="secondary" loading={p.previewing} onClick={() => p.runPreview(p.apkPath)} disabled={!p.apkPath.trim() || !!p.pathErr} data-preview-btn>预检</Button>
            </div>
            {p.pathErr && <p role="alert" className="text-meta text-jz-red" data-path-error>{p.pathErr}</p>}
          </div>
        )}

        {p.channel === 'search' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={p.appName} onChange={(e) => p.setAppName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && p.doSearch()}
                placeholder="输入应用名" aria-label="应用名" data-search-input />
              <Button className="flex-none" variant="secondary" loading={p.searching} onClick={p.doSearch} disabled={!p.appName.trim()} data-search-btn>搜索</Button>
            </div>
            {p.results.length > 0 && (() => {
              const srcs = Array.from(new Set(p.results.map((r: any) => r?.source).filter(Boolean)));
              return srcs.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5" data-src-filter>
                  {(['all', ...srcs] as string[]).map((s) => (
                    <button key={s} type="button" onClick={() => p.setSrcFilter(s)} data-src-chip={s} data-active={p.srcFilter === s ? '1' : ''} aria-pressed={p.srcFilter === s}
                      className={cx('h-8 rounded-pill border px-3 text-meta transition-colors duration-hover', p.srcFilter === s ? 'border-jz-brand bg-jz-brand-soft font-medium text-jz-brand' : 'border-jz-border text-jz-ink-2 hover:bg-jz-surface-2')}>
                      {s === 'all' ? `全部 ${p.results.length}` : `${SRC_LABELS[s] || s} ${p.results.filter((r: any) => r?.source === s).length}`}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
            {p.results.length > 0 && (() => {
              const filtered = p.results.map((r: any, i: number) => ({ r, i }))
                .filter(({ r }) => p.srcFilter === 'all' || r?.source === p.srcFilter);
              const PAGE_SIZE = 10;
              const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
              const pageItems = filtered.slice((p.searchPage - 1) * PAGE_SIZE, p.searchPage * PAGE_SIZE);
              return (
                <div className="overflow-hidden rounded-card border border-jz-border" data-search-results>
                  <ul className="divide-y divide-jz-border">
                    {pageItems.map(({ r, i }) => {
                      const cached = p.cachedFor(r);
                      const part = p.dlIdx === i ? p.partFor(r) : null;
                      const pct = part && r?.apk_size > 0
                        ? Math.min(99, Math.round((part.received / r.apk_size) * 100))
                        : null;
                      return (
                        <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <span className="min-w-0 flex-1 basis-40 truncate text-label text-jz-ink">{r.name || r}</span>
                          {cached && <span data-cached-badge title={`缓存中已有 ${mb(cached.size)},可直接预检`}><StatusBadge tone="success">已下载</StatusBadge></span>}
                          <span data-src-badge><Tag title="来源渠道">{SRC_LABELS[r?.source] || r?.source || '未知渠道'}</Tag></span>
                          {cached ? (
                            <Button size="sm" variant="secondary" icon={<Check size={14} aria-hidden />} disabled={p.dlIdx !== null} data-cached-btn={i} title={`使用缓存: ${cached.path}`}
                              onClick={() => p.reusePoolRow({ key: String(i), pkg: r?.package || r?.name || String(r), path: cached.path, size: cached.size || 0 })}>
                              使用缓存{cached.size ? ` · ${mb(cached.size, 0)}` : ''}
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" icon={<Download size={14} aria-hidden />} loading={p.dlIdx === i} disabled={p.dlIdx !== null} onClick={() => p.doDownload(r, i)} data-dl-btn={i}
                              title={pct !== null ? `已下载 ${pct}%(${mb(part.received)} / ${mb(r.apk_size, 0)})` : undefined}>
                              {p.dlIdx === i ? (pct !== null ? `下载中 ${pct}%` : '下载中') : '下载'}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 border-t border-jz-border py-1.5" data-search-pagination>
                      <IconButton size="sm" label="上一页" disabled={p.searchPage <= 1} onClick={() => p.setSearchPage(p.searchPage - 1)}><ChevronLeft size={16} aria-hidden /></IconButton>
                      <span className="font-mono text-meta tnum text-jz-ink-2">{p.searchPage} / {totalPages}</span>
                      <IconButton size="sm" label="下一页" disabled={p.searchPage >= totalPages} onClick={() => p.setSearchPage(p.searchPage + 1)}><ChevronRight size={16} aria-hidden /></IconButton>
                    </div>
                  )}
                </div>
              );
            })()}
            {!p.searching && !p.results.length && (
              p.degraded
                ? <InlineAlert tone="attention" title="搜索暂不可用">搜索服务的容器镜像未就绪,本次没有返回候选。镜像就绪前每次搜索都会直接返回这条提示。</InlineAlert>
                : <p className="rounded-control bg-jz-surface-2 px-3 py-2.5 text-label text-jz-muted">没有候选。应用汇、豌豆荚、应用宝、Vivo 都没有匹配这个应用名,可以换一个关键词。</p>
            )}
          </div>
        )}

        {p.channel === 'batch' && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input className="font-mono" value={p.batchDir} onChange={(e) => p.setBatchDir(e.target.value)} placeholder="安装包所在目录的路径" aria-label="安装包目录"
                aria-invalid={p.batchErr ? true : undefined} data-batch-dir-input data-batch-invalid={p.batchErr ? '1' : ''} />
              <Button className="flex-none" variant="secondary" loading={p.busy} onClick={p.scanBatchDir} disabled={!p.batchDir.trim() || !!p.batchErr} data-scan-dir-btn>扫描目录</Button>
            </div>
            {p.batchErr && <p role="alert" className="text-meta text-jz-red" data-batch-error>{p.batchErr}</p>}
            {p.batchList.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 rounded-control bg-jz-surface-2 px-3 py-2">
                <span className="flex-1 text-label text-jz-ink-2" title="目录中以 .apk 或 .xapk 结尾的文件数,不含子目录">找到 {p.batchList.length} 个安装包</span>
                <Button size="sm" onClick={p.batchUnpack} data-batch-unpack>全部脱壳(每个文件一个任务)</Button>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-card border border-jz-border">
          <button type="button" onClick={p.togglePool} data-pool-reuse-toggle aria-expanded={p.poolOpen}
            className="flex min-h-jz-control w-full items-center gap-2 px-3 text-label text-jz-ink-2 transition-colors duration-hover hover:bg-jz-surface-2 hover:text-jz-ink max-[760px]:min-h-jz-touch">
            <History size={14} aria-hidden className="flex-none" />
            已缓存的样本
            <span className="ml-auto text-meta tnum text-jz-muted">{p.poolTotal} 个</span>
            <ChevronDown size={14} aria-hidden className={cx('flex-none transition-transform duration-hover', p.poolOpen && 'rotate-180')} />
          </button>
          {p.poolOpen && (
            <div className="space-y-2 border-t border-jz-border p-3" data-pool-reuse-panel>
              <SearchField value={p.poolQ} onValueChange={p.setPoolQ} label="搜索已缓存的样本" placeholder="搜索包名、路径、任务编号或应用名" data-pool-search />
              <ul className="max-h-56 divide-y divide-jz-border overflow-auto rounded-control border border-jz-border" data-pool-list>
                {p.poolRows.length === 0 && (
                  <li className="px-3 py-4 text-center text-label text-jz-muted" data-pool-empty>
                    {p.poolTotal ? '没有匹配的样本' : '还没有缓存的样本。下载或上传后会出现在这里。'}
                  </li>
                )}
                {p.poolRows.map((c) => (
                  <li key={c.key} className="flex items-center gap-2 px-3 py-2">
                    <Package size={14} aria-hidden className="flex-none text-jz-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-all font-mono text-meta text-jz-ink-2" title={c.path}>{c.pkg}</span>
                      {(c.taskId != null || c.appName) && (
                        <span className="block truncate text-meta text-jz-muted">
                          {c.taskId != null && <span className="font-mono tnum">#{c.taskId} </span>}{c.appName || ''}
                        </span>
                      )}
                    </span>
                    <span className="flex-none font-mono text-meta tnum text-jz-muted">{c.size ? mb(c.size) : '—'}</span>
                    <Button size="sm" variant="secondary" className="flex-none" onClick={() => p.reusePoolRow(c)} data-pool-reuse-btn={c.pkg} title={`使用缓存 ${c.path},不重新上传`}>使用</Button>
                  </li>
                ))}
              </ul>
              <p className="text-meta text-jz-muted">选中后直接用缓存路径做预检,不重新上传。</p>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
};

// ─── 2 Scope and mode ───
// The string values below are sent with the task and compared elsewhere; only the display texts next to them changed.

export const SCOPE_ITEMS = ['组件暴露面分析', '敏感信息与硬编码扫描', '网络通信分析', 'WebView 配置分析'];
export const MODES = ['全自动巡航', '人机协同', '纯静态优先'];
export const BASELINES = [
  { id: 'MASVS-v2 全量', title: 'MASVS-v2 全量', desc: '覆盖移动应用安全验证标准的 8 个域:数据存储、加密、认证授权、平台交互、代码质量、韧性、隐私、网络' },
  { id: 'OWASP Top 10 优先', title: 'OWASP Top 10 优先', desc: '优先检视 OWASP Mobile Top 10 的高频风险:硬编码凭据、不安全通信、敏感数据泄露、代码篡改' },
  { id: 'API Security 优先', title: 'API Security 优先', desc: '优先检视接口与通信面:未授权访问、越权、明文传输、接口逻辑' },
];
export const PROFILES = [
  { id: 'quick', icon: '', title: '快速静态评估', tag: '约 2 分钟 · 不需要设备', tagCls: '', desc: '纯静态优先 · OWASP Top 10 优先 · 50 req/s', mode: '纯静态优先', baseline: 'OWASP Top 10 优先', rate: 50 },
  { id: 'standard', icon: '', title: '标准全量评估', tag: '默认推荐', tagCls: '', desc: '全自动巡航 · MASVS-v2 全量 · 20 req/s', mode: '全自动巡航', baseline: 'MASVS-v2 全量', rate: 20 },
  { id: 'deep', icon: '', title: '深度动态验证', tag: '需要设备', tagCls: '', desc: '人机协同 · API Security 优先 · 10 req/s', mode: '人机协同', baseline: 'API Security 优先', rate: 10 },
];

export const ScopeModeSection: React.FC<{
  activeProfile: string | null; applyProfile: (p: typeof PROFILES[number]) => void;
  scope: string[]; setScope: (s: string[]) => void;
  mode: string; setMode: (m: string) => void;
  baseline: string; setBaseline: (b: string) => void;
  rateLimit: number; setRateLimit: (n: number) => void;
  webTarget: string; setWebTarget: (v: string) => void; webTargetErr: string;
  userPrompt: string; setUserPrompt: (v: string) => void;
  exportTpl: () => void; openTplImport: () => void;
}> = (p) => (
  <Panel id="na-section-scope" data-wizard-step3 title={<ModuleHead no="2" title="范围与模式" />}
    description="这些选择随任务带入后续会话的编排;静态评估本身始终按平台的全量规则执行"
    actions={(
      <>
        <Button size="sm" variant="ghost" icon={<FileUp size={14} aria-hidden />} onClick={p.openTplImport} data-tpl-import title="从 JSON 模板导入配置">导入配置</Button>
        <Button size="sm" variant="ghost" icon={<FileDown size={14} aria-hidden />} onClick={p.exportTpl} data-tpl-export title="把当前配置导出为 JSON 模板">导出配置</Button>
      </>
    )}>
    <div className="space-y-5">
      <div className="space-y-2">
        <SubHead title="预设" hint="一次填好介入级别、合规基线和速率三项;三项与某个预设完全一致时,该预设显示为选中" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" data-profile-block>
          {PROFILES.map((pr) => (
            <button key={pr.id} type="button" onClick={() => p.applyProfile(pr)} data-profile-card={pr.id} data-selected={p.activeProfile === pr.id ? '1' : ''} aria-pressed={p.activeProfile === pr.id}
              className={cx(choice(p.activeProfile === pr.id), 'p-3')}>
              <span className="block text-label font-semibold text-jz-ink">{pr.title}</span>
              <span className="mt-0.5 block text-meta text-jz-ink-2">{pr.tag}</span>
              <span className="mt-1.5 block text-meta text-jz-muted">{pr.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-2" data-scope-block>
        <legend className="text-label font-semibold text-jz-ink">检测模块</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {SCOPE_ITEMS.map((s) => (
            <Checkbox key={s} label={s} checked={p.scope.includes(s)} data-scope-check={s}
              onChange={(e) => p.setScope(e.target.checked ? [...p.scope, s] : p.scope.filter((x) => x !== s))} />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2" data-mode-block>
        <legend className="text-label font-semibold text-jz-ink">介入级别</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          {MODES.map((m) => <Radio key={m} name="wizmode" label={m} checked={p.mode === m} onChange={() => p.setMode(m)} data-mode-radio={m} />)}
        </div>
      </fieldset>

      <div className="space-y-2" data-wizard-baseline-block>
        <SubHead title="合规基线" hint="作为检测侧重写入会话的编排上下文,不是规则引擎的硬性开关" />
        <div role="radiogroup" aria-label="合规基线" className="grid grid-cols-1 gap-2">
          {BASELINES.map((b) => (
            <button key={b.id} type="button" role="radio" aria-checked={p.baseline === b.id} onClick={() => p.setBaseline(b.id)} data-baseline-card={b.id} data-selected={p.baseline === b.id ? '1' : ''}
              className={cx(choice(p.baseline === b.id), 'flex items-start gap-2.5 p-3')}>
              <span aria-hidden className={cx('mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-pill border', p.baseline === b.id ? 'border-jz-brand bg-jz-brand text-jz-on-brand' : 'border-jz-border-strong')}>
                {p.baseline === b.id && <Check size={10} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-label font-semibold text-jz-ink">{b.title}</span>
                <span className="mt-0.5 block text-meta text-jz-muted">{b.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2" data-wizard-ratelimit-block>
        <SubHead title="请求速率上限" hint="对单个目标每秒最多发出的请求数,是写入编排上下文的建议值,不是网关层的强制限流"
          aside={<span className="font-mono text-label tnum text-jz-ink">{p.rateLimit} req/s</span>} />
        <input type="range" min={5} max={100} step={5} value={p.rateLimit} onChange={(e) => p.setRateLimit(Number(e.target.value))}
          aria-label="请求速率上限" aria-valuetext={`${p.rateLimit} 次每秒`} data-rate-slider className="h-jz-control w-full accent-jz-brand max-[760px]:h-jz-touch" />
        <div className="flex justify-between font-mono text-meta tnum text-jz-muted"><span>5</span><span>100</span></div>
      </div>

      <div className="space-y-2" data-wizard-webtarget-block>
        <SubHead title="Web 目标(可选)" />
        <Input className="font-mono" value={p.webTarget} onChange={(e) => p.setWebTarget(e.target.value)} aria-label="Web 目标"
          aria-invalid={p.webTargetErr ? true : undefined} aria-describedby="na-webtarget-note"
          data-web-target-input data-web-target-invalid={p.webTargetErr ? '1' : ''} placeholder="URL、IP 或 CIDR,例如 https://target.com、10.0.0.0/24" />
        {p.webTargetErr
          ? <p id="na-webtarget-note" role="alert" className="text-meta text-jz-red" data-web-target-error>{p.webTargetErr}</p>
          : <p id="na-webtarget-note" className="text-meta text-jz-muted">填写后作为接口和通信检测的授权范围写入会话的编排上下文。留空表示只评估安装包本身。</p>}
      </div>

      <div className="space-y-2" data-wizard-prompt-block>
        <SubHead title="给编排的说明(可选)" aside={<span className="font-mono text-meta tnum text-jz-muted">{p.userPrompt.length}/2000</span>} />
        <Textarea value={p.userPrompt} onChange={(e) => p.setUserPrompt(e.target.value.slice(0, 2000))} aria-label="给编排的说明"
          data-wizard-prompt rows={3} maxLength={2000} placeholder="说明这次测试的重点,例如:重点验证支付接口的未授权访问与签名重放" />
        <p className="text-meta text-jz-muted">写入会话的 user_prompt 字段,不改变评估任务本身的行为。</p>
      </div>
    </div>
  </Panel>
);

// ─── 3 Device ───

const WRAP_CHECK: Record<string, string> = { zygisk_off: 'Zygisk 关闭', debuggable: 'debuggable', permissive: 'SELinux', libzzp: 'libzzp' };
const Dot: React.FC<{ cls: string }> = ({ cls }) => <span aria-hidden className={cx('h-1.5 w-1.5 flex-none rounded-pill', cls)} />;

export const DeviceSection: React.FC<{
  devices: any[]; device: string; setDevice: (s: string) => void;
  devErr: string; staticOnly: boolean;
  devBusy: boolean; onRefresh: () => void; onFridaCheck: () => void;
  wrapFixMsg?: string; onFixWrap?: () => void;
}> = (p) => (
  <Panel id="na-section-device" data-wizard-step2 title={<ModuleHead no="3" title="目标设备" />}
    description={p.device ? `已选 ${p.device}。动态脱壳优先使用这台设备,掉线时不会自动换机` : '供后续会话和动态脱壳使用;静态评估不需要设备,可以不选'}
    actions={(
      <>
        <Button size="sm" variant="ghost" icon={<Activity size={14} aria-hidden />} onClick={p.onFridaCheck} disabled={p.devBusy} data-frida-check-btn
          title="重新探测各设备上的 Frida 服务进程。这里只做探测,不会启动 Frida">{p.devBusy ? '检测中' : '检测 Frida'}</Button>
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} aria-hidden />} onClick={p.onRefresh} disabled={p.devBusy} data-device-refresh-btn title="重新读取设备列表">刷新</Button>
      </>
    )}>
    <div className="space-y-3">
      {p.staticOnly && <InlineAlert tone="info" data-static-hint>当前模式只做静态分析,不需要设备。仍可选择一台设备供后续动态调试使用。</InlineAlert>}
      {!p.staticOnly && !p.device && p.devErr !== '403' && (
        <InlineAlert tone="attention" data-dynamic-device-hint>当前模式包含动态阶段,建议选择一台在线设备。不选时只执行静态部分。</InlineAlert>
      )}

      {p.devErr ? (
        <div data-devices-error className="rounded-card border border-jz-border">
          {p.devErr === '403'
            ? <PermissionState compact title="无权读取设备列表" message="静态评估可以直接进行。需要使用设备时,请联系管理员开通权限。" />
            : <EmptyState compact icon={Smartphone} title="设备探测失败" cause={`${p.devErr}。静态评估不需要设备,可以稍后再刷新。`} action={<Button size="sm" variant="secondary" onClick={p.onRefresh} disabled={p.devBusy}>重试</Button>} />}
        </div>
      ) : p.devices.length === 0 ? (
        <div data-devices-empty className="rounded-card border border-jz-border">
          <EmptyState compact icon={Smartphone} title="没有在线设备" cause="静态评估可以直接发起。设备连接后点击刷新。" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 desktop:grid-cols-2" data-device-rail>
          {p.devices.map((d: any) => {
            const on = p.device === d.serial;
            const health = d.health?.level === 'red' ? ['差', 'bg-jz-red'] : d.health?.level === 'yellow' ? ['波动', 'bg-jz-amber'] : ['正常', 'bg-jz-teal'];
            return (
              <button key={d.serial} type="button" aria-pressed={on} onClick={() => p.setDevice(on ? '' : d.serial)} data-device-card={d.serial}
                className={cx(choice(on), 'space-y-1.5 px-3.5 py-3')}>
                <span className="flex flex-wrap items-center gap-2">
                  <Smartphone size={15} aria-hidden className={cx('flex-none', on ? 'text-jz-brand' : 'text-jz-muted')} />
                  <span className="break-all text-label font-semibold text-jz-ink">{d.model || d.serial}</span>
                  {d.root ? <Badge level="medium">Root</Badge> : <Badge level="info">未 Root</Badge>}
                  {d.is_auto_pick && <Tag title="不指定设备时,动态脱壳会自动选择这台(优先有 Root 的设备)">自动选择</Tag>}
                </span>
                <span className="block break-all font-mono text-meta text-jz-muted">{d.serial}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-meta text-jz-ink-2">
                  <span>Android {d.android || '—'}</span>
                  {d.api_level != null && <span>API {d.api_level}</span>}
                  <span>{d.abi || '—'}</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-meta text-jz-ink-2" data-dev-wrap>
                  <span className="inline-flex items-center gap-1.5"><Dot cls={d.frida ? 'bg-jz-teal' : 'bg-jz-border-strong'} />Frida {d.frida ? '就绪' : '未安装'}</span>
                  <span className="inline-flex items-center gap-1.5"
                    title={`脱壳通道前置条件(只读探测): ${Object.entries(d.wrap_ready?.checks || {}).map(([k, v]) => `${k}=${v ? '是' : '否'}`).join(' ') || '探测不可用'}`}>
                    <Dot cls={d.wrap_ready?.ok ? 'bg-jz-teal' : 'bg-jz-amber'} />脱壳通道{d.wrap_ready?.ok ? '就绪' : '未就绪'}
                  </span>
                  {d.wrap_ready?.checks && (
                    <span data-wrap-checks className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono">
                      {Object.entries(d.wrap_ready.checks).map(([k, v]: [string, any]) => (
                        <span key={k} className={v ? 'text-jz-teal' : 'text-jz-amber'}>{WRAP_CHECK[k] || k} {v ? '通过' : '未通过'}</span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-meta text-jz-muted" data-dev-health
                  title={`24 小时内状态翻转 ${d.health?.flap_24h ?? 0} 次 · 未授权窗口 ${d.health?.unauth_24h ?? 0} · 连续半失联 ${d.health?.half_dead_streak ?? 0}${d.health?.last_shell_latency_ms != null ? ` · shell 时延 ${d.health.last_shell_latency_ms} ms` : ''}`}>
                  <Dot cls={health[1]} />健康 {health[0]} · 24 小时翻转 {d.health?.flap_24h ?? 0} 次
                </span>
              </button>
            );
          })}
        </div>
      )}
      {p.device && (
        <div className="space-y-1.5 rounded-control bg-jz-surface-2 px-3 py-2.5" data-wrap-fix>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" icon={<Wrench size={14} aria-hidden />} onClick={p.onFixWrap} loading={p.devBusy}>{p.devBusy ? '适配中' : '适配这台设备'}</Button>
            <span className="min-w-0 flex-1 basis-48 text-meta text-jz-muted">自动修复 debuggable、SELinux 和 libzzp。Zygisk 需要手动关闭并重启设备。</span>
          </div>
          {p.wrapFixMsg && <div role="status" className="break-all font-mono text-meta text-jz-ink-2" data-wrap-fix-msg>{p.wrapFixMsg}</div>}
        </div>
      )}
    </div>
  </Panel>
);
