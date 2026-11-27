import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Page, PageHeader, StaleNotice } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { useDashboardReads } from './useDashboardReads';
import { GlobalSignal, DomainDistribution } from './GlobalSignal';
import { RecentAssessments, SessionEvents } from './RecentWork';

/**
 * Overview (V3 Phase 8). First screen: one sentence from the numbers that were read, what needs attention now,
 * the readout row and the tasks running now. Below: recent assessments beside the session events, then the
 * findings by domain. Each read keeps its own state (readout.ts); nothing unread is shown as 0.
 */
export const DashboardPage: React.FC = () => {
  const reads = useDashboardReads();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const iv = setInterval(() => setNow(Date.now() / 1000), 10_000); return () => clearInterval(iv); }, []);
  // Page-level notice when a refresh failed for reads that are still on screen.
  const stale = [reads.summary, reads.sev, reads.queued, reads.tasks, reads.sessions, reads.domains, reads.running, ...(reads.nodes ? [reads.nodes] : [])]
    .filter((r) => r.state === 'stale').length;
  return (
    <Page data-dashboard-page>
      <PageHeader title={moduleLabel('/dashboard')} description="评估队列、需要处理的事项和最近的工作。"
        actions={<Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={reads.refresh} data-dashboard-refresh>刷新</Button>} />
      {stale > 0 && <StaleNotice reason={`${stale} 项读数最近一次刷新未成功，显示的是上次读到的数。`} onRefresh={reads.refresh} />}
      <GlobalSignal reads={reads} now={now} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8"><RecentAssessments reads={reads} /></div>
        <div className="relative min-w-0 lg:col-span-4">
          <SessionEvents reads={reads} className="max-lg:h-[28rem] lg:absolute lg:inset-0" />
        </div>
      </div>
      <DomainDistribution read={reads.domains} />
    </Page>
  );
};

export default DashboardPage;
