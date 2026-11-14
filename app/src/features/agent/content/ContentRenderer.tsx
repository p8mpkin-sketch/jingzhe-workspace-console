import React from 'react';
import { MarkdownMessage } from '@/features/ai-assistant/MarkdownMessage';
import { FindingList } from './FindingList';
import { DataTable } from './DataTable';
import type { ContentBlock, EvidenceView } from './types';

export const ContentRenderer: React.FC<{ blocks: ContentBlock[]; sessionId?: string; evidence?: EvidenceView[] }> = ({ blocks, sessionId, evidence = [] }) => (
  <>
    {blocks.map((b, i) => {
      if (b.type === 'finding_list') return <FindingList key={i} items={b.items} sessionId={sessionId} evidence={evidence} />;
      if (b.type === 'data_table') return <DataTable key={i} headers={b.headers} rows={b.rows} />;
      return <MarkdownMessage key={i} content={b.text} maskSecrets={false} />;
    })}
  </>
);
