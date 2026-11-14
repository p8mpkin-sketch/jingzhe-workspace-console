// NewAuditDock.tsx — 新建审计任务 右栏两舱(上:  APK 即时解析看板 / 下:  任务执行蓝图与一键启动底座)。
// 纯展示子组件: 状态与处理器由 NewAuditPage 注入;存量 data-* 探针原样保留(只增不删);
// 字号八档(11/12/13/14/16/20/24/28),面色全部 jz-*/vuln-*/neon-* token。
import React from 'react';
import { ScanLine, Package } from 'lucide-react';
import { Button, Badge, StatusBadge, CodePill } from '@/components/ui';
import { PipelineStepper } from '@/components/ui/PipelineStepper';
import type { StepperPhase } from '@/components/ui/PipelineStepper';

// 未上传时的 2×2 预检能力预览(能力声明,非数据;预检真值上传后回填)
const PREVIEW_CAPS = [
  { icon: '', title: '包结构与签名指纹', desc: '包名/版本/ABI/SHA256 逐项真算回填' },
  { icon: '', title: '加固壳识别', desc: '壳家族初判(仅展示,不入授权字段)' },
  { icon: '🚪', title: '导出组件与权限预筛', desc: '四类组件导出计数 + 权限条目计数' },
  { icon: '🤖', title: 'AI 推荐模块', desc: '按预检可判定项打推荐标记,一键应用' },
];

export type RecItem = { name: string; rec: boolean; basis: string };

// ═══════════ 上舱:  APK 即时解析看板 ═══════════

