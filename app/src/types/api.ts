// types/api.ts — R108-3(指令3①) API 契约 DTO 固化。
// 口径: shape 全部从既有真实回包固化(2026-09-27 curl 真值——/api/pentest/projects、/sessions、
// /devices、/vulns/grouped、/graph、/events、/burp/status、/autopilot/status、/approvals、/api_tree),
// 不臆造字段;可选性=该字段在真实回包中可缺席(空会话/历史数据/端点分档),消费方沿用既有可选链语义。
// 既有 types/pentest.ts(页面本地视图类型)原样保留,逐步由消费方按需迁移。

/** 项目实体(GET /api/pentest/projects 行真值;app_count=端点伴随聚合字段) */
export interface ProjectEntity {
  id: number;
  name: string;
  note?: string;
  user_id?: number | null;
  created_at?: number;
  app_count?: number;
}

/** 会话实体(GET /api/pentest/sessions 行真值;明细端点 GET /sessions/{sid} 额外携带 manifest,列表行缺席) */
export interface SessionEntity {
  id: number;
  task_id: number;
  task_dir?: string;
  package: string;
  device?: string;
  status: string;
  authorized?: string;
  user_id?: number | null;
  org_id?: number | null;
  created_at?: number;
  updated_at?: number;
  project_id?: number | null;
  app_name?: string | null;
  packer?: string;
  runner?: { running: boolean };
  /** 仅明细端点返回(R590-P4b: platform 三端维度 android/harmony/ios,缺省 android) */
  manifest?: { platform?: string; version?: string; [k: string]: unknown };
}

/** 设备节点 DTO(GET /api/pentest/devices 行真值;stores/pentest DeviceRow 为其消费子集视图) */
export interface DeviceNodeDTO {
  serial: string;
  model?: string;
  android?: string;
  abi?: string;
  root?: boolean;
  frida?: boolean;
}

/** 漏洞发现记录 DTO(GET /sessions/{sid}/vulns/grouped → cards[].instances[] 行真值) */
export interface VulnerabilityRecordDTO {
  id: string;
  state: string;
  severity?: string;
  evidence?: string;
  repro?: string;
  rule_id?: string;
  phase?: string;
}

/** 漏洞规则卡(vulns/grouped cards[] 聚合真值,记录按卡分组的视图) */
export interface VulnerabilityCardDTO {
  rule_id?: string;
  title: string;
  severity: string;
  masvs?: string;
  layer?: string;
  instance_count: number;
  phases?: string[];
  states?: Record<string, number>;
  instances: VulnerabilityRecordDTO[];
}

/** 画布图节点/边(GET /sessions/{sid}/graph 真值;meta=源数据透传) */
export interface CanvasGraphNode {
  id: string;
  type: string;
  label?: string;
  meta?: Record<string, unknown>;
}
export interface CanvasGraphEdge {
  from: string;
  to: string;
  type?: string;
  relation?: string;
}

/** 画布图 DTO(graph 回包真值;chains/node_counts=端点伴随聚合,旧空图分支无节点键) */
export interface CanvasGraphDTO {
  status?: string;
  nodes: CanvasGraphNode[];
  edges: CanvasGraphEdge[];
  node_counts?: Record<string, number>;
  chains?: unknown[];
  total_events?: number;
  truncated?: boolean;
}

/** 终端事件行(hook/evidence/bridge 源真值;bridge 行携带 host/path/size,余者缺席) */
export interface TerminalLogEvent {
  seq: number;
  ts?: string;
  type?: string;
  host?: string;
  path?: string;
  size?: number;
  title?: string;
  name?: string;
  detail?: unknown;
  note?: string;
  url?: string;
  /** 事件类型异构(按 type 分档),尾索引自证不臆造闭合 shape */
  [k: string]: unknown;
}

/** 事件日志分页块(GET /sessions/{sid}/events 分页壳真值 — 终端/监控/桥流量/决策流共用) */
export interface TerminalLogChunk<T = TerminalLogEvent> {
  source?: string;
  events: T[];
  cursor?: number;
  returned?: number;
  total?: number;
  truncated?: boolean;
}

/** AI 决策流事件(progress 源真值: autopilot_start/triage_done/step_start/step_done/login_* 与 skill_* 系列等) */
export interface AgentThoughtEvent extends TerminalLogEvent {
  phase?: string;
  tool?: string;
  role?: string;
}

