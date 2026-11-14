import type { AgentNode } from '../types';

export interface TurnView {
  key: string;
  user?: AgentNode;
  final?: AgentNode;
  process: AgentNode[];
  approvals: AgentNode[];
  errors: AgentNode[];
  tools: AgentNode[];
  compactions: AgentNode[];
  turnEnd?: AgentNode;
  metrics: { models: number; tools: number; errors: number };
}

const isFinal = (n: AgentNode): boolean =>
  n.kind === 'assistant' && !!String(n.text || '').trim();

export function projectTurns(nodes: AgentNode[]): TurnView[] {
  const turns: TurnView[] = [];
  let current: AgentNode[] | null = null;
  let user: AgentNode | undefined;

  const flush = () => {
    if (!current || (!user && !current.length)) return;
    const group = current;
    const assistants = group.filter(isFinal);
    const final = assistants.length ? assistants[assistants.length - 1] : undefined;
    const process = group.filter((n) => n !== final);
    turns.push({
      key: user?.id || group[0]?.id || `turn-${turns.length}`,
      user,
      final,
      process,
      approvals: process.filter((n) => n.kind === 'approval'),
      errors: process.filter((n) => n.kind === 'error'),
      tools: process.filter((n) => n.kind === 'tool'),
      compactions: process.filter((n) => n.kind === 'compaction'),
      turnEnd: group.find((n) => n.kind === 'turn_end'),
      metrics: {
        models: group.filter((n) => n.kind === 'assistant').length,
        tools: group.filter((n) => n.kind === 'tool').length,
        errors: group.filter((n) => n.kind === 'error').length,
      },
    });
    current = null;
    user = undefined;
  };

  for (const node of nodes) {
    if (node.kind === 'user') {
      flush();
      user = node;
      current = [];
      continue;
    }
    if (node.kind === 'goal' || node.kind === 'todo') continue;
    if (!current) current = [];
    current.push(node);
    if (node.kind === 'turn_end') flush();
  }
  flush();
  return turns;
}