export const ParseBoard: React.FC<{
 preview: any | null; previewing: boolean;
 recs: RecItem[]; applyRecs: () => void;
}> = ({ preview, previewing, recs, applyRecs }) => {
  const meta = preview?.meta || null;
  const comp = meta?.components || {};
  const strong = !!preview?.strong_shell;
  return (
    <div className="rounded-panel bg-jz-surface shadow-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <ScanLine size={17} className="text-jz-brand flex-none" />
        <h3 className="text-section md:text-title font-semibold text-jz-ink"> APK 即时解析看板</h3>
        {!preview && !previewing && <StatusBadge tone="info">等待资产</StatusBadge>}
        {previewing && <StatusBadge tone="info">预检中…</StatusBadge>}
        {preview && !previewing && (meta
          ? <StatusBadge tone="custom" className="bg-jz-teal/10 text-jz-teal">预检完成</StatusBadge>
          : <StatusBadge tone="medium" title={preview.meta_error || 'manifest 解析失败'}>预检降级</StatusBadge>)}
      </div>

      {/* 未上传: 2×2 预检能力预览(零假数据,能力声明) */}
      {!preview && !previewing && (
        <div className="grid grid-cols-2 gap-2.5" data-parse-skeleton data-cap-grid>
 {PREVIEW_CAPS.map((c) => (
            <div key={c.title} className="rounded-card border border-dashed border-jz-border/60 bg-jz-surface-2/30 p-3 space-y-1" data-cap-card={c.title}>
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="text-section">{c.icon}</span>
                <span className="text-body font-semibold text-jz-ink-2">{c.title}</span>
              </div>
              <p className="text-meta text-jz-muted leading-4">{c.desc}</p>
            </div>
          ))}
          <div className="col-span-2 text-center text-meta text-jz-muted">
            左侧上传 / 路径 / 在线下载命中后,此处即时呈现预检真值
          </div>
        </div>
      )}

      {/* 预检中: 光栅扫描占位 */}
      {previewing && (
        <div className="relative rounded-panel bg-jz-surface-2/40 p-6 overflow-hidden" data-parse-scanning>
          <span data-raster className="" aria-hidden />
          <div className="relative text-body text-jz-muted text-center">预检进行中 — 壳检测 / manifest 元数据 / ZIP ABI 逐项真算</div>
        </div>
      )}

      {/* 预检完成: 资产档案(divided-card 单容器;大字号真值) */}
      {preview && (
        <div className="divided-card-list" data-asset-board>
          {/* 资产头 */}
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="w-10 h-10 rounded-card bg-jz-brand flex items-center justify-center text-section font-semibold text-jz-on-brand flex-none">
              {(meta?.app_name || preview.filename || 'A').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-body md:text-section font-semibold text-jz-ink truncate" title={meta?.app_name || preview.filename}>
                {meta?.app_name || preview.filename}
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                {meta?.package
                  ? <CodePill value={meta.package} textCls="text-meta" />
                  : <span className="text-meta font-mono text-jz-muted">包名缺失(元数据降级)</span>}
                {preview.platform && preview.platform !== 'android' && (
                  <span className={`px-1.5 py-0.5 rounded-pill text-meta font-mono flex items-center gap-1 ${preview.platform === 'harmony' ? 'bg-jz-brand/10 text-jz-brand' : 'bg-jz-brand/10 text-jz-brand'}`}
 data-preview-pf>
                    <span className={`w-1.5 h-1.5 rounded-pill ${preview.platform === 'harmony' ? 'bg-jz-brand' : 'bg-jz-brand'}`} />
                    {preview.platform === 'harmony' ? '鸿蒙' : 'iOS'}
                  </span>
                )}
                {meta?.platform === 'harmony' && meta.harden && (
                  <span className="px-1.5 py-0.5 rounded-pill text-meta font-mono bg-jz-surface-2 text-jz-ink-2"
 title="鸿蒙加固初判(保守: 无迹象/疑似,家族名=候选非定论)">
                    加固初判: {meta.harden === 'suspected' ? '疑似' : '无迹象'}
                  </span>
                )}
                {meta?.platform === 'ios' && (
                  <span className={`px-1.5 py-0.5 rounded-pill text-meta font-mono ${meta.fairplay_encrypted ? 'bg-jz-sev-high/10 text-jz-sev-high' : 'bg-jz-teal/10 text-jz-teal'}`}
 title={meta.fairplay_encrypted ? 'App Store FairPlay 加密(cryptid=1): __TEXT 密文区静态面降级,砸壳需设备' : '未加密(企业签/TF/重签形态),静态面全开'}>
                    {meta.fairplay_encrypted ? `FairPlay 加密(cryptid=${meta.cryptid})` : `cryptid=${meta.cryptid} 未加密`}
                  </span>
                )}
              </div>
            </div>
            {strong
              ? <StatusBadge tone="medium" title={`加固类型: ${preview.packer}(展示用,不入授权字段)`}>壳: {preview.packer}</StatusBadge>
              : <StatusBadge tone="custom" className="bg-jz-teal/10 text-jz-teal">未检测到已知加固</StatusBadge>}
          </div>

          {/* 包结构树(预检真值子集) */}
          <div className="px-3 py-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-body font-semibold text-jz-ink-2">包结构树</span>
              <StatusBadge tone="info">预检真值子集</StatusBadge>
            </div>
            <div className="rounded-control bg-jz-surface-2/40 px-2.5 py-2 font-mono text-meta space-y-1" data-pkg-tree>
              <div className="flex items-center gap-1.5 flex-wrap" data-tree-node="root">
                <Package size={12} className="text-jz-brand flex-none" />
                <span className="text-jz-ink">{meta?.package || preview.filename || '—'}</span>
                {meta && <span className="text-jz-muted tnum">v{meta.version_name ?? '—'} ({meta.version_code ?? '—'})</span>}
              </div>
              {(preview.abis || []).length ? (
                <div className="pl-4 flex items-center gap-1.5 flex-wrap" data-tree-node="lib">
                  <span className="text-jz-muted">└ lib/</span>
 {preview.abis.map((a: string) => (
                    <span key={a} className="px-1.5 py-0.5 rounded-control bg-jz-surface-2/60 text-jz-ink-2">{a}</span>
                  ))}
                </div>
              ) : (
                <div className="pl-4 text-jz-muted" data-tree-node="lib">└ lib/ 无原生库(真值)</div>
              )}
              {meta && (
                <div className="pl-4 flex items-center gap-x-3 gap-y-0.5 flex-wrap" data-tree-node="manifest"
 title="统计口径: 静态预检 AndroidManifest 解析真值——N=清单声明总数, 导出=exported 或含 intent-filter 的组件计数, 零推断">
                  <span className="text-jz-muted">└ AndroidManifest</span>
 {(['activity', 'service', 'receiver', 'provider'] as const).map((t) => (
                    <span key={t} className="text-jz-ink-2 tnum">{t} {comp[t]?.total ?? 0}<span className="text-jz-muted">(导出 {comp[t]?.exported ?? 0})</span></span>
                  ))}
                </div>
              )}
              {meta && (
                <div className="pl-4 text-jz-muted" data-tree-node="perm"
 title="统计口径: 静态预检 manifest 声明的 uses-permission 条目计数真值(不含自定义 permission 定义)">└ 权限 {meta.permissions_count} 项(计数真值)</div>
              )}
            </div>
            <div className="text-meta text-jz-muted">本树为预检返回的真值子集(完整 ZIP 目录树不在预检返回范围),不做任何推断补全。</div>
          </div>

          {/* 加固告警(壳信息仅展示,严禁写进 authorized) */}
          {strong && (
            <div className="px-3 py-3">
              <div className="rounded-card bg-jz-sev-medium/10 px-2.5 py-2 text-body text-jz-sev-medium" data-shell-warning>
                ⚠ 检测到加固壳 {preview.packer}——提交审计任务将自动脱壳后分析(dyn_cap 判级由后端派生,壳信息不写入任务授权字段)
              </div>
            </div>
          )}

          {/* 推荐测试模块 + 一键应用 */}
          <div className="px-3 py-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-body font-semibold text-jz-ink-2">推荐测试模块</span>
              <StatusBadge tone="info">依据=预检真值</StatusBadge>
              <span className="flex-1" />
              <button onClick={applyRecs} data-rec-apply-btn
 title="将带「推荐」标记的模块一键设为当前勾选范围(仅预检可判定项;无可判定项时如实提示)"
 className="inline-flex items-center gap-1 px-2.5 h-7 rounded-control bg-jz-brand/10 text-meta font-semibold text-jz-brand hover:bg-jz-brand/20 transition-colors">
                ✨ 一键应用推荐模块
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap" data-rec-modules>
 {recs.map((r) => (
                <span key={r.name} data-rec-module={r.name} title={r.basis}
 className={`inline-flex items-center gap-1 px-2 py-1 rounded-pill text-meta transition-colors ${r.rec ? 'bg-jz-brand/10 text-jz-ink font-semibold' : 'bg-jz-surface-2/50 text-jz-muted'}`}>
                  {r.rec && <span className="w-1.5 h-1.5 rounded-pill bg-jz-brand flex-none" />}
                  {r.name}
                  <span className={r.rec ? 'text-jz-brand' : 'text-jz-muted'}>{r.rec ? '推荐' : '默认纳入'}</span>
                </span>
              ))}
            </div>
            <div className="text-meta text-jz-muted">「推荐」仅依据预检真值(导出组件&gt;0);无判定依据的模块默认纳入——静态审计任务本身按平台全量规则执行,不因勾选缩水。</div>
          </div>

          {/* 关键元数据(大字号 KeyVal) */}
          <div className="px-3 py-3 space-y-1.5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-body">
              <div className="flex justify-between gap-2"><span className="text-jz-muted">版本</span><span className="font-mono text-jz-ink tnum truncate">{meta ? `${meta.version_name ?? '—'} (${meta.version_code ?? '—'})` : '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-jz-muted">SDK 范围</span><span className="font-mono text-jz-ink tnum truncate">{meta ? `min ${meta.min_sdk ?? '—'} · target ${meta.target_sdk ?? '—'}` : '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-jz-muted">大小</span><span className="font-mono text-jz-ink tnum">{preview.size_mb ? `${preview.size_mb}MB` : '—'}</span></div>
              <div className="flex justify-between gap-2"><span className="text-jz-muted">权限数</span><span className="font-mono text-jz-ink tnum">{meta ? meta.permissions_count : '—'}</span></div>
            </div>
            <div className="text-meta font-mono text-jz-muted break-all" title={preview.sha256 ? `SHA256 全文: ${preview.sha256}` : undefined}>
              SHA256 {preview.sha256 ? preview.sha256.slice(0, 16) + '…' : '—'}
              {preview.meta_error ? ` · ⚠ 元数据降级: ${preview.meta_error}` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════ 下舱:  任务执行蓝图与一键启动底座 ═══════════

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
  const launchDisabled = p.busy || !p.preview || !p.authorized || !!p.webTargetErr;
  return (
    <div className="rounded-panel bg-jz-surface shadow-card p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-section md:text-title font-semibold text-jz-ink"> 任务执行蓝图与一键启动</h3>
        <StatusBadge tone="info" title="口径: 预检=本页已完成真值;其余阶段为提交后按平台全量规则执行的待执行阶段(0/1),非实时进度;完成态以任务中心为准">实时汇总</StatusBadge>
      </div>

      {/* 实时汇总(资产/模式/设备/授权) */}
      <div className="divided-card-list text-body" data-summary-list>
        <div className="flex items-start justify-between gap-3 px-3 py-2" data-summary-asset>
          <span className="text-jz-muted flex-none">当前资产</span>
          <span className="font-mono text-jz-ink text-right break-all min-w-0">
            {p.preview?.filename || (p.apkPath ? p.apkPath.split('/').pop() : '') || '未接入(左侧 ① 完成接入)'}
            {p.preview?.strong_shell && <Badge level="medium">壳</Badge>}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2" data-summary-mode>
          <span className="text-jz-muted flex-none">所选模式</span>
          <span className="text-jz-ink text-right truncate" title={`${p.mode} · ${p.baseline} · ${p.rateLimit} req/s`}>
            {p.mode} · {p.baseline} · {p.rateLimit} req/s
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2" data-summary-device>
          <span className="text-jz-muted flex-none">目标设备</span>
          <span className={`font-mono text-right break-all min-w-0 ${p.device ? 'text-jz-brand' : 'text-jz-muted'}`}>
            {p.device || (p.staticOnly ? '静态免设备(可选挂载)' : '未选(动态阶段需真机)')}
          </span>
        </div>
      </div>

      {/* 执行蓝图(PipelineStepper 真实消费) */}
      <div className="space-y-1.5" data-exec-blueprint>
        <div className="text-body font-semibold text-jz-ink-2">预计工作流阶段</div>
        <PipelineStepper phases={p.blueprint} />
        <div className="text-meta text-jz-muted">
          任务创建后按此链执行{p.device ? `,设备 ${p.device} 供动态脱壳优先调度` : '(未选设备: 静态链,无需设备)'};阶段完成态以任务中心为准。
        </div>
      </div>

      {/* 授权确认契约(壳信息不入授权字段) */}
      <label className="flex items-start gap-2 text-body text-jz-ink-2 cursor-pointer">
        <input type="checkbox" checked={p.authorized} onChange={(e) => p.setAuthorized(e.target.checked)} data-authorized-check className="mt-0.5" />
        我确认对该样本拥有合法测试授权(授权确认将随任务落档;壳信息不写入授权字段)
      </label>

      {/* 一键启动主按钮 */}
      <button onClick={() => p.submit(false)} disabled={launchDisabled} data-launch-btn data-submit-task
 title={launchDisabled
 ? '需先完成: ① 资产预检通过 + 勾选授权确认(Web 目标格式须合法)'
 : '创建审计任务(设备/范围/模式预选随任务写入向导 prefill)'}
 className="w-full h-12 rounded-card text-section font-semibold text-jz-on-brand bg-jz-brand hover:bg-jz-brand/85 shadow-dialog hover: transition-all disabled:opacity-40 disabled:pointer-events-none active:scale-[0.99] inline-flex items-center justify-center gap-2">
        {p.busy ? '创建中…' : ' 立即启动安全审计任务'}
      </button>
      <Button variant="ghost" className="w-full justify-center" onClick={() => p.submit(true)} disabled={launchDisabled} data-submit-pentest
 title="创建审计任务并携带设备/范围/模式预选前往渗透会话向导">
        创建并前往渗透会话(预选随行)
      </Button>

      {/* 全局状态行 */}
      {p.status && <div className="text-body text-jz-brand" data-status-line>{p.status}</div>}
      {p.createdId != null && <div className="text-body text-jz-teal" data-created-line>✓ 任务 #{p.createdId} 已创建,正在跳转…</div>}
    </div>
  );
};
