export interface EvidenceView {
  key: string;
  kind: 'source' | 'link' | 'task' | 'verification';
  label: string;
  detail?: string;
  url?: string;
  path?: string;
  toolId?: string;
}

export interface FindingView {
  index: string;
  severity: string;
  fileLine: string;
  value: string;
  rawValue: string;
  purpose: string;
  verification: string;
  verified: boolean;
  sensitivity?: 'public' | 'secret';
  revealRef?: string;
}

export type ContentBlock =
  | { type: 'markdown'; text: string }
  | { type: 'finding_list'; items: FindingView[] }
  | { type: 'data_table'; headers: string[]; rows: string[][] };
