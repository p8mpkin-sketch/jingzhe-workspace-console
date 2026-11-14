import React from 'react';

// R108-1(指令1①): SkeletonLoader 三类骨架(卡片/表格行/图表)——暗亮双模 Shimmer 流变动效。
// 动效=纯 CSS(index.css @keyframes apksec-shimmer, 高光色随 html.dark 双段变量派生, 零依赖)。
// 与既有 Skeleton 语义兼容: 同 token 底色(bg-jz-elevated/70)+rounded, 消费方可无缝二选一;
// 既有 Skeleton(pulse)原样保留零改动(只加不改), 双动效不混用以避免 pulse 透明度振荡与扫描高光互相干扰。

export type SkeletonVariant = 'card' | 'table' | 'chart';

/** 骨架基元: Shimmer 扫描块(替代 pulse 的流变呈现, 底色/圆角与既有 Skeleton 同 token 语义) */
const Bone: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', style, ...rest }) => (
  <div className={`apksec-shimmer rounded bg-jz-elevated/70 ${className}`} style={style} aria-hidden="true" {...rest} />
);

export const SkeletonLoader: React.FC<{
 variant?: SkeletonVariant;
 /** table 变体行数(默认 4; 其余变体忽略) */
 rows?: number;
 className?: string;
}> = ({ variant = 'card', rows = 4, className = '' }) => {
  if (variant === 'table') {
    return (
      <div className={`space-y-2.5 ${className}`} role="status" aria-label="加载中">
 {Array.from({ length: Math.max(rows, 1) }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-3 w-8 shrink-0" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === 'chart') {
    return (
      <div
 className={`flex items-end gap-2 h-40 p-3 rounded-lg border border-jz-border bg-jz-surface ${className}`}
 role="status"
 aria-label="加载中"
 >
 {[38, 62, 46, 74, 56, 86, 68, 50].map((h, i) => (
          <Bone key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  }
  return (
    // card(默认): 头像位+标题行+三行正文
    <div
 className={`rounded-lg border border-jz-border bg-jz-surface p-4 space-y-3 ${className}`}
 role="status"
 aria-label="加载中"
 >
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-md shrink-0" />
        <Bone className="h-3 w-1/3" />
      </div>
      <Bone className="h-3 w-full" />
      <Bone className="h-3 w-5/6" />
      <Bone className="h-3 w-2/3" />
    </div>
  );
};
