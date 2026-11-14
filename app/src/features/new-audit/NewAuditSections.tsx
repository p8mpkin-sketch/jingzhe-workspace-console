// NewAuditSections.tsx — 新建审计任务 左栏三模块(① 资产获取 → ② 审计范围与模式 → ③ 目标设备调度)。
// 纯展示子组件: 全部状态与处理器由 NewAuditPage 注入(props 受控,零内部数据源);
// 存量 data-* 探针原样保留(只增不删),字号八档(11/12/13/14/16/20/24/28)。
import React from 'react';
import {
  Upload, HardDrive, Search, FolderOpen, Smartphone,
  History, ChevronDown, Package, Zap, RefreshCw, ShieldCheck,
} from 'lucide-react';
import { Button, Badge, StatusBadge } from '@/components/ui';

export type Channel = 'upload' | 'path' | 'search' | 'batch';
export type BatchItem = { name: string; size: number; status: 'uploading' | 'done' | 'failed'; apkPath?: string; err?: string };
export type PoolRow = { key: string; pkg: string; path: string; size: number; taskId?: number; appName?: string };

/** 模块头: 序号徽章 + 主标题(text-base md:text-xl font-bold)+ 右侧插槽 */
export const ModuleHead: React.FC<{ no: string; title: string; children?: React.ReactNode }> = ({ no, title, children }) => (
  <div className="flex items-center gap-2.5 flex-wrap">
    <span className="w-7 h-7 rounded-lg bg-neon-accent/10 text-neon-accent grid place-items-center text-sm font-bold flex-none font-mono">{no}</span>
    <h3 className="text-base md:text-xl font-bold text-jz-text-primary">{title}</h3>
    <span className="flex-1" />
    {children}
  </div>
);

// ═══════════ ① 资产获取(四通道 + 拖入上传 + 批量队列 + 历史样本库) ═══════════

