// SkillCard.tsx — 已入库技能资产卡(Rxxx 重构):
// 大字排版(技能名 text-section font-semibold font-mono tracking-tight)+ 色彩分层(已启用=顶部 h-1 类别渐变指示条+
// 高对比 ring;已停用=弱化 opacity-80 hover 回满)+ 注册路径精简胶囊(formatSkillPath,title 全路径+点击复制)+
// 底部按钮重排(左  挂载 / 右 </> 源码 + 启用停用 + 幽灵删除图标,内置删除二次确认在页内 delSkill)。
// 字号八档口径: 本文件 font 一律 11/12/13/14/16/20/24/28。
import React, { useState } from 'react';
import { Check, Plug, Trash2, Unplug } from 'lucide-react';
import { fmtTime, formatSkillPath, iconOf, kindOf, KIND_GRADIENT } from './skillsShared';
import type { SkillRow } from './skillsShared';

/** 注册路径胶囊: 缩短展示+title 全路径+点击复制(复制成功打勾 1.4s 回弹)。 */
const PathPill: React.FC<{ rawPath: string }> = ({ rawPath }) => {
 const fp = formatSkillPath(rawPath);
 const [copied, setCopied] = useState(false);
 const copy = async () => {
 try {
 await navigator.clipboard.writeText(rawPath);
 setCopied(true);
 setTimeout(() => setCopied(false), 1400);
    } catch { /* 剪贴板不可用静默(全路径仍在 title) */ }
  };
  return (
    <button onClick={copy} data-skill-path-pill
 title={`完整注册路径(点击复制):\n${rawPath}`}
 className="min-w-0 inline-flex items-center gap-1 max-w-full font-mono text-meta rounded-control bg-jz-surface-2/60 px-2 py-0.5 text-jz-muted hover:text-jz-brand transition-colors">
      <span className="shrink-0">{fp.icon}</span>
      <span className="truncate">{fp.label}</span>
      {copied && <Check className="w-3 h-3 text-jz-teal shrink-0" />}
    </button>
  );
};

