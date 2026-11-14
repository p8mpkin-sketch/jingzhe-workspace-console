import type { ContentBlock } from './content/types';

export interface AgentSession {
  id: string;
  title: string;
  task_id?: number | null;
  mode?: 'agent' | 'quick';
  kind?: 'task' | 'test' | 'quick' | 'agent';
  status?: string;
  created_at?: number;
  updated_at?: number;
  last_seq?: number;
  last_event_type?: string;
  preview?: string;
  risk?: { critical: number; high: number; medium: number; low: number; total: number };
}

export interface AgentEvent {
  seq: number;
  session_id?: string;
  turn_id?: number | null;
  step_id?: number | null;
  type: string;
  data: any;
  ts?: number;
}

export interface AgentNode {
  id: string;
  seq?: number;
  kind: 'user' | 'assistant' | 'tool' | 'approval' | 'compaction' | 'todo' | 'goal' | 'error' | 'turn_end';
  text?: string;
  tool_calls?: any[];
  reasoning?: string;
  tool_call_id?: string;
  approval_id?: string;
  tool?: string;
  decision?: string;
  covered_until_seq?: number;
  source_events?: number;
  items?: Array<{ text: string; status: string }>;
  objective?: string;
  criteria?: string[];
  call_id?: string;
  name?: string;
  args?: any;
  status?: string;
  summary?: string;
  data?: any;
  citations?: any[];
  elapsed_ms?: number;
  usage?: any;
  model?: string;
  interrupted?: boolean;
  message?: string;
  reason?: string;
  turn?: number;
  blocks?: ContentBlock[];
}

export interface AgentSnapshot {
  session: AgentSession;
  events: AgentEvent[];
  nodes: AgentNode[];
  last_seq: number;
  stats?: any;
  running?: boolean;
}
