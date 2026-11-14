import React from 'react';
import { Smartphone, Bug, Radio, PlayCircle, type LucideIcon } from 'lucide-react';

// R108-1(指令1②): EmptyStatePlaceholder 统一空态面板(轻盈图标+标题+副标+可选操作按钮)。
// 内置四场景预设, 文案如实不编造数据(全局红线 1);消费方也可传自定义 icon/title/subtitle/action。
// 仅呈现组件, 零数据获取零副作用(R108-2 接入轮负责替换各页零散空文案, 本轮零页面 diff)。

export interface EmptySceneDef {
  key: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

/** 场景预设(指令1②四场景; 副标均为如实描述, 不臆造数据状态) */
export const EMPTY_SCENES = {
  /** 暂无设备: 设备轮询/设备列表为空 */
  noDevices: { key: 'no-devices', icon: Smartphone, title: '暂无设备', subtitle: '尚未连接任何测试设备' },
  /** 暂无漏洞发现: 漏洞矩阵/发现列表为空 */
  noFindings: { key: 'no-findings', icon: Bug, title: '暂无发现项', subtitle: '当前会话尚未产出发现项' },
  /** 流量为空: 代理/Burp 桥捕获列表为空 */
  noTraffic: { key: 'no-traffic', icon: Radio, title: '流量为空', subtitle: '尚未捕获到任何代理流量' },
  /** 会话未启动: 运行数据位在会话启动前呈现 */
  sessionNotStarted: { key: 'session-not-started', icon: PlayCircle, title: '会话未启动', subtitle: '启动会话后此处将呈现运行数据' },
} as const satisfies Record<string, EmptySceneDef>;

export type EmptySceneKey = keyof typeof EMPTY_SCENES;

export const EmptyStatePlaceholder: React.FC<{
 /** 场景预设(传 key 名或完整定义; 与 icon/title/subtitle 同传时后者覆盖) */
 preset?: EmptySceneKey | EmptySceneDef;
 icon?: LucideIcon;
 title?: string;
 subtitle?: string;
 /** 可选操作按钮区(由消费方注入, 如 Button) */
 action?: React.ReactNode;
 /** 紧凑态(小容器/面板内使用) */
 compact?: boolean;
 className?: string;
}> = ({ preset, icon, title, subtitle, action, compact = false, className = '' }) => {
  const p: EmptySceneDef | undefined = typeof preset === 'string' ? EMPTY_SCENES[preset] : preset;
  const Icon = icon ?? p?.icon;
  const t = title ?? p?.title ?? '暂无数据';
  const s = subtitle ?? p?.subtitle;
  return (
    <div
 className={`flex flex-col items-center justify-center text-center ${
 compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-6 py-10'
 } ${className}`}
 >
      {Icon && (
        <div className="flex items-center justify-center w-10 h-10 rounded-control bg-jz-surface-2/60 text-jz-muted shrink-0">
          <Icon className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
      )}
      <div className="text-body font-medium text-jz-ink">{t}</div>
      {s && <div className="text-meta text-jz-muted max-w-[220px] leading-relaxed">{s}</div>}
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  );
};