export const SkillCard: React.FC<{
 s: SkillRow;
 isLocal: boolean;
 isMounted: boolean;
 mountTid: number | null;
 isAdmin: boolean;
 onMount: (s: SkillRow) => void;
 onUnmount: (s: SkillRow) => void;
 onSource: (s: SkillRow) => void;
 onStatus: (s: SkillRow, status: 'active' | 'disabled') => void;
 onDelete: (s: SkillRow) => void;
}> = ({ s, isLocal, isMounted, mountTid, isAdmin, onMount, onUnmount, onSource, onStatus, onDelete }) => {
  const kind = kindOf(s);
  const Icon = iconOf(s);
  const isDraft = s.status === 'draft';
  const isDisabled = s.status === 'disabled';
  const active = !isDraft && !isDisabled;
  const grad = KIND_GRADIENT[kind.tab] || 'from-jz-brand to-jz-brand dark:from-jz-brand dark:to-jz-brand';
  const uses = s.uses || 0;
  const wins = s.wins || 0;
  return (
    <div data-skill-card={s.name}
 className={`relative overflow-hidden rounded-panel shadow-card p-5 pt-4 flex flex-col gap-2.5 transition-all ${active
 ? 'bg-jz-surface ring-1 ring-jz-border/50 hover:ring-jz-brand/40 hover:'
 : 'bg-jz-surface/70 ring-1 ring-jz-border/25 opacity-80 hover:opacity-100'}`}>
      {/* 顶部 h-1 类别渐变指示条(仅已启用;草案/停用不亮条) */}
      {active && <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${grad}`} />}

      {/* 头部: 图标 + 技能名大字(font-mono tracking-tight)+ 类型/验证标签;右上状态/实战徽章 */}
      <div className="flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-control bg-jz-brand/10 text-jz-brand grid place-items-center shrink-0" title={kind.tab}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-section font-semibold font-mono tracking-tight text-jz-ink truncate" title={s.name}>{s.name}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink-2"
 title={`来源按 source_path·status 推断: ${s.source_path}`}>{kind.label}</span>
            <span className="px-2.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-muted">{kind.tab}</span>
            {isLocal && (
              <span className="px-2.5 py-0.5 rounded-control text-meta bg-jz-sev-medium/10 text-jz-sev-medium"
 title="本地层技能(localStorage)——后端无自建技能端点,显性标注">本地</span>
            )}
            {isDraft && <span className="px-2.5 py-0.5 rounded-control text-meta bg-jz-sev-medium/10 text-jz-sev-medium">草案</span>}
            {/* last_verified_at=扫描/导入时的文件 mtime(装饰性参考),如实标注不冒充验证时间 */}
            <span className="px-2.5 py-0.5 rounded-control bg-jz-surface-2/60 font-mono text-meta text-jz-muted"
 title="last_verified_at=收编/导入时的文件 mtime(装饰性参考,非运行验证时间)">验证 {fmtTime(s.last_verified_at)}</span>
          </div>
        </div>
        <div className="shrink-0">
          {isDraft ? (
            <span className="px-2.5 py-0.5 rounded-control text-meta bg-jz-sev-medium/10 text-jz-sev-medium whitespace-nowrap">⚗ 待转正</span>
          ) : isDisabled ? (
            <span className="px-2.5 py-0.5 rounded-control text-meta bg-jz-surface-2/70 text-jz-muted whitespace-nowrap">⏸ 停用</span>
 ) : uses > 0 ? (
            <span className="px-2.5 py-0.5 rounded-control text-meta font-semibold bg-jz-sev-high/10 text-jz-sev-high whitespace-nowrap"
 title={`实战回流真值(R125): ${wins}/${uses} 任务脱出成功——来自 skill_outcomes 表按任务记录`}>
              实战{uses}·胜{wins}{s.success_rate != null ? `|成功率${Math.round(s.success_rate * 100)}%` : ''}
            </span>
          ) : s.success_rate != null ? (
            <span className="px-2.5 py-0.5 rounded-control text-meta font-semibold bg-jz-sev-high/10 text-jz-sev-high whitespace-nowrap"
 title="success_rate 为后端口径真值">成功率 {Math.round(s.success_rate * 100)}%</span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-control text-meta font-medium bg-jz-teal/10 text-jz-teal whitespace-nowrap"
 title="在册且启用——参与 AI 自动选技">🟢 已启用</span>
          )}
        </div>
      </div>

      {/* 描述: text-body leading-relaxed + 两行钳制 + 占位高(等高栅格) */}
      <div className="text-body text-jz-ink-2 leading-relaxed line-clamp-2 min-h-[44px]" title={s.description || undefined}>
        {s.description || '—'}
      </div>

 {/* R599: 实战胜率微型条(wins/uses 真值比例;uses>0 才渲染,无样本不画) */}
 {uses > 0 && (() => {
        const pct = Math.round((wins / uses) * 100);
        return (
          <div className="flex items-center gap-1.5" data-skill-winbar={s.name} title={`实战胜率真值: ${wins}/${uses} = ${pct}%(skill_outcomes 回流)`}>
            <span className="h-1 flex-1 rounded-pill bg-jz-surface-2 overflow-hidden flex-none w-20">
              <span className={`block h-full ${pct >= 80 ? 'bg-jz-teal' : pct >= 50 ? 'bg-jz-sev-medium' : 'bg-jz-sev-critical'}`}
 style={{ width: `${pct}%` }} />
            </span>
            <span className="font-mono text-meta tnum text-jz-muted">{pct}%</span>
          </div>
        );
      })()}

      {/* 注册路径精简胶囊(严禁 /Users/... 裸奔;title 全路径+点击复制) */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-meta text-jz-muted shrink-0">来源</span>
        <PathPill rawPath={s.source_path} />
      </div>

      {/* 底部操作行: 左  挂载(h-8 px-3)/ 右 </> 源码 + 启用/停用 + 幽灵删除图标;mt-auto 吸底 */}
      <div className="flex items-center gap-1.5 pt-1 mt-auto">
        {isLocal ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-control bg-jz-surface-2/60 text-meta text-jz-muted"
 title="本地层技能不参与挂载(挂载链=后端 /api/tasks/{tid}/skills 端点域)">本地·不参与挂载</span>
        ) : isMounted ? (
          <button onClick={() => onUnmount(s)} data-unmount-btn={s.name}
 className="inline-flex items-center gap-1 h-8 px-3 rounded-control bg-jz-teal/10 text-jz-teal text-meta font-medium hover:bg-jz-teal/20">
            <Unplug className="w-3.5 h-3.5" />卸载
          </button>
        ) : (
          <button onClick={() => onMount(s)} data-mount-btn={s.name}
 className="inline-flex items-center gap-1 h-8 px-3 rounded-control bg-jz-brand/10 text-jz-brand text-meta font-medium hover:bg-jz-brand/20">
             挂载
          </button>
        )}
        {isMounted && <span className="text-meta text-jz-teal font-mono">{`✓ 已挂 #${mountTid}`}</span>}
        <span className="flex-1" />
        {isAdmin && isDraft && (
          <button onClick={() => onStatus(s, 'active')} data-skill-promote={s.name}
 title="草案转正——参与 AI 自动选技(AI+技能库+实战理念: 实战缺口蒸馏→人工复核→转正)"
 className="inline-flex items-center h-8 px-3 rounded-control bg-jz-teal/10 text-jz-teal text-meta font-medium hover:bg-jz-teal/20">✓ 转正</button>
        )}
        <button onClick={() => onSource(s)} data-source-btn={s.name}
 title="源码大号预览(只读抽屉,GET /api/skills/{id}/source)"
 className="inline-flex items-center gap-1 h-8 px-3 rounded-control bg-jz-surface-2/60 text-jz-ink-2 text-meta hover:text-jz-brand transition-colors">
          <span className="font-mono">{'</>'}</span>源码
        </button>
        {isAdmin && active && (
          <button onClick={() => onStatus(s, 'disabled')} data-skill-disable={s.name}
 title="停用——保留在册与实战统计,AI 编排器不再自动选它"
 className="h-8 px-3 rounded-control bg-jz-surface-2/60 text-jz-muted text-meta hover:text-jz-sev-medium transition-colors">停用</button>
        )}
        {isAdmin && isDisabled && (
          <button onClick={() => onStatus(s, 'active')} data-skill-enable={s.name}
 title="启用——恢复参与 AI 自动选技"
 className="h-8 px-3 rounded-control bg-jz-brand/10 text-jz-brand text-meta hover:bg-jz-brand/20 transition-colors">启用</button>
        )}
        {isAdmin && (
          <button onClick={() => onDelete(s)} data-skill-delete={s.name}
 title={`删除「${s.name}」${kind.label === '内置' ? '(内置技能,将二次确认)' : ''}——挂载引用防呆在后端 409`}
 className="p-2 rounded-control text-jz-muted hover:text-jz-sev-critical hover:bg-jz-sev-critical/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
