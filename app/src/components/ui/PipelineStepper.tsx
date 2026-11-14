import React from 'react';
import { Check, X, Loader2, Clock } from 'lucide-react';

export interface StepperPhase {
  key: string;
  name: string;
  done: number;
  total: number;
  state?: 'ok' | 'error' | 'skipped' | null;
}

/** R38 P0-2: 任务编排流水线步骤条(文档: 任务编排可视化) */
export const PipelineStepper: React.FC<{ phases: StepperPhase[] }> = ({ phases }) => {
  return (
    <div className="flex items-start overflow-x-auto py-1">
 {phases.map((ph, i) => {
 const complete = ph.done >= ph.total && ph.total > 0;
 const running = !complete && ph.done > 0;
        const failed = ph.state === 'error';
        const col = failed ? 'text-jz-sev-critical' : complete ? 'text-jz-teal' : running ? 'text-jz-brand' : 'text-jz-muted';
        const ring = failed ? 'border-jz-sev-critical' : complete ? 'border-jz-teal' : running ? 'border-jz-brand' : 'border-jz-border';
        return (
          <React.Fragment key={ph.key}>
            <div className="flex flex-col items-center min-w-[92px] px-1">
              <div className={`w-8 h-8 rounded-pill border-2 grid place-items-center bg-jz-surface ${ring} ${col}`}>
                {complete ? <Check className="w-4 h-4" />
                  : failed ? <X className="w-4 h-4" />
                  : running ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Clock className="w-3.5 h-3.5" />}
              </div>
              <span className={`mt-1.5 text-meta font-medium text-center leading-4 ${complete || running ? 'text-jz-ink' : 'text-jz-muted'}`}>
                {ph.name}
              </span>
              <span className="text-meta font-mono text-jz-muted tnum">{ph.done}/{ph.total}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`flex-1 min-w-[24px] h-0.5 mt-4 ${complete ? 'bg-jz-teal/60' : 'bg-jz-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