/** 接口清单条目(GET /sessions/{sid}/api_tree groups[].apis[] 真值;module=端点伴随归属字段) */
export interface ApiEntryDTO {
  path: string;
  method?: string;
  cls?: string;
  evidence?: string;
  tested?: string;
  biz_cn?: string;
  rpc?: boolean;
  module?: string;
  /** R228: 域名归属(gateway 基线优先)+请求参数键+数据包探测快照 */
  domain?: string;
  params?: string[];
  probed?: boolean;
  last_probe?: { code?: string; size?: number; body_snip?: string; ctype?: string; url?: string };
  tier?: 'host' | 'rpc' | 'guess';
  /** R236: 详细功能语义(规则词典)+ 参数位置规格(query/field/part/path) */
  func?: string;
  param_spec?: Record<string, string>;
  /** R623: 真实流量接口(bridge.jsonl type=pkt 回传真包聚合;verified=traffic) */
  verified?: 'traffic' | string;
  host?: string;
  /** 包出现次数/带鉴权包次数/状态码分布(真实流量回传统计) */
  hits?: number;
  auth_hits?: number;
  codes?: Record<string, number>;
}
export interface ApiTreeGroupDTO {
  module: string;
  count?: number;
  tested?: boolean;
  /** R623: source=traffic 真实流量组(置顶)/静态推断组 static_infer=true */
  source?: 'traffic' | string;
  static_infer?: boolean;
  apis: ApiEntryDTO[];
}
/** 接口清单 DTO(api_tree 回包真值;deprecated/tree 为端点伴随字段) */
export interface ApiTreeDTO {
  status: string;
  base_url?: string;
  total?: number;
  groups: ApiTreeGroupDTO[];
  deprecated?: unknown;
  tree?: unknown;
  /** R623: 资产分档计数(traffic=真实流量接口数)+ 真实流量包次数按域名分布 */
  tiers?: Record<string, number>;
  traffic_hosts?: Record<string, number>;
}

/** autopilot 步骤/阶段/状态(GET /sessions/{sid}/autopilot/status 真值;step.state 为运行态分档) */
export interface AutopilotStepDTO {
  i: number;
  kind?: string;
  name?: string;
  phase?: string | null;
  state?: { state?: string; findings?: number; [k: string]: unknown } | null;
}
export interface AutopilotPhaseDTO {
  phase: string;
  name: string;
  done: number;
  total: number;
  steps?: AutopilotStepDTO[];
  counts?: Record<string, number>;
}
export interface AutopilotStatusDTO {
  status?: string;
  state?: string;
  interrupted?: boolean;
  current?: string | null;
  current_name?: string | null;
  last_step?: unknown;
  findings?: number;
  note?: string | null;
  steps?: unknown;
  phases?: AutopilotPhaseDTO[];
}

/** Burp 桥状态(GET /sessions/{sid}/burp/status 回包真值;代理端口真值=b_port/o_port 分档) */
export interface BurpStatusDTO {
  status?: string;
  device_online?: boolean;
  device_serial?: string;
  oracle?: boolean;
  bridge?: boolean;
  o_port?: number;
  b_port?: number;
  burp?: boolean;
  phone_proxy?: string;
}

/** 审批项(GET /sessions/{sid}/approvals approvals[] 行真值) */
export interface ApprovalDTO {
  id: string;
  tool?: string;
  name?: string;
  reason?: string;
  state?: string;
  ts?: string;
  [k: string]: unknown;
}
export interface ApprovalsDTO {
  status?: string;
  approvals: ApprovalDTO[];
  pending?: unknown;
  canvas_mode?: string;
}


/** R582(B11) 壳档案(GET /sessions/{sid}/packer): 家族识别+六向量检测面+kb 档案状态 */
export interface PackerEvidenceDTO { evidence: string; match: string; file?: string }
export interface PackerSoDTO { so: string; size: number; sigs: Array<{ family: string; sig: string }> }
export interface PackerDTO {
  status: string;
  family: string;
  family_confidence: number;
  family_evidence?: string[];
  vectors: Record<string, PackerEvidenceDTO[]>;
  libs?: PackerSoDTO[];
  archive_id?: number;
  from_store?: boolean;
  kb_status?: Record<string, number>;
}