const CHANNELS: Array<[Channel, string, string, any]> = [
  ['upload', '本地上传', '拖入 / 选择安装包', Upload],
  ['path', '服务器路径', '磁盘已有 APK', HardDrive],
  ['search', '在线搜索', '应用名搜索可下载', Search],
  ['batch', '批量目录', '目录批量脱壳', FolderOpen],
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
}> = (p) => (
  <section id="na-section-asset" data-wizard-step1 className="rounded-2xl bg-jz-surface shadow-jz-card p-4 space-y-3">
    <ModuleHead no="①" title="资产获取">
      <StatusBadge tone="info" title="上传/路径命中后自动执行静态预检: 包结构、加固壳、导出组件与权限计数即时回填右栏看板">预检即传即扫</StatusBadge>
    </ModuleHead>

    {/* 四通道卡: 选中=高对比边框 + 微光背景 */}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2" data-channel-rail>
 {CHANNELS.map(([k, label, desc, Icon]) => (
        <button key={k} onClick={() => p.setChannel(k)} data-channel={k}
 className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-[0.98]
 ${p.channel === k
 ? 'border-neon-accent/60 bg-neon-accent/10 shadow-[0_0_14px_-4px_rgb(var(--c-border-active)/0.55)]'
 : 'border-transparent bg-jz-elevated/40 hover:bg-jz-elevated/70 hover:border-neon-accent/25'}`}>
          <Icon size={17} className={`flex-none ${p.channel === k ? 'text-neon-accent' : 'text-jz-text-muted'}`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-jz-text-primary">{label}</div>
            <div className="text-xs text-jz-text-muted truncate">{desc}</div>
          </div>
        </button>
      ))}
    </div>

    {/* 本地上传热区(拖入光栅扫描线动效) */}
    {p.channel === 'upload' && (
      <label
 data-dropzone={p.dragActive ? 'drag' : (p.busy || p.previewing) ? 'busy' : 'idle'}
 onDragOver={(e) => { e.preventDefault(); p.setDragActive(true); }}
 onDragLeave={() => p.setDragActive(false)}
 onDrop={p.onDrop}
 className="relative block border-2 border-dashed border-jz-border/60 bg-jz-elevated/40 rounded-2xl p-6 text-center cursor-pointer hover:border-neon-accent/50 hover:bg-jz-elevated/60 active:scale-[0.99] transition-all overflow-hidden">
        <input type="file" accept=".apk,.xapk,.hap,.app,.ipa" multiple className="hidden" onChange={p.onUpload} disabled={p.busy || p.previewing} />
        {(p.dragActive || p.busy || p.previewing) && <span data-raster className="raster-scan" aria-hidden />}
        <div className="relative">
          <Upload size={22} className={`mx-auto transition-transform ${p.dragActive ? 'text-neon-accent scale-110' : 'text-jz-text-muted'}`} />
          <div className="text-sm text-jz-text-secondary mt-1.5">
            {p.busy ? '上传中…' : p.previewing ? '静态预检中…' : p.dragActive ? '松开即上传' : '点击选择或拖入安装包文件(支持多选批量)'}
          </div>
          <div className="flex items-center justify-center gap-1 mt-2 flex-wrap" data-dropzone-formats>
 {UPLOAD_EXTS.map((ext) => (
              <span key={ext} className="px-1.5 py-0.5 rounded bg-jz-elevated/70 text-[11px] font-mono text-jz-text-muted">{ext}</span>
            ))}
          </div>
          <div className="text-sm text-jz-text-muted mt-1.5">上传完成自动预检 — 包结构 / 加固类型 / 推荐模块即时呈现</div>
        </div>
      </label>
 )}

 {/* 批量上传队列(多选/多拖 → 逐个上传 → 批量授权 → 批量建任务) */}
 {p.channel === 'upload' && p.batchUp && p.batchUp.length > 0 && (
      <div className="rounded-xl bg-jz-elevated/40 p-3 space-y-2" data-upload-queue>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-semibold text-jz-text-secondary">批量上传队列</span>
          <span className="text-jz-text-muted tnum">{p.batchUp.filter((it) => it.status === 'done').length}/{p.batchUp.length} 已上传</span>
          <span className="flex-1" />
          <label className="flex items-center gap-1.5 text-sm text-jz-text-secondary cursor-pointer" data-batch-auth-label>
            <input type="checkbox" checked={p.batchAuthorized} onChange={(e) => p.setBatchAuthorized(e.target.checked)} data-batch-auth-check />
            批量授权确认
          </label>
          <Button variant="primary" onClick={p.batchCreate}
 disabled={p.batchCreating || !p.batchAuthorized || !p.batchUp.some((it) => it.status === 'done')} data-batch-create-btn>
 {p.batchCreating ? '创建中…' : `批量创建审计任务(${p.batchUp.filter((it) => it.status === 'done').length})`}
          </Button>
        </div>
        <div className="divided-card-list">
 {p.batchUp.map((it, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-none ${it.status === 'done' ? 'bg-vuln-safe' : it.status === 'failed' ? 'bg-vuln-critical' : 'bg-jz-accent-cyan animate-pulse'}`} />
              <span className="flex-1 truncate text-jz-text-secondary" title={it.name}>{it.name}</span>
              <span className="font-mono tnum text-jz-text-muted flex-none">{(it.size / 1048576).toFixed(1)}MB</span>
              <span className={`flex-none tnum truncate max-w-[160px] ${it.status === 'failed' ? 'text-vuln-critical' : it.status === 'done' ? 'text-vuln-safe' : 'text-jz-accent-cyan'}`}
 title={it.err}>
                {it.status === 'done' ? '已上传' : it.status === 'failed' ? `失败: ${it.err}` : '上传中'}
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-jz-text-muted">批量模式直接创建审计任务(右栏看板不逐个展开,预检在任务内执行);失败项可重新单独拖入走单文件预检流。</div>
      </div>
    )}

    {/* 服务器路径通道 */}
    {p.channel === 'path' && (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <input value={p.apkPath} onChange={(e) => p.setApkPath(e.target.value)} placeholder="/绝对路径/xxx.apk(服务器磁盘)"
 data-path-input data-path-invalid={p.pathErr ? '1' : ''}
 className={`flex-1 px-3 h-10 rounded-lg bg-jz-elevated/60 text-sm font-mono text-jz-text-primary outline-none transition-colors ${
 p.pathErr ? 'ring-2 ring-rose-500/60' : 'focus:ring-2 focus:ring-neon-accent/40'}`} />
          <Button onClick={() => p.runPreview(p.apkPath)} disabled={p.previewing || !p.apkPath.trim() || !!p.pathErr} data-preview-btn>预检</Button>
        </div>
        {p.pathErr && <p className="text-sm text-rose-600 dark:text-rose-400" data-path-error>{p.pathErr}</p>}
      </div>
    )}

    {/* 在线搜索通道(四源竞速下载 + 渠道筛选 + 分页) */}
    {p.channel === 'search' && (
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={p.appName} onChange={(e) => p.setAppName(e.target.value)}
 onKeyDown={(e) => e.key === 'Enter' && p.doSearch()}
 placeholder="输入应用名,如 建设银行 / 微信 / 抖音" data-search-input
 className="flex-1 px-3 h-10 rounded-lg bg-jz-elevated/60 text-sm text-jz-text-primary focus:ring-2 focus:ring-neon-accent/40 outline-none" />
          <Button onClick={p.doSearch} disabled={p.searching || !p.appName.trim()} data-search-btn>{p.searching ? '搜索中…' : '搜索'}</Button>
        </div>
 {p.results.length > 0 && (() => {
 const srcs = Array.from(new Set(p.results.map((r: any) => r?.source).filter(Boolean)));
 return srcs.length > 1 ? (
            <div className="flex items-center gap-1.5 flex-wrap" data-src-filter>
 {(['all', ...srcs] as string[]).map((s) => (
                <button key={s} onClick={() => p.setSrcFilter(s)} data-src-chip={s} data-active={p.srcFilter === s ? '1' : ''}
 className={`px-2.5 h-7 rounded-full text-xs transition-colors ${p.srcFilter === s ? 'bg-neon-accent/10 text-neon-accent font-semibold' : 'text-jz-text-muted hover:bg-jz-elevated/60'}`}>
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
            <div data-search-results>
              <div className="divided-card-list">
 {pageItems.map(({ r, i }) => {
 const cached = p.cachedFor(r);
 const part = p.dlIdx === i ? p.partFor(r) : null;
 const pct = part && r?.apk_size > 0
                    ? Math.min(99, Math.round((part.received / r.apk_size) * 100))
                    : null;
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm text-jz-text-primary flex-1 truncate">{r.name || r}</span>
                      {cached && (
                        <span className="flex-none px-1.5 h-[18px] leading-[18px] rounded-full text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" data-cached-badge
 title={`审计池已有缓存 ${(cached.size / 1048576).toFixed(1)}MB — 点击直接预检,不重复下载`}>已下载</span>
                      )}
                      <span className="flex-none px-1.5 h-[18px] leading-[18px] rounded-full text-[11px] bg-jz-elevated/60 text-jz-text-secondary" data-src-badge
 title={`来源渠道: ${SRC_LABELS[r?.source] || r?.source || '未知'}`}>
                        {SRC_LABELS[r?.source] || r?.source || '未知渠道'}
                      </span>
                      {cached ? (
                        <Button variant="ghost" disabled={p.dlIdx !== null} onClick={() => p.reusePoolRow({ key: String(i), pkg: r?.package || r?.name || String(r), path: cached.path, size: cached.size || 0 })} data-cached-btn={i}
 className="text-emerald-600 dark:text-emerald-400"
 title={`使用审计池缓存: ${cached.path}`}>
                          ✓ 已下载{cached.size ? ` · ${(cached.size / 1048576).toFixed(0)}MB` : ''}
                        </Button>
                      ) : (
                        <Button variant="ghost" disabled={p.dlIdx !== null} onClick={() => p.doDownload(r, i)} data-dl-btn={i}
 title={pct !== null ? `已下载 ${pct}%(${(part.received / 1048576).toFixed(1)}/${(r.apk_size / 1048576).toFixed(0)}MB)` : undefined}>
                          {p.dlIdx === i ? (pct !== null ? `下载中 ${pct}%` : '下载中…') : '⤓ 下载'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
 {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2 pb-1" data-search-pagination>
                  <button disabled={p.searchPage <= 1} onClick={() => p.setSearchPage(p.searchPage - 1)}
 className="px-2 h-7 rounded-md bg-jz-elevated/60 text-jz-text-muted hover:text-jz-text-primary disabled:opacity-30">‹</button>
                  <span className="text-xs font-mono text-jz-text-muted tnum">{p.searchPage} / {totalPages}</span>
                  <button disabled={p.searchPage >= totalPages} onClick={() => p.setSearchPage(p.searchPage + 1)}
 className="px-2 h-7 rounded-md bg-jz-elevated/60 text-jz-text-muted hover:text-jz-text-primary disabled:opacity-30">›</button>
                </div>
              )}
            </div>
          );
        })()}
        {!p.searching && !p.results.length && (
          <div className={`text-sm px-3 py-2 rounded-lg bg-jz-elevated/40 ${p.degraded ? 'text-vuln-medium' : 'text-jz-text-muted'}`}>
            {p.degraded
              ? '⚠ 搜索降级:容器镜像未就绪(docker 镜像缺失/超时),本轮返回空候选;镜像就绪前每次搜索将直接快速返回本提示'
              : '无候选——应用汇/豌豆荚/应用宝/Vivo 未命中该应用名,可换关键词重试'}
          </div>
        )}
      </div>
    )}

    {/* 批量目录通道 */}
    {p.channel === 'batch' && (
      <div className="space-y-2">
        <input value={p.batchDir} onChange={(e) => p.setBatchDir(e.target.value)} placeholder="输入 APK 目录路径"
 data-batch-dir-input data-batch-invalid={p.batchErr ? '1' : ''}
 className={`w-full px-3 h-10 rounded-lg bg-jz-elevated/60 text-sm text-jz-text-primary outline-none transition-colors ${
 p.batchErr ? 'ring-2 ring-rose-500/60' : 'focus:ring-2 focus:ring-neon-accent/40'}`} />
        {p.batchErr && <p className="text-sm text-rose-600 dark:text-rose-400" data-batch-error>{p.batchErr}</p>}
        <Button onClick={p.scanBatchDir} disabled={p.busy || !p.batchDir.trim() || !!p.batchErr} data-scan-dir-btn>扫描目录</Button>
 {p.batchList.length > 0 && (
          <>
            <div className="text-sm text-jz-text-muted" title="统计口径: 目录扫描命中 .apk/.xapk 后缀的文件计数真值(非递归子目录去重后)">发现 {p.batchList.length} 个 APK</div>
            <Button variant="primary" onClick={p.batchUnpack} data-batch-unpack> 全部脱壳(每 APK 一任务)</Button>
          </>
        )}
      </div>
    )}

    {/*  历史样本库: 可展开的带搜索样本选择器(池缓存 × 任务 #ID 双源真值,一键挂载复用) */}
    <div className="rounded-xl bg-jz-elevated/40 p-3 space-y-2">
      <button onClick={p.togglePool} data-pool-reuse-toggle
 className="w-full inline-flex items-center gap-2 text-sm text-jz-text-secondary hover:text-neon-accent transition-colors">
        <History size={14} className="flex-none" />  历史样本库(点击展开搜索复用)
        <span className="ml-auto text-xs text-jz-text-muted tnum">{p.poolTotal} 个已缓存</span>
        <ChevronDown size={14} className={`flex-none transition-transform ${p.poolOpen ? 'rotate-180' : ''}`} />
      </button>
      {p.poolOpen && (
        <div className="space-y-2" data-pool-reuse-panel>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-jz-text-muted pointer-events-none" />
            <input value={p.poolQ} onChange={(e) => p.setPoolQ(e.target.value)} placeholder="模糊搜索:包名 / 路径 / #任务ID / 应用名…" data-pool-search
 className="w-full pl-8 pr-2 h-9 rounded-lg bg-jz-surface text-sm text-jz-text-primary outline-none focus:ring-2 focus:ring-neon-accent/30" />
          </div>
          <div className="max-h-56 overflow-auto divided-card-list" data-pool-list>
            {p.poolRows.length === 0 && (
              <div className="px-2.5 py-3 text-center text-sm text-jz-text-muted" data-pool-empty>
                {p.poolTotal ? '无匹配缓存样本' : '审计池暂无缓存(下载/上传后此处呈现)'}
              </div>
 )}
 {p.poolRows.map((c) => (
              <div key={c.key} className="flex items-center gap-2 px-2.5 py-1.5">
                <Package size={13} className="flex-none text-jz-text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-xs text-jz-text-secondary break-all" title={c.path}>{c.pkg}</div>
                  {(c.taskId != null || c.appName) && (
                    <div className="text-[11px] text-jz-text-muted tnum truncate">
                      {c.taskId != null && <span className="font-mono">#{c.taskId} </span>}{c.appName || ''}
                    </div>
                  )}
                </div>
                <span className="flex-none font-mono text-xs tnum text-jz-text-muted">{c.size ? `${(c.size / 1048576).toFixed(1)}MB` : '—'}</span>
                <Button variant="ghost" onClick={() => p.reusePoolRow(c)} data-pool-reuse-btn={c.pkg}
 title={`直接复用缓存: ${c.path}(不重传)`}>挂载复用</Button>
              </div>
            ))}
          </div>
          <div className="text-xs text-jz-text-muted">命中即复用审计池缓存路径直接预检,不重传;数据源 /api/apk/pool-state 与任务列表真值。</div>
        </div>
      )}
    </div>
  </section>
);

// ═══════════ ② 审计范围与模式(场景预设大卡 + 细项联动) ═══════════

export const SCOPE_ITEMS = ['组件暴露面分析', '敏感信息与硬编码扫描', '网络通信分析', 'WebView 配置分析'];
export const MODES = ['全自动巡航', '人机协同', '纯静态优先'];
export const BASELINES = [
  { id: 'MASVS-v2 全量', title: 'MASVS-v2 全量', desc: '移动应用安全验证标准 8 域全域覆盖(数据存储/加密/认证授权/平台交互/代码质量/韧性/隐私/网络)' },
  { id: 'OWASP Top 10 优先', title: 'OWASP Top 10 优先', desc: 'OWASP Mobile Top 10 高频风险域优先检视(凭据硬编码/不安全通信/敏感数据泄露/代码篡改)' },
  { id: 'API Security 优先', title: 'API Security 优先', desc: '接口与通信面优先检视(未授权访问/越权/明文传输/Web API 逻辑)' },
];
// 场景预设大卡: 一键联动「介入级别 + 合规基线 + 速率」三值(沿用既有 applyProfile 逻辑);
// 选中态=三项当前值恰好等于该组合(纯派生,无隐藏状态)。
export const PROFILES = [
  { id: 'quick', icon: '', title: '极速静态审计', tag: '~2 分钟 · 不依赖真机', tagCls: 'bg-jz-accent-cyan/10 text-jz-accent-cyan', desc: '纯静态优先 · OWASP Top 10 侧重 · 高速率建议(50 req/s)', mode: '纯静态优先', baseline: 'OWASP Top 10 优先', rate: 50 },
  { id: 'standard', icon: '', title: '标准全量合规', tag: '推荐默认', tagCls: 'bg-vuln-safe/10 text-vuln-safe', desc: '全自动巡航 · MASVS-v2 8 域全域 · 平台缺省节奏(20 req/s)', mode: '全自动巡航', baseline: 'MASVS-v2 全量', rate: 20 },
  { id: 'deep', icon: '🔥', title: 'AI 深度动态渗透', tag: '强依赖真机', tagCls: 'bg-vuln-medium/10 text-vuln-medium', desc: '人机协同 · API Security 侧重 · 低速率高谨慎(10 req/s)', mode: '人机协同', baseline: 'API Security 优先', rate: 10 },
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
  <section id="na-section-scope" data-wizard-step3 className="rounded-2xl bg-jz-surface shadow-jz-card p-4 space-y-3">
    <ModuleHead no="②" title="审计范围与模式">
      <StatusBadge tone="info" title="预设=编排预选组合一键填入(介入级别/合规基线/速率建议),不改变静态审计全量规则;选中态=三项当前值恰好等于该组合">场景预设联动</StatusBadge>
      <button onClick={p.openTplImport} data-tpl-import title="导入审计配置模板 JSON(前端解析并即时应用到策略预选)"
 className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-jz-elevated/60 text-xs text-jz-text-secondary hover:text-neon-accent transition-colors">
         导入配置模板
      </button>
      <button onClick={p.exportTpl} data-tpl-export title="导出当前审计配置为 JSON 模板(前端文件下载)"
 className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-jz-elevated/60 text-xs text-jz-text-secondary hover:text-neon-accent transition-colors">
         导出当前配置
      </button>
    </ModuleHead>

    {/* 三张大号场景预设模式卡(点击一键联动下方细项) */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" data-profile-block>
 {PROFILES.map((pr) => (
        <button key={pr.id} onClick={() => p.applyProfile(pr)} data-profile-card={pr.id} data-selected={p.activeProfile === pr.id ? '1' : ''}
 className={`text-left rounded-xl p-3 transition-all border ${p.activeProfile === pr.id
 ? 'border-neon-accent/60 bg-neon-accent/10 shadow-[0_0_14px_-4px_rgb(var(--c-border-active)/0.55)]'
 : 'border-transparent bg-jz-elevated/40 hover:bg-jz-elevated/70 active:scale-[0.98]'}`}>
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="text-base">{pr.icon}</span>
            <span className="text-sm font-semibold text-jz-text-primary truncate">{pr.title}</span>
          </div>
          <span className={`inline-block mt-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-mono font-semibold ${pr.tagCls}`}>{pr.tag}</span>
          <p className="mt-1.5 text-xs text-jz-text-secondary leading-4">{pr.desc}</p>
        </button>
      ))}
    </div>

    {/* 细项: 引擎范围与模块勾选 */}
    <div className="space-y-1.5" data-scope-block>
      <div className="text-sm font-semibold text-jz-text-secondary">引擎范围与模块</div>
      <div className="text-xs text-jz-text-muted">渗透会话编排预选,随任务带入项目页向导;静态审计任务本身按平台全量规则执行(不因勾选缩水)。</div>
      <div className="grid grid-cols-2 gap-1.5">
 {SCOPE_ITEMS.map((s) => (
          <label key={s} className="flex items-center gap-2 text-sm text-jz-text-secondary cursor-pointer">
            <input type="checkbox" checked={p.scope.includes(s)} onChange={(e) => p.setScope(e.target.checked ? [...p.scope, s] : p.scope.filter((x) => x !== s))} data-scope-check={s} />{s}
          </label>
        ))}
      </div>
    </div>

    {/* AI 介入级别 */}
    <div className="space-y-1.5" data-mode-block>
      <div className="text-sm font-semibold text-jz-text-secondary">AI 介入级别</div>
      <div className="flex gap-4 flex-wrap">
 {MODES.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm text-jz-text-secondary cursor-pointer">
            <input type="radio" name="wizmode" checked={p.mode === m} onChange={() => p.setMode(m)} data-mode-radio={m} />{m}
          </label>
        ))}
      </div>
    </div>

    {/* Web 目标(可选,URL/IP/CIDR 三模即时校验) */}
    <div className="space-y-1.5" data-wizard-webtarget-block>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-jz-text-secondary">Web 目标</span>
        <StatusBadge tone="info">可选 · URL / IP / CIDR</StatusBadge>
      </div>
      <input value={p.webTarget} onChange={(e) => p.setWebTarget(e.target.value)}
 data-web-target-input data-web-target-invalid={p.webTargetErr ? '1' : ''}
 placeholder="输入目标 URL、IP 或 CIDR 网段…(如 https://target.com、192.168.1.1、10.0.0.0/24)"
 className={`w-full rounded-lg px-3 h-10 text-sm font-mono transition-colors focus:outline-none bg-jz-elevated/60 text-jz-text-primary ${
 p.webTargetErr ? 'ring-2 ring-rose-500/60' : 'focus:ring-2 focus:ring-neon-accent/40'}`} />
      {p.webTargetErr
        ? <p className="text-sm text-rose-600 dark:text-rose-400" data-web-target-error>{p.webTargetErr}</p>
        : <div className="text-xs text-jz-text-muted">合法值将随向导写入渗透会话编排上下文,作为 WEB 面(接口/通信)检测授权范围的声明;留空=仅审计 APK 本体。</div>}
    </div>

    {/* 合规基线 */}
    <div className="space-y-1.5" data-wizard-baseline-block>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-jz-text-secondary">合规基线</span>
        <StatusBadge tone="info" title="消费口径: 选中基线经向导合并进 user_prompt 随会话落库,作为 ai_agent 编排的检测域侧重声明;为编排侧重提示,非规则引擎硬闸">写入编排上下文</StatusBadge>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
 {BASELINES.map((b) => (
          <div key={b.id} onClick={() => p.setBaseline(b.id)} data-baseline-card={b.id} data-selected={p.baseline === b.id ? '1' : ''}
 className={`cursor-pointer rounded-xl p-2.5 transition-all ${
 p.baseline === b.id ? 'bg-neon-accent/10 shadow-[0_0_0_1.5px_rgb(99,102,241/0.5)]' : 'bg-jz-elevated/40 hover:bg-jz-elevated/70'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-jz-text-primary">{p.baseline === b.id ? '✓ ' : ''}{b.title}</span>
              {p.baseline === b.id && <StatusBadge tone="custom" className="bg-neon-accent/15 text-neon-accent">已选</StatusBadge>}
            </div>
            <p className="mt-1 text-xs text-jz-text-secondary leading-4">{b.desc}</p>
          </div>
        ))}
      </div>
    </div>

    {/* 请求速率限制 */}
    <div className="space-y-1.5" data-wizard-ratelimit-block>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-jz-text-secondary">请求速率限制</span>
        <StatusBadge tone="info" title="编排口径: 平台发往单一目标资产 IP/域名的每秒最大 HTTP/S 请求包上限建议值(req/s),随会话写入编排上下文由 ai_agent 在探测步骤遵循;非网关级令牌桶强制限流">{p.rateLimit} req/s</StatusBadge>
      </div>
      <input type="range" min={5} max={100} step={5} value={p.rateLimit} onChange={(e) => p.setRateLimit(Number(e.target.value))}
 data-rate-slider className="w-full accent-[rgb(var(--c-border-active))]" />
      <div className="flex justify-between text-xs text-jz-text-muted font-mono tnum"><span>5</span><span>100</span></div>
    </div>

    {/* 给 AI 的提示词 */}
    <div className="space-y-1.5" data-wizard-prompt-block>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-jz-text-secondary">给 AI 的提示词</span>
        <StatusBadge tone="info">可选 · 留空不设置</StatusBadge>
      </div>
      <textarea value={p.userPrompt} onChange={(e) => p.setUserPrompt(e.target.value.slice(0, 2000))}
 data-wizard-prompt rows={3} maxLength={2000}
 placeholder="向 AI 编排说明本次测试意图,如:重点验证支付接口的未授权访问与签名重放…"
 className="w-full rounded-lg bg-jz-elevated/60 px-2.5 py-2 text-sm
 text-jz-text-primary placeholder:text-jz-text-muted focus:ring-2 focus:ring-neon-accent/40 outline-none resize-y" />
      <div className="flex items-center justify-between text-xs text-jz-text-muted">
        <span>写入渗透会话 user_prompt 字段,作为 ai_agent 编排上下文;不改变既有审计任务行为。</span>
        <span className="font-mono tnum flex-none ml-2">{p.userPrompt.length}/2000</span>
      </div>
    </div>
  </section>
);

// ═══════════ ③ 目标设备调度(智能联动提示 + 宽幅设备卡 + 环境自愈) ═══════════

export const DeviceSection: React.FC<{
 devices: any[]; device: string; setDevice: (s: string) => void;
 devErr: string; staticOnly: boolean;
 devBusy: boolean; onRefresh: () => void; onFridaCheck: () => void;
 wrapFixMsg?: string; onFixWrap?: () => void;
}> = (p) => (
  <section id="na-section-device" data-wizard-step2 className="rounded-2xl bg-jz-surface shadow-jz-card p-4 space-y-3">
    <ModuleHead no="③" title="目标设备调度">
      <StatusBadge tone="info" title="设备供后续渗透会话调度;静态审计任务不依赖设备,可不选">静态可不选</StatusBadge>
      {p.device && (
        <StatusBadge tone="custom" className="bg-jz-active/10 text-jz-active" title="选中设备将随任务下发 device_serial(动态脱壳优先该机,掉线不静默换机)并写入向导 prefill">
          已选 {p.device}
        </StatusBadge>
      )}
      <button onClick={p.onFridaCheck} disabled={p.devBusy} data-frida-check-btn
 title="环境自愈按钮(诚实口径): 任务阶段无独立 Frida 拉起端点,本按钮触发 /api/pentest/devices 重新探测(frida-server 进程真值)并 Toast 如实回报;拉起通道位于渗透会话 gadget 预备"
 className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-jz-elevated/60 text-xs text-jz-text-secondary hover:text-neon-accent transition-colors disabled:opacity-40">
        <Zap size={12} /> {p.devBusy ? '检测中…' : ' 检测/拉起 Frida'}
      </button>
      <button onClick={p.onRefresh} disabled={p.devBusy} data-device-refresh-btn
 title="重新拉取 /api/pentest/devices 设备快照(事件驱动探测真值)"
 className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-jz-elevated/60 text-xs text-jz-text-secondary hover:text-neon-accent transition-colors disabled:opacity-40">
        <RefreshCw size={12} />  刷新设备状态
      </button>
    </ModuleHead>

    {/* 智能联动提示条 */}
    {p.staticOnly && (
      <div className="rounded-xl bg-jz-accent-cyan/10 px-3 py-2 text-sm text-jz-accent-cyan" data-static-hint>
        ℹ️ 当前所选模式仅执行静态分析,无需强绑真机;仍可挂载设备用于后续动态调试
      </div>
    )}
    {!p.staticOnly && !p.device && p.devErr !== '403' && (
      <div className="rounded-xl bg-vuln-medium/10 px-3 py-2 text-sm text-vuln-medium" data-dynamic-device-hint>
        ⚠ 当前模式含动态阶段,建议选择一台在线真机(动态脱壳优先该机调度);不选则仅执行静态链
      </div>
    )}

    {p.devErr ? (
      <div className="rounded-xl bg-jz-elevated/40 p-4 text-center text-sm text-jz-text-muted" data-devices-error>
        {p.devErr === '403'
          ? '⚠ 设备清单读取被拒(403,服务权限边界)——静态审计可直接进行;如需动态调度请联系管理员开通'
          : `⚠ 设备探测失败: ${p.devErr}——静态审计不需要设备,可稍后点击「刷新设备状态」重试`}
      </div>
    ) : p.devices.length === 0 ? (
      <div className="rounded-xl bg-jz-elevated/40 p-4 text-center text-sm text-jz-text-muted" data-devices-empty>
        无在线设备——静态审计可直接发起,或设备就绪后点击「刷新设备状态」
      </div>
    ) : (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5" data-device-rail>
 {p.devices.map((d: any) => (
          <button key={d.serial} onClick={() => p.setDevice(p.device === d.serial ? '' : d.serial)} data-device-card={d.serial}
 className={`text-left rounded-xl bg-jz-elevated/40 px-3.5 py-3 transition-all border ${
 p.device === d.serial
 ? 'border-neon-accent/60 bg-neon-accent/10 shadow-[0_0_14px_-4px_rgb(var(--c-border-active)/0.55)]'
 : 'border-transparent hover:border-neon-accent/25 hover:bg-jz-elevated/70'}`}>
            <div className="flex items-center gap-2 flex-wrap">
              <Smartphone size={15} className={`flex-none ${p.device === d.serial ? 'text-neon-accent' : 'text-jz-text-muted'}`} />
              <span className="text-sm font-semibold text-jz-text-primary break-all">{d.model || d.serial}</span>
              {d.root ? <Badge level="medium">Root</Badge> : <Badge level="info">未越权</Badge>}
              {d.is_auto_pick && <span className="text-[11px] text-neon-accent" title="未指定设备时,动态脱壳自动选机(优先有 root 的真机)">自动选</span>}
            </div>
            <div className="text-xs font-mono text-jz-text-muted break-all mt-1">{d.serial}</div>
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1.5 text-sm font-mono text-jz-text-secondary">
              <span>Android {d.android || '—'}</span>
              {d.api_level != null && <span>API {d.api_level}</span>}
              <span>{d.abi || '—'}</span>
            </div>
            <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-1" data-dev-wrap>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-jz-text-muted">
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${d.frida ? 'bg-vuln-safe animate-breathe' : 'bg-jz-text-muted'}`} />
                Frida {d.frida ? '就绪' : '未装'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-jz-text-muted"
 title={`wrap 通道前置(只读探测): ${Object.entries(d.wrap_ready?.checks || {}).map(([k, v]) => `${k}=${v ? '✓' : '✗'}`).join(' ') || '探测不可用'}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${d.wrap_ready?.ok ? 'bg-vuln-safe' : 'bg-vuln-medium'}`} />
                Wrap {d.wrap_ready?.ok ? '就绪(硬壳可脱)' : '未就绪'}
              </span>
              {d.wrap_ready?.checks && (
                <span data-wrap-checks className="inline-flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] font-mono">
                  {Object.entries(d.wrap_ready.checks).map(([k, v]: [string, any]) => {
                    const lm: Record<string, string> = { zygisk_off: 'Zygisk关闭', debuggable: 'debuggable', permissive: 'SELinux', libzzp: 'libzzp' };
                    return (
                      <span key={k} className={v ? 'text-vuln-safe' : 'text-vuln-high'}>
                        {lm[k] || k} {v ? '✓' : '✗'}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs font-mono text-jz-text-muted" data-dev-health
 title={`设备健康分: 24h 状态翻转 ${d.health?.flap_24h ?? 0} 次 · 越权窗 ${d.health?.unauth_24h ?? 0} · 半死连击 ${d.health?.half_dead_streak ?? 0}${d.health?.last_shell_latency_ms != null ? ` · 壳时延 ${d.health.last_shell_latency_ms}ms` : ''}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${d.health?.level === 'red' ? 'bg-vuln-high' : d.health?.level === 'yellow' ? 'bg-vuln-medium' : 'bg-vuln-safe'}`} />
              健康 {d.health?.level === 'red' ? '差' : d.health?.level === 'yellow' ? '波动' : '正常'} · 翻转 {d.health?.flap_24h ?? 0}/24h
            </div>
          </button>
        ))}
      </div>
    )}
    {p.device && (
      <div className="rounded-xl bg-jz-elevated/40 px-3 py-2 space-y-1" data-wrap-fix>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={p.onFixWrap} disabled={p.devBusy}
            className="inline-flex items-center gap-1 px-2.5 h-7 rounded-lg bg-neon-accent/15 text-xs text-neon-accent hover:bg-neon-accent/25 disabled:opacity-40">
            <Zap size={12} /> {p.devBusy ? '适配中…' : '适配当前设备'}
          </button>
          <span className="text-[11px] text-jz-text-muted">自动修复 debuggable/SELinux/libzzp；Zygisk 需手动关闭并重启</span>
        </div>
        {p.wrapFixMsg && <div className="text-[11px] font-mono text-jz-text-secondary break-all" data-wrap-fix-msg>{p.wrapFixMsg}</div>}
      </div>
    )}
    <div className="flex items-center gap-1.5 text-xs text-jz-text-muted">
      <ShieldCheck size={13} className="flex-none" />
      设备真值来自 /api/pentest/devices 实时快照;环境自愈按钮只触发既有探测端点并如实回报。
    </div>
  </section>
);
