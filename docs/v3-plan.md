# Jingzhe 1.0 / V3 — product plan

Written before any V3 code change. Baseline: `main` at `da8907a` (Phase 18). Scope: UI, interaction and
information architecture only. API contracts, permissions, task behavior and report behavior do not change;
no backend endpoint is added.

Verification in this plan runs on fixtures (`app/scripts/fixtures/api.mjs`) against a production preview build
in the cloud container. The canary at `http://localhost:8108/v2/` and the backend on 8099 live on the host
machine and are not reachable from the container; nothing here claims a canary or production deployment.
Section 9 says how the canary gets updated and checked.

Contents: 1 audit · 2 directions · 3 navigation · 4 workbench · 5 tasks · 6 tokens · 7 phases ·
8 test plan · 9 risks · 10 merge / rename / redirect / retire.

---

## 1. Current-state audit and duplicate map

### 1.1 What V2 is

14 routes behind a hash router (`app/src/app/App.tsx`), one persistent shell (232 px rail + 52 px top bar),
a `jz` token set (`design/tokens.css`) and a primitive library (`components/ui`). Token lint is 0, build passes,
the main chunk is **873.67 kB** (277 kB gzip) because every page except the dashboard is imported eagerly.

V2 is consistent at the component level and inconsistent at the product level: the same job has more than
one home, and each page was restyled in place rather than re-owned.

### 1.2 Duplicate map

| # | Job | Where it lives today | Problem | V3 owner |
| --- | --- | --- | --- | --- |
| D1 | Project index | `/pentest` (`PentestProjectsPage`) and `/company` (`CompanyProjectsPage`) | Both read `GET /api/pentest/projects`; two lists, two card designs, two filter models, two "create" flows | `/projects` with scope all / company / single |
| D2 | Project detail | `/pentest/project/:pid` (sessions only) and `/company/projects/:pid` (reports, overview, apps, candidates, runs) | Two shells for one entity; a project opened from one index hides the other half | `/projects/:pid`, one shell, five tabs |
| D3 | Create project | "新建评估项目" wizard, "新建公司项目" dialog, JSON/CSV import | Three entry points, two data models | One "新建项目" dialog with a kind choice; import stays as a secondary action |
| D4 | Task lists | `/tasks` table; `/tasks` "正在运行" lanes; `/tasks` "关联的渗透会话" rail; dashboard "正在运行" lanes; dashboard task table; project "执行记录"; project sessions table | Seven renderings of running work, three of them on one page | `/tasks` (four sub-scopes); project **执行** tab is the same table filtered by project; dashboard shows at most five rows and links out |
| D5 | Task detail | 520 px drawer with a `<dl>` and three `<pre>` blocks; artifacts in a separate modal; report on another page | Cramped; log, artifacts and timeline are three unrelated overlays | `/tasks/:id` full-page split view |
| D6 | Report lists | `/reports` hub (task reports); project detail › 报告 history; workbench › 报告 (local projection); dashboard recent reports | Three lists, three row designs, three action sets | `/reports` with scopes all / project / session / app; the other two are scoped views built from the same components |
| D7 | Report view modes | `/reports` 预览 / 卡片 / 表格 with separate KPI strip | Already view modes; the KPI strip repeats row data | Kept as view modes; strip removed |
| D8 | Export actions | Workbench report: export + print in the chapter column **and** in the paper header; report detail: export menu + per-section buttons | Same action twice on one screen | One export group per reader |
| D9 | "发现" | Rail item 发现 (`/discovery`, hypothesis pipeline); workbench tab 发现 (risk findings); project tab 候选应用 (app candidates); knowledge 候选审核 | One word for three objects | 证据 (`/evidence`), 风险发现 (workbench), 候选应用 (project), 知识候选 (knowledge) |
| D10 | Device and queue status | Top bar device pill; rail device card; rail queue card; tasks fact row "在线设备"; dashboard header "执行节点"; dashboard queue signal; projects fact row "在线设备" | Same counts in up to four places on one screen | Rail owns the entry points and shows state, not counts; the dashboard owns the queue numbers; `/tasks` owns concurrency |
| D11 | Summary strips above tables | `/tasks` fact row + lanes, `/pentest` fact row, `/reports` KPI strip, workbench findings count bar + stream summary chips | Repeat what the rows and tabs already say | Removed; counts live on scope tabs |
| D12 | Workbench chrome | Global rail (collapsed) + workbench rail (240 px) + header + 五轮复核 bar + surface bar | Five layers of navigation before content; 308 px of width and 150 px of height spent on chrome | One header, one tab row, one secondary bar; the second rail and the rounds bar go away (rounds move to the inspector) |
| D13 | Inspector entry points | Header button "N 项待复核", rail "复核队列", rail "任务简报", header toggle, stream "进度" button | Five ways to open one panel | One toggle (and one keyboard shortcut); inspector tabs do the rest |
| D14 | Findings triage | 主发现 detail has 确认 / 排除 / 标记待复核 as three equal buttons; "批量确认（预览）" does nothing; 规则卡 has its own state control | No primary action; one fake control | One primary triage action with a menu; real batch triage or none |
| D15 | Conversation surfaces | `/agent`, `/ai-assistant` (archive), workbench composer, hidden `AiSidebar` | Four composers, three designs | One `Composer` component; `/ai-assistant` leaves navigation; `AiSidebar` is retired (already unreachable) |
| D16 | Confirmation patterns | `ConfirmDialog` in most places, `window.confirm` in Agent and the archive | Two patterns for destructive actions | `ConfirmDialog` only |
| D17 | New assessment | Rail item competing with destinations; header button on `/tasks`, `/dashboard`; empty-state links | A verb in a list of nouns | Global primary action in the rail and the command palette |
| D18 | Session context | Top bar breadcrumb `#40 com.example…`, top bar pills (platform, session, package, device), workbench header (title, package, device, status) | Package and device shown twice | Breadcrumb names the place; the workbench header owns the session facts |

### 1.3 Other findings

- Surfaces are pure white (`--jz-surface: 255 255 255`) on light and the brief asks for no pure white.
- Page titles are 30 px and cost about 120 px before content starts on every index.
- Status uses pill badges in up to four hues per row (`/tasks`: status, 慢, kind tag, packer chip).
- Chart tick text is 10 px.
- Workbench styles are a 729-line hand-written CSS file with its own button, chip and table classes parallel to
  the primitives.
- `ConversationView` scrolls with `scrollIntoView` in `jumpStage` (known to scroll clipped ancestors).

### 1.4 What is sound and stays

The data layer (`services`, `stores`, `types`), `useWorkbenchData` (single 8 s poll), `workbench/ia.ts`
(six tabs, `?view=` ids), the capability matrix, the fixtures and the audit scripts. V3 changes ownership and
presentation on top of them.

---

## 2. Three visual directions

Static study: `design/v3-directions.html` (`?d=a|b|c&t=light|dark`). Renders of the same screen (workbench ›
Runtime › Agent trace): `docs/screenshots/v3/directions/`.

### A. Instrument Panel — **chosen**

Panes divided by hairlines, not cards on a canvas. Horizontal tab row, a secondary bar that names the owner of
the surface, a trace laid out as a ruled log (mono time column, glyph column, content, mono duration column), a
status readout made of labelled cells, and a composer docked as the control strip of the pane. Density comes
from alignment and tabular numerals; depth comes from three surface steps and one overlay shadow.

### B. Editorial Operations

A reading column with a 36 px headline that states the situation, margin notes for counts, generous whitespace,
narrative paragraphs for the trace. Calm and legible.

### C. AI-Native Canvas

The composer is the centre of the screen, the trace is a conversation thread, context and "needs you" float as
cards on either side, navigation recedes into pills.

### Decision

**A.** The two primary surfaces are a live workbench and a task table. Both are comparison-and-scan work:
many rows, several numeric columns, state that changes while you look at it. A is the only direction whose
basic unit is the aligned row.

**Why B loses.** B is V2's stated direction ("editorial operations console"); choosing it would be a reskin.
More importantly a reading column is narrow by design, which the brief rules out for primary work areas, and
narrative paragraphs hide the things an operator compares (time, duration, status). B survives in exactly one
place where reading is the job: the report reader, which is a typographic surface inside A's frame.

**Why C loses.** Only two of fourteen routes are conversations. Putting the composer at the centre makes
findings, evidence, artifacts and tasks second-class, turns a 500-event trace into a wall of bubbles, and
floating cards are the "collection of floating cards" the brief excludes. C's real contribution — context
chips, a command menu, a strong composer — is a component, not a layout; it is built as the `Composer` and
docked into A's panes.

This is not a blend: layout, surfaces, density and type scale all come from A. The reader and the composer are
content types that A hosts.

Constraint kept from `CLAUDE.md`: warm neutral canvas, graphite ink, indigo primary, teal health, amber
attention, red for blocking failures; Instrument Sans / Inter / IBM Plex Mono. No new font family is added.
`CLAUDE.md`'s "visual target" line is updated in Phase 1 to name the V3 direction.

---

## 3. Final navigation and page hierarchy

### 3.1 Primary navigation

```text
[ 新建评估 ]                    global primary action (rail, command palette, mobile top bar)

概览      /dashboard
项目      /projects              scope: 全部 · 公司级 · 单应用        (?scope=all|company|single)
任务      /tasks                 scope: 运行中 · 排队 · 失败 · 已完成   (?status=running|queued|failed|done; none = 全部)
证据      /evidence
报告      /reports               scope: 全部 · 项目报告 · 会话报告 · 单应用报告 (?scope=all|project|session|app)
知识      /knowledge             知识库 · 候选审核                     (?tab=library|review)
Agent     /agent

rail footer: 设备 (state + flyout) · 队列 (state → /tasks?status=failed) · collapse
```

Not in the rail: 系统 (`/system`, from the account menu and the palette), AI 助手归档 (`/ai-assistant`, from
the Agent session list and the palette), 登录.

### 3.2 Page hierarchy

```text
/dashboard
/projects
  /projects/:pid                       tabs: 概览 · 报告 · 应用 · 候选应用 · 执行      (?tab=)
    /projects/:pid/sessions/:sid       assessment workbench
       tabs: 概览 · 运行 · 风险发现 · 证据 · 产物 · 报告                               (?view= ids unchanged)
       inspector: 复核队列 · 简报 · 进度 · 日志
/tasks
  /tasks/:id                           tabs: 输出 · 产物 · 时间线 · 报告(link)          (?tab=)
/evidence
/reports
  /reports?taskId=:id                  reader (existing deep link, unchanged)
/knowledge
/agent
/new-assessment
/system                                tabs: 模型 · 环境 · 审计日志 · 偏好 (+ 用户与权限, API Token for admins)
/ai-assistant                          archive, read path kept
```

The 14 audited routes: dashboard, projects, project detail, workbench, tasks, task detail, evidence, reports,
report reader, knowledge, agent, new assessment, system, login. The archive and every redirect are checked
separately.

### 3.3 Naming rules

| Object | Name | Scope |
| --- | --- | --- |
| Conclusion about risk | 风险发现 | session; counted on dashboard and reports |
| Supporting material | 证据 | session (workbench › 证据) and global (`/evidence`) |
| App that may belong to a project | 候选应用 | project |
| Knowledge item awaiting approval | 知识候选 | knowledge |
| Hypothesis not yet verified | 待证假设 | `/evidence` (was "候选路径") |

No screen, tab or column is titled 发现 alone. Findings, evidence and app candidates stay three data objects
with three sets of endpoints; only names and owners change.

### 3.4 Shell

```text
┌──────┬──────────────────────────────────────────────────────────────────┐
│ mark │ breadcrumb (place)            [搜索或跳转 ⌘K]   🔔  ◐  account    │ 48
│ 新建 ├──────────────────────────────────────────────────────────────────┤
│ nav  │                                                                  │
│  ×7  │  page (full width, one gutter: 24 / 16 / 12)                     │
│      │                                                                  │
│ 设备 │                                                                  │
│ 队列 │                                                                  │
│  «   │                                                                  │
└──────┴──────────────────────────────────────────────────────────────────┘
 220 / 56 (collapsed) / drawer ≤ 760
```

- Top bar: breadcrumb, command button, notifications, theme, account. No device or queue counts, no session
  pills (D10, D18). Refresh moves into the pages that have data (each already has one).
- Rail: device and queue rows show a state word and a shape-coded dot (在线 / 离线, 空闲 / 运行中 / 有失败);
  numbers are in the flyout and on the pages that own them.
- Command palette: the navigation list with the same labels, the sub-scopes, 新建评估, 系统, AI 助手归档,
  theme switch. One source: `layout/navigation.ts`.

---

## 4. Assessment workspace: wireframes and component ownership

### 4.1 Shell

```text
breadcrumb: 项目 / Example Holdings 2026 / Compass #40
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Compass                            ┌状态────┬阶段─────┬已用时────┬待处理┐ [暂停] [⋯] [▯检查器] │ 56
│   com.example.compass · v3.2.1 · dev │◐ 运行中 │P2 · 3/12│ 00:41:07 │  3   │                     │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ 概览   运行   风险发现 7   证据   产物   报告                                                 │ 40  primary tabs
├───────────────────────────────────────────────────────────────┬─┬──────────────────────────┤
│ Agent 轨迹 │ 终端 │ 接口与请求        [研判|取证|推理]   实时 · 4s │ │ 复核队列 3  简报  进度  日志 │ 36  secondary bar
├───────────────────────────────────────────────────────────────┤║├──────────────────────────┤
│                                                               │║│                          │
│  work surface (owns its scroll)                               │║│  inspector (280–480,      │
│                                                               │║│  remembered)             │
└───────────────────────────────────────────────────────────────┴─┴──────────────────────────┘
                                                                 ↑ separator: drag, ← → keys
```

| Element | Component (new unless noted) | Owns | Does not show |
| --- | --- | --- | --- |
| Session header | `workbench/shell/SessionHeader` | title, package, version, device, run status readout, the one primary run action (启动 / 暂停 / 继续), overflow (设备探索, 回放盘点, 停止), inspector toggle | findings counts by priority, stage chips |
| Primary tabs | `shell/WorkbenchTabs` (reads `ia.ts`) | six tabs; count on 风险发现; attention dot on 运行 when an approval waits | — |
| Secondary bar | `shell/SurfaceBar` | secondary tabs, segment switch, one live status slot | summary chips (D11) |
| Inspector | `shell/Inspector` + `useInspectorState` | 复核队列 (approvals + current inspection target), 简报 (brief, model route, mission status), 进度 (stages, 五轮复核 with recompute), 日志 (last events) | findings, reports, metrics |
| Degraded notice | existing | which sources failed, retry | — |

Inspector behavior:

- Docked column at ≥ 1280 px (pushes the surface, covers nothing); drawer with focus trap below 1280; full-width
  sheet at ≤ 760.
- Width 280–480 px, drag on the separator or ← / → with the separator focused (`role="separator"`,
  `aria-valuenow`). Double-click resets to 320.
- Open state, width and last tab are stored per user (`jz.inspector.<username>`).
- `Ctrl/⌘ + .` toggles it from anywhere in the workbench; Escape closes the drawer form and returns focus to the
  toggle. Tabs are a `tablist` with arrow keys.
- Closes itself on surface change only in drawer form.

Layout at widths: 1440 docked inspector optional; 1024 inspector is a drawer, tabs fit; 760 header wraps to two
lines, readout keeps status + stage; 390 primary tabs scroll horizontally inside their own row, secondary tabs
stack above the segment switch, one surface at a time.

### 4.2 概览

```text
┌──────────────────────────────────────────────────────────────┬─────────────────────────────┐
│ 动态验证进行到第 3 步，共 12 步                                 │ 现在需要处理                  │
│ ◐ 运行中 · P2 · 已用时 00:41:07 · 最后事件 4 秒前               │ ▲ 1 项动作等待审批      处理 → │
│ ▰▰▰▱▱▱▱▱▱▱▱▱  (stage rail: P0 P1 [P2] LOGIN P3 P4 P5)        │ ▲ 2 条风险发现待复核    复核 → │
├──────────────────────────────────────────────────────────────┤ ◇ 设备离线 (if real)          │
│ 风险发现 7 │ 实例 12 │ 已降噪 3 │ 步骤 3/12 │ 模型调用 23 │ Token │ (nothing to do → one line)  │
├──────────────────────────────────────────────────────────────┴─────────────────────────────┤
│ 应用                         │ 环境                        │ 最近活动 (only when events exist) │
│ 包名 · 版本 · SDK · 加固 · 授权 │ 设备 · 系统 · Root · 代理    │ 14:02:30 步骤完成 …               │
│ (definition rows, no cards)  │                             │ 14:02:15 风险发现 …               │
└──────────────────────────────┴─────────────────────────────┴──────────────────────────────────┘
```

One sentence is the protagonist; it is generated from the run state (not started / running at step n of m /
waiting for sign-in / paused / interrupted / completed with n findings / failed with the reason). The fact row
is quiet (label 12, value 20 mono). "现在需要处理" lists only real items and each has one action. Requests are
the ones `SessionOverview` makes today.

Components: `surfaces/OverviewSurface` (replaces `SessionOverview`'s three cards; its data hook is extracted
unchanged), `ui/Readout`, `ui/FactRow` (existing), `ui/AttentionList`.

### 4.3 运行

Three peer surfaces under secondary tabs: **Agent 轨迹** · **终端** · **接口与请求**.

```text
Agent 轨迹   [研判 | 取证 | 推理记录]                      实时 · 最后事件 4s 前  [跟随 ✓]
┌──────────────────────────────────────────────────────────────────────────────────┐
│ P2 动态验证   步骤 3/12   2 条风险发现 · 1 项待审批                    (sticky stage row)
│ 14:02:11  ◆  判断        登录后接口返回了未脱敏字段 …                            —
│ 14:02:13  ▸  工具 request.replay      GET /api/v1/profile → 200          1.84s  ⧉ 🔗
│              ▸ 展开输入 / 输出
│ 14:02:15  ▲  风险发现    匿名可访问个人资料接口 · 证据 2 · 待复核         P1   打开 →
│ 14:02:16  ■  审批        执行已登录状态下的请求重放           [批准] [拒绝]
│ 14:02:30  ●  步骤完成    会话存储检查完成                                 9.1s
├──────────────────────────────────────────────────────────────────────────────────┤
│ [会话 #40] [风险发现 · 匿名可访问…  ×] [+ 上下文]                                    │
│ 输入引导，或输入 / 调用命令…                                                        │
│ 路由 · model-large ▾     Enter 发送 · Shift+Enter 换行 · / 命令           [发送]    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Agent 轨迹** (`surfaces/runtime/TraceSurface`): a virtualized ruled list. Row kinds: judgement, tool call,
  finding, approval, step result, operator guidance, error. Each row: time (mono), glyph (shape-coded), body,
  duration or priority, copy and deep-link actions on hover and focus. Tool rows expand to input and output;
  reasoning is collapsed by default. Stage rows are sticky. New rows append; when the user has scrolled up the
  list stops following and shows "n 条新事件 ↓". No skeleton text pretending to type, no progress bar that is
  not backed by a step count. Stop is the composer's stop; retry appears on a failed guidance send.
- **终端** (`surfaces/runtime/TerminalSurface`, wraps the existing `VirtualTerminal`): virtualized output,
  follow with pause on scroll-up, search with match count and next / previous, copy selection or all, clear
  (view only), fullscreen, wrap toggle, command input where the session supports it; a state line says running /
  waiting / failed / not connected.
- **接口与请求** (`surfaces/runtime/RequestsSurface`): segment 接口资产 | 代理流量; a filter row (method, host,
  status, text); selecting a row opens the request in a detail drawer (not inline expansion); bridge and plugin
  health in one status line; empty and unavailable states say what is missing (no device, proxy not set, no
  traffic captured yet).

### 4.4 风险发现

```text
[主发现 | Shadow 对照 | 规则卡 | 聚类]   搜索…   优先级 ▾  状态 ▾  证据类型 ▾           已选 2  [确认 ▾]
┌──────────────────────────────────────────────────────┬─────────────────────────────────────┐
│ ☐ 优先级  标题                     状态    置信  证据  实例 │ P1 高 · 待复核 · MASVS-NETWORK-1  ‹ › ✕ │
│ ☐ ■ P1   匿名可访问个人资料接口      ○ 待复核  高   ▤▦   2 │ 匿名可访问个人资料接口                 │
│ ☐ ▲ P2   调试标志开启              ◑ 部分    中   ▤    1 │ [确认 ▾]   2 个实例 · 运行时            │
│   …                                                  │ 概览 · 证据 2 · 代码 · 轨迹 · 修复       │
│  (virtualized; ↑ ↓ move, Enter open, Esc close)      │ …                                     │
└──────────────────────────────────────────────────────┴─────────────────────────────────────┘
```

- `surfaces/findings/FindingsSurface` (table) + `FindingDetail` (pane ≥ 1280, drawer below).
- Four visually distinct encodings: **severity** = filled shape + P-label; **status** = outline glyph + word;
  **confidence** = word (高 / 中 / 低) in ink-2; **evidence** = small type icons with a text alternative.
- One primary triage action: a split button whose default is 确认 and whose menu holds 排除 and 恢复待复核.
  Batch triage applies the same menu to the selection through the existing per-instance endpoint, with a
  confirmation that lists the rows; the non-functional "批量确认（预览）" is removed.
- Keyboard: ↑ ↓ move the row focus, Enter opens the detail and moves focus into it, Escape closes it and returns
  focus to the row, Space toggles selection.
- No summary above the table; the scope line is part of the toolbar ("7 条 · 12 个实例 · 3 条已降噪").
- 规则卡, Shadow 对照 and 聚类 stay as segments (capability matrix unchanged).

### 4.5 证据

```text
证据关系 │ 凭据 │ 覆盖矩阵         [关系图 | 事实图谱 | 应用结构]     节点 42 · 边 67   [列表视图]
┌───────────────────────────────────────────────────┬────────────────────────────────┐
│ step 1  overview: node types as grouped lanes      │ selection                      │
│         with counts (接口 12 · 组件 9 · 凭据 4 …)    │ type · id · attributes         │
│ step 2  select a group or a node → neighbours      │ linked 风险发现 (links)          │
│ step 3  inspect → right pane                       │ [展开邻居] [设为检查对象]          │
│ step 4  expand → one more hop, on demand           │                                │
└───────────────────────────────────────────────────┴────────────────────────────────┘
```

- `surfaces/evidence/EvidenceSurface` hosts the three secondary tabs in one workspace with one selection model.
- The default graph is never the full hairball: above 40 nodes it opens as the grouped overview; the full
  layout is something the user asks for. A list view is always one click away and is the default at ≤ 1024.
- 覆盖矩阵 states per row what is missing and why (no dynamic run yet, device offline, not in scope).
- At 760 the graph and its side pane stack; at 390 the list view is the only view.

### 4.6 产物

```text
分析输出 │ 加固信息
┌──────────────────────────────┬─────────────────────────────────────────────────────┐
│ ▾ report/            3       │ report/security_report.md        86 kB · Markdown    │
│     security_report.md 86 kB │ 来源: 任务 #100 · 已就绪              [下载]          │
│     executive_summary.md     │ ─────────────────────────────────────────────────── │
│ ▸ unpacked/          2       │ rendered preview (text / JSON / Markdown / image)    │
│   run.log            48 kB   │ unsupported type → size, type, download              │
└──────────────────────────────┴─────────────────────────────────────────────────────┘
```

- `surfaces/artifacts/ArtifactBrowser` (shared with task detail; replaces the inline mode of `ArtifactsModal`).
- Each file shows type, size, source and state. One download control: on the selected file. "打包下载" is the
  single bulk action in the browser header.
- 加固信息 (`PackerPanel`) stays a separate secondary surface.

### 4.7 报告

```text
报告 │ 版本对比                                   状态: 草稿 · 2 条待复核        [导出 ▾]
┌───────────────────┬────────────────────────────────────────────────────────────┐
│ 1 执行结论与口径    │  Compass 评估报告                                           │
│ 2 风险发现  (7)    │  会话 #40 · com.example.compass · 2026-11-23               │
│ 3 覆盖与限制       │                                                            │
│ 4 复核状态         │  1 执行结论与口径  …                                         │
│ (sticky, scrollspy)│  2 风险发现   table: 优先级 · 标题 · 状态 · 实例             │
│                   │  …                                                         │
└───────────────────┴────────────────────────────────────────────────────────────┘
```

- `features/reports/reader/` holds `ReaderLayout`, `ChapterNav`, `ReportFindingsTable`, `ExportMenu` and the
  print stylesheet; the workbench report and `/reports?taskId=` both use them.
- Review status is one line in the bar: 草稿 while any finding is pending, 可发布 otherwise.
- Export is one menu: JSON, 打印 / PDF, and "在报告工作区打开" when the session has a task.
- Print: A4, chapter starts avoid orphaned headings, table header repeats, chrome hidden, paper tokens.

### 4.8 Composer

`features/composer/Composer.tsx`, used by workbench › Agent 轨迹 and `/agent`.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [会话 #40] [风险发现 · 匿名可访问…  ×] [文件 · run.log ×]  [+ 上下文]          │ context row
│ 输入引导，或输入 / 调用命令…                                                  │ textarea 1–8 lines
│ ┌ / menu ───────────────┐                                                  │
│ │ /暂停   暂停当前评估     │                                                  │
│ │ /引用   引用风险发现…    │                                                  │
│ └───────────────────────┘                                                  │
│ 路由 · model-large ▾   模式 · 评估 Agent        ⏎ 发送 · ⇧⏎ 换行 · / 命令  [发送] │ control row
└────────────────────────────────────────────────────────────────────────────┘
```

| Capability | Behavior | Backed by |
| --- | --- | --- |
| Multi-line input | grows 1–8 lines, then scrolls; height changes never move the list above (the list owns the flex space) | — |
| Keyboard | Enter send, Shift+Enter newline, `/` command menu, `@` context menu, ↑ on empty input recalls the last message for edit, Escape closes menus then blurs | — |
| Context chips | session (fixed), finding, evidence, task, file; picked from real lists; removable | Serialized as a reference block at the top of the message text. The composer says so ("引用会作为文本随消息发送"). No new field is sent. |
| Model / route | shows the active route; menu lists the catalog | `GET /api/models/catalog`, fallback `/providers` (unchanged); the workbench sends no model, so there it is a read-only indicator |
| Attachments | "引用产物文件" attaches an artifact path as a chip. Local file upload is shown disabled with the reason: the current endpoints accept text only | existing artifact list |
| Slash commands | workbench: 启动, 暂停, 继续, 停止 (confirmed), 设备探索, 回放盘点, 引用; agent: 新会话, 分支, 导出轨迹, 联网开关 | existing actions only |
| Send / stop | send while idle; stop replaces send while running | existing |
| Retry / edit | a failed send keeps the text and offers 重试; "编辑后重发" refills the input from the last message (a new message is sent; nothing is rewritten) | existing |
| States | idle, focused, sending, streaming (control row shows "接收中 · 00:12" with a real timer), disabled with reason, error with reason, permission denied (403 → explains and disables) | — |
| 390 px | chips scroll horizontally, control row keeps route + send; hints are hidden | — |

No typing dots, no particles, no gradient border. The composer reads as the bottom strip of the pane it
controls: same surface, one stronger top rule.

---

## 5. Tasks: list and detail wireframes

### 5.1 List

```text
任务                                                   并发 2/4   [刷新] [导出 ▾] [⋯]
全部 128 │ ◐ 运行中 2 │ ○ 排队 13 │ ✕ 失败 3 │ ✓ 已完成 110          (sticky with the toolbar)
搜索…        类型 ▾   加固 ▾   负责人 ▾   ☐ 仅部分完成   ☐ 隐藏即时失败
┌──┬───────────────────────────┬──────────────┬────────────────┬──────────┬───────────────┬────┐
│☐ │ 目标                       │ 状态          │ 项目 / 来源      │ 耗时      │ 风险发现        │    │
├──┼───────────────────────────┼──────────────┼────────────────┼──────────┼───────────────┼────┤
│☐ │ Wallet                    │ ◐ 运行中       │ Example Holdings│ 04:01:12 │ 1 · 2 · 3 · 1  │ ⋯  │
│  │ com.example.wallet #101   │ 反编译 42%     │ 评估 · 会话 #41  │ 11-16 07:52│ 严重 高 中 低   │    │
│☐ │ Launcher                  │ ✕ 失败         │ —               │ 03:30:00 │ —             │ ⋯  │
│  │ com.example.launcher #102 │ timeout while unpacking: device did not respond within 600s │
└──┴───────────────────────────┴──────────────┴────────────────┴──────────┴───────────────┴────┘
已选 3 · 跨 2 页     [重新运行] [导出 ▾] [对比报告] [删除]                  1–20 / 128   ‹ ›   20 ▾
```

- Row hierarchy: line 1 target name (label 13 / 600) and state; line 2 package + id (mono 12, muted) and the
  state detail. Failure reason spans the row's remaining columns on line 2, wraps to two lines and is never
  only a tooltip.
- Status glyphs are shape-coded and always carry a word: ◐ 运行中, ○ 排队, ✕ 失败, ✓ 已完成, ◑ 部分完成,
  ⊘ 受阻. Color: brand for running, muted for queued, red for failed, teal-ink for done, amber-ink for partial
  and blocked. No other colored badge in the row: 类型, 加固 and 慢 become plain text in line 2.
- Durations, ids, counts and timestamps are mono with tabular figures, right-aligned where they are compared.
- Risk summary is four fixed mono cells (严重 · 高 · 中 · 低); zeros are muted; no bar.
- Sticky: scope tabs + toolbar + table header stick under the top bar; bulk bar sticks to the bottom of the
  list. Selection survives pagination and filtering (as today) and says so ("跨 2 页").
- Row click opens the task detail. The row menu keeps every existing action (打开会话, 重试, 报告, 产物,
  向 Agent 提问, 重新运行, 删除) with its `data-*` hook.
- Removed: the fact row, the "正在运行" lanes and the session rail (D4, D11). 并发 stays as one mono readout in
  the header because no row carries it. 批量脱壳 summary becomes a collapsed section under the table.
- Table from 1024 px; record cards below, or by explicit choice. Page sizes of 100 and above are virtualized.

### 5.2 Detail (`/tasks/:id`)

```text
任务 / Wallet #101
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Wallet                         ◐ 运行中 · 反编译 42%            [打开会话] [重新运行] [⋯] │
│   com.example.wallet · 评估 · Example Holdings 2026 · 负责人 demo                       │
│   创建 11-16 07:52:10 · 开始 07:52:31 · 已用时 04:01:12                                  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 输出 │ 产物 4 │ 时间线 │ 报告 ↗                                                          │
├───────────────────────────────────────────────────────────┬──────────────────────────┤
│ 搜索…  2/14  ‹ ›   [换行 ✓] [跟随 ✓] [复制] [下载]           │ 时间线 (pinned ≥ 1280)    │
│ 07:52:31  Unpack: 100% · 3 dex                            │ ✓ 脱壳        00:03:12    │
│ 07:55:43  Decompile: 42% · jadx 4200/10000 classes        │ ◐ 反编译      03:58:00    │
│ ▌失败原因 (failed tasks: full text, red rule, selectable)   │ ○ 评估                    │
│                                                           │ ○ 报告                    │
└───────────────────────────────────────────────────────────┴──────────────────────────┘
```

- `features/tasks/TaskDetailPage` (route), `TaskHeader`, `TaskOutput`, `TaskTimeline`; 产物 reuses
  `ArtifactBrowser`; 报告 is a link into `/reports?taskId=`.
- Data: the task row from the existing list request, `GET /api/tasks/counts`, the artifact endpoints, and for
  tasks with a session the existing session timeline. No new endpoint. Output is the task's progress text and,
  when the artifact list contains a log file, that file through the existing artifact endpoint; when neither
  exists the surface says so.
- Output: mono 12.5 / 1.6, soft wrap by default with a toggle to horizontal scroll, search with match count,
  copy, download, follow while running with pause on scroll-up; error lines carry a red left rule and a "错误"
  label (not color alone); virtualized.
- Timeline: stages with state glyph, duration (mono) and, on failure, the reason in full.
- Keyboard: Escape returns to the list and restores focus to the row it came from (the list keeps
  `?focus=<id>`); tabs are a `tablist`; every header action is reachable in order.
- Not found, forbidden, load error and stale each have a state; a deleted task says so and links back.

### 5.3 Task typography inside the global system

| Role | Token | Use |
| --- | --- | --- |
| Row title | label 13 / 600, ink | target name |
| Row meta | mono 12 / 400, muted | package, `#id` |
| State word | label 13 / 500, state color + glyph | status |
| State detail | meta 12 / 400, ink-2 | progress, partial reason, failure reason (2 lines) |
| Data | data 13 mono tabular, ink | duration, counts |
| Timestamp | mono 12 tabular, muted | created / updated |
| Detail title | headline 22 / 600 | task detail header |
| Log | mono 12.5 / 1.6 | output |

---

## 6. Design tokens, type scale and motion

All of it lands in `design/tokens.css` (single source), mirrored by `design/tokens.json` and mapped in
`app/tailwind.config.js`. Existing token names keep working; values change, names are added.

### 6.1 Color

RGB triplets. Every text token is checked by `scripts/check-contrast.mjs` against every surface it may sit on
(≥ 4.5 : 1); the script is extended to the new surfaces and state layers.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `canvas` | 243 242 238 | 17 18 21 | page ground |
| `rail` | 235 234 229 | 13 14 17 | navigation |
| `surface` | 250 249 246 | 23 25 29 | panes |
| `raised` | 254 253 251 | 30 33 38 | menus, selected tab, sticky bars |
| `inset` | 239 238 233 | 12 13 16 | wells: code, log, table head |
| `overlay` | 254 253 251 | 34 37 43 | dialogs, drawers |
| `surface-2` | 238 237 232 | 33 36 42 | subtle fill (kept name; chips, hover on a pane) |
| `ink` | 24 25 28 | 236 237 240 | primary text |
| `ink-2` | 62 66 74 | 190 195 204 | secondary text |
| `muted` | 96 100 110 | 138 144 156 | meta text |
| `border` | 222 220 213 | 38 41 48 | hairlines |
| `border-strong` | 140 144 153 | 104 110 122 | control outlines (≥ 3 : 1) |
| `brand` | 48 76 204 | 138 158 255 | primary accent |
| `brand-soft` | 229 233 250 | 28 36 72 | selection |
| `on-brand` | 250 249 246 | 15 17 22 | text on brand |
| `teal` / `teal-ink` | 12 130 116 / 8 104 92 | 76 200 186 | health |
| `amber` / `amber-ink` | 176 104 0 / 132 78 0 | 240 180 78 | attention |
| `orange` | 180 60 12 | 250 156 108 | "high" severity only |
| `red` | 176 36 26 | 250 134 124 | blocking failure, destructive |

No pure black or white outside the print tokens. Light and dark are tuned separately (dark is not an inversion:
the rail is darker than the canvas in both). Semantic color never appears without a glyph or a word.

State tokens: `--jz-state-hover` (ink 5%), `--jz-state-pressed` (ink 9%), `--jz-state-selected` (brand-soft),
`--jz-state-selected-ink` (brand), `--jz-focus` (brand), `--jz-focus-width` 2 px, `--jz-focus-offset` 2 px,
`--jz-focus-inset` −2 px for rows and tabs that clip.

### 6.2 Typography

Display: **Instrument Sans**. UI: **Inter**. Mono: **IBM Plex Mono** (all self-hosted, as today).
Chinese: `--jz-font-cjk: "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Source Han Sans SC",
"Microsoft YaHei UI", "Microsoft YaHei"` is part of all three stacks, so Latin comes from the brand face and
Chinese from the best system face on each platform. Rules for Chinese: no letter-spacing, no synthesized bold
below 13 px, body line-height ≥ 1.55, weight 600 only from 13 px up.

| Role | Token | Size / line | Weight | Face |
| --- | --- | --- | --- | --- |
| Display (readout) | `display` | 40 / 1.05 | 600 | display, −0.02em |
| Metric | `metric` | 28 / 1.1 | 600 | display |
| Page title | `page` | 24 / 1.25 | 600 | display, −0.01em |
| Headline | `headline` | 22 / 1.25 | 600 | display |
| Title | `title` | 18 / 1.3 | 600 | display |
| Section | `section` | 15 / 1.4 | 600 | UI |
| Body | `body` | 14 / 1.55 | 400 | UI |
| Label | `label` | 13 / 1.4 | 500 | UI |
| Meta | `meta` | 12 / 1.45 | 400 | UI |
| Data | `data` (new) | 13 / 1.4 | 400 / 500 | mono, tabular |
| Mono | `mono` (new) | 12 / 1.5 | 400 | mono, tabular |
| Log | `log` (new) | 12.5 / 1.6 | 400 | mono |

Smallest text is 12 px; chart tick text goes from 10 to 11 and chart labels from 11 to 12. Hierarchy uses
weight and spacing first; color only separates ink / ink-2 / muted. Three weights: 400, 500, 600.

### 6.3 Surface, radius, elevation

Levels: canvas → rail → surface → raised → inset → overlay. Separation is a 1 px `border` and spacing.
`--jz-shadow-card` becomes none; `--jz-shadow-raised` is for menus and popovers; `--jz-shadow-dialog` for
dialogs and drawers. The header tint gradient is removed.

Radii: tag 3 · control 6 · card 8 · panel 10 · dialog 12 · pill 999.

### 6.4 Layout

8 px grid (4 px half step in dense rows only). One page gutter: 24 / 16 (≤ 1100) / 12 (≤ 760).
Top bar 48. Rail 220 / 56. Controls 32 (36 large, 44 touch at ≤ 760). Table head 32, row 36 dense / 44 regular,
two-line row 52. Working pages use the full width; prose (reader, markdown) is capped at 760 px inside a
full-width frame.

### 6.5 Motion

| Token | Value | Use |
| --- | --- | --- |
| `--jz-motion-instant` | 80 ms | pressed |
| `--jz-motion-fast` (`hover`) | 120 ms | hover, focus ring, selection fill |
| `--jz-motion-base` (`expand`) | 180 ms | disclosure, tab indicator, inspector open/close, status change |
| `--jz-motion-slow` (`page`) | 240 ms | drawer, dialog, route content |
| `--jz-ease` | cubic-bezier(.2, 0, 0, 1) | default |
| `--jz-ease-exit` | cubic-bezier(.4, 0, 1, 1) | leaving |

| Event | Motion |
| --- | --- |
| Streaming | rows append with a 120 ms opacity fade; no transform, no caret, no reflow above the fold (the list is bottom-anchored and the composer height is outside it) |
| Selection | background fill 120 ms |
| Drawer / dialog | translate 16 px + fade, 240 ms in, 180 ms out |
| Inspector | width 180 ms on toggle; none while dragging |
| Task status | glyph and word cross-fade 180 ms; the row does not move |
| Route | content opacity 120 ms; no slide |
| Reduced motion | all durations 0; follow-scroll jumps instead of smooth-scrolling |

No looping animation anywhere except the skeleton shimmer while a request is pending.

### 6.6 Iconography

Lucide only. 16 px in controls, 14 px in dense rows, 18 px in the rail; stroke 1.5 at every size
(`--jz-icon-stroke`). Icons accompany labels; an icon-only control has an `aria-label` and a tooltip, and
destructive or primary actions always have text. Status glyphs are a fixed set in `ui/StatusGlyph`.

---

## 7. Implementation phases and file map

Each phase ends with: `tsc --noEmit` + production build, token lint 0, capture at 1440 / 1024 / 760 / 390 in
light and dark, the five data states, overflow and focus checks, screenshots in `docs/screenshots/v3/phase-N/`
(copied to the project folder), a `CHANGELOG.md` entry with the main chunk size, one commit. The app stays
runnable after every phase.

| Phase | Deliverable | New files | Changed | Retired at end of phase |
| --- | --- | --- | --- | --- |
| 1 Tokens, type, shell | V3 tokens; `Readout`, `StatusGlyph`, `ScopeTabs`, `SplitPane`; new rail, top bar, palette; canonical routes + redirects; lazy routes | `design/tokens.css` (values), `ui/StatusGlyph.tsx`, `ui/Readout.tsx`, `ui/SplitPane.tsx`, `layout/redirects.tsx`, `layout/QueueDeviceEntry.tsx` | `tailwind.config.js`, `styles/index.css`, `layout/{navigation,Sidebar,TopBar,routeChrome}.ts(x)`, `components/CmdPalette.tsx`, `app/App.tsx`, `ui/{Button,Field,Tabs,DataTable,Page,Panel,StatusBadge}.tsx`, `scripts/{capture,check-contrast}.mjs`, `CLAUDE.md` (visual target) | `layout/AiSidebar.tsx` (unreachable since Phase 15) |
| 2 Project domain | `/projects` index with scopes; `/projects/:pid` shell with five tabs; one create dialog | `features/projects/{ProjectsPage,ProjectDetailPage,ProjectCreateDialog,projectModel}.tsx`, `features/projects/tabs/{Overview,Reports,Apps,Candidates,Runs}.tsx` | `pentest/NewProjectWizard.tsx` (session creation only), fixtures | `pentest/PentestProjectsPage.tsx`, `pentest/PentestPages.tsx`, `pentest/ProjectCard.tsx`, `company/*` |
| 3 Assessment shell, inspector | header, primary tabs, surface bar, resizable remembered inspector, rounds moved in | `workbench/shell/{SessionHeader,WorkbenchTabs,SurfaceBar,Inspector,useInspectorState}.tsx` | `workbench/{WorkbenchPage,ia,workbench.css,ContextPanel}`, `pentest/v3/SessionShell.tsx` | `workbench/ReviewRoundsBar.tsx` (content moves), workbench rail CSS |
| 4 Overview, runtime, composer | overview surface; trace, terminal, requests; `Composer` | `workbench/surfaces/OverviewSurface.tsx`, `surfaces/runtime/{TraceSurface,TraceRow,TerminalSurface,RequestsSurface}.tsx`, `features/composer/{Composer,CommandMenu,ContextChips,useComposer}.tsx` | `pentest/{VirtualTerminal,ApiTreePanel,BurpBridgePanel,AiThinkPanel}.tsx`, `workbench/{ConversationView,TrajectoryView,CaseEntry}` | `pentest/SessionOverview.tsx`, `workbench/ConversationView.tsx` |
| 5 Findings, evidence | table + detail + triage; evidence workspace with progressive graph | `surfaces/findings/{FindingsSurface,FindingDetail,TriageButton}.tsx`, `surfaces/evidence/{EvidenceSurface,GraphOverview,EvidenceList}.tsx` | `workbench/{GraphView,FactGraphView,CredentialsView,EvidenceMatrix,ClustersView}`, `pentest/VulnsPanel.tsx`, `attack-canvas/AttackCanvas.tsx` | `workbench/FindingsView.tsx` |
| 6 Artifacts, report | artifact browser; shared reader; print | `features/artifacts/{ArtifactBrowser,ArtifactPreview}.tsx`, `features/reports/reader/{ReaderLayout,ChapterNav,ReportFindingsTable,ExportMenu}.tsx`, `styles/print.css` | `pentest/{PackerPanel,ReportDiffPanel}.tsx`, `tasks/ArtifactsModal.tsx` | inline mode of `ArtifactsModal`, `ReportView` in `WorkbenchPage` |
| 7 Tasks | list; `/tasks/:id` | `features/tasks/{TaskListPage,TaskTable,TaskRow,TaskDetailPage,TaskHeader,TaskOutput,TaskTimeline,taskModel}.tsx` | `tasks/{taskParts,RerunTaskModal}.tsx`, `projects/tabs/Runs.tsx` (uses `TaskTable`) | `tasks/TaskCenterPage.tsx` |
| 8 Dashboard, reports | dashboard signal; report workspace with scopes | `features/dashboard/{DashboardPage,GlobalSignal,RecentWork}.tsx` (rewritten), `features/reports/{ReportsPage,ReportTable,reportScopes}.tsx` | `reports/{HubView,DetailView,ReportCenterPage}`, `projects/tabs/Reports.tsx` | KPI strips, duplicate device / queue blocks |
| 9 Knowledge, Agent, evidence, system | knowledge library + review with reasons; Agent three panes on `Composer`; `/evidence`; system tabs | `features/evidence/EvidencePage.tsx`, `features/knowledge/*` (moved from `skills`) | `agent/*`, `system/*`, `ai-assistant/*` (confirm dialogs, archive banner) | `discovery/DiscoveryPage.tsx`, `agent/components_agent/AgentComposer.tsx`, `window.confirm` calls |
| 10 Responsive, a11y, performance | full matrix, focus and contrast audit, reduced motion, virtualization check, chunk budget, docs | `scripts/check-v3.mjs` (routes × widths × themes × states + focus), `docs/v3-acceptance.md` | `docs/{architecture,page-matrix,design-system,page-specs,capability-matrix}.md`, `README.md` | dead CSS and exports found by the audit |

Rules for every phase: a file is retired only in the phase where its last capability has a new owner and the
capability matrix row has been updated; `data-*` hooks used by the audit scripts move with their controls;
`services`, `stores` and `types` are not edited except to add a type.

Performance budget: main chunk ≤ 350 kB (from 873.67 kB) through route-level lazy loading in Phase 1; ECharts
and React Flow stay in their own chunks and load only on the routes that draw them; the size is reported in
each changelog entry.

---

## 8. Screenshot, state and accessibility test plan

| Check | Tool | Scope | Pass |
| --- | --- | --- | --- |
| Typecheck, build | `npm run build` | every phase | passes |
| Token lint | `npm run lint:tokens` | every phase | 0 |
| Contrast | `scripts/check-contrast.mjs` (extended to all V3 surfaces and state layers) | tokens | 0 failing text pairs, controls ≥ 3 : 1 |
| Route capture | `scripts/capture.mjs` (V3 route list, widths 1440 / 1024 / 760 / 390) | 14 routes × 4 widths × 2 themes | 0 overflow, 0 page errors |
| Data states | same script, `--variant empty|error|forbidden|slow|stale` | 14 routes at 1440 and 390 | no error boundary; each state has its message and a next step |
| Workbench | `scripts/check-workbench.mjs` (updated selectors) | 20 surfaces + inspector × 4 widths × 2 themes × states | 0 overflow, every `?view=` resolves, every surface reachable by click |
| Focus | workbench script + new `check-v3.mjs` | every tab stop on every route | visible indicator, not covered by a sticky bar, logical order |
| Keyboard paths | `check-v3.mjs` scripted: tabs (arrows), tables (↑ ↓ Enter Esc), menus, dialogs, drawers, inspector separator, composer menus | listed controls | Escape returns focus to the opener |
| Redirects | `scripts/check-redirects.mjs` (new) | every old path in §10 with its query string | lands on the canonical route with parameters intact |
| Requests | `scripts/check-requests.mjs` against a new V3 baseline | 14 routes | no request outside the documented set; differences from the V2 baseline are listed and explained in the changelog |
| Reduced motion | capture with `reducedMotion: 'reduce'` | workbench, tasks | no transition longer than 0.01 ms; follow still works |
| Screen reader labels | DOM assertions in `check-v3.mjs` | status glyphs, counts on tabs, icon buttons | every glyph has a text alternative; counts are part of the accessible name |
| Streaming stability | scripted: append 200 events while scrolled up | trace, terminal, task output | scroll offset unchanged; layout shift 0 |
| Print | `page.pdf()` of the reader | report | chrome absent, table header repeats |
| Chunk size | build output | every phase | main chunk within budget, reported |

Screenshots: `docs/screenshots/v3/phase-N/` in the repo and
`/mnt/project-files/jingzhe-migration/v3/phase-N/` for review. Every changed page at 1440 and 1024 minimum,
plus 760 and 390 where layout changes; light and dark.

Real backend: the read and write audits from Phases 16–17 (`real-read-audit.mjs`, `real-write-audit.mjs`) are
rerun on the host machine before the canary is called reviewable. That step needs a session on that machine
and is reported separately; until then every result is labelled "fixtures".

---

## 9. Risks and rollback

| Risk | Likelihood | Effect | Mitigation |
| --- | --- | --- | --- |
| A redirect drops a query parameter that a deep link depends on (`?view=`, `?tab=`, `?finding=`, `?masvs=`, `?taskId=`, `?sid=&cmp=`, `?focus=`, `?status=`, `?task=`) | medium | broken bookmarks and notification links | one redirect component that forwards `location.search`; `check-redirects.mjs` covers each one; links written by the backend (notifications) keep working because old paths stay as redirects permanently |
| Unified project detail calls company endpoints for single-app projects | low | error state on a tab | V2 already opens any project id on `/company/projects/:pid`; each tab loads and fails independently instead of one `Promise.all` |
| Project 执行 tab needs tasks per project and there is no such filter | medium | incomplete list | join the existing task list with sessions (`task_id` → `project_id`), as `/tasks` does today; say "按会话关联" in the tab; no endpoint added |
| Report workspace needs project reports for every project | medium | N requests | reuse the existing queue (4 concurrent); fetch only when the scope needs them; documented in the request map |
| Task output has no log endpoint on the real backend | medium | 输出 shows only progress text | the surface states its source and falls back honestly; nothing is fabricated |
| Composer context chips imply structured context the backend does not parse | medium | false expectation | chips serialize to visible text and the composer says so |
| Token value changes shift every page before it is redesigned | certain | intermediate phases look half-V3 | Phase 1 retunes the primitives so untouched pages stay coherent; each phase's screenshots include the untouched routes |
| Lazy routes flash a fallback | low | perceived slowness | skeleton sized to the page frame; prefetch on rail hover |
| Fixture shapes differ from the real backend | medium | regressions visible only on the host | rerun the real read / write audits before canary review |
| Workbench audit selectors (`data-wb-*`) move | certain | audit script breaks | hooks are preserved on the new elements; the script changes in the same commit as the markup |
| Scope: ten phases in one branch | — | large review | one commit per phase, each runnable and revertible on its own |

Rollback:

- **Per phase:** `git revert` of that phase's commit; phases depend on Phase 1 and otherwise only on their own
  files (Phase 7's `TaskTable` is used by Phase 2's 执行 tab through a thin adapter that falls back to a plain
  table).
- **Canary:** the canary serves a build directory; keeping the previous `dist` beside the new one makes rollback
  a directory swap. `BuildVersionGuard` already tells open tabs to reload.
- **Production:** untouched. Port 8099 keeps serving the old frontend until the canary passes the acceptance
  list and cz says to replace it.
- **Routes:** old paths remain as redirects, so rolling the frontend back never strands a link created under
  V3 except the three new paths (`/projects/…`, `/tasks/:id`, `/evidence`), which a rolled-back build sends to
  the dashboard through the existing catch-all.

---

## 10. Merged, renamed, redirected, retired

### Merged

| From | Into |
| --- | --- |
| 评估项目 index + 公司项目 index | 项目 (`/projects`), scopes 全部 / 公司级 / 单应用 |
| Project sessions page + company project detail | `/projects/:pid` (sessions live in the 执行 tab) |
| 新建评估项目 wizard (create mode) + 新建公司项目 dialog | 新建项目 dialog |
| `/tasks` lanes, session rail, fact row | task table and its scope tabs |
| Task detail drawer + artifacts modal | `/tasks/:id` |
| Report hub + project report history + workbench report list | 报告 workspace (shared table, reader, export menu) |
| Workbench rail + 五轮复核 bar + five inspector entry points | tab row + inspector |
| `AgentComposer` (agent) + workbench composer | `Composer` |
| Top bar device pill + rail device card + rail queue card | rail entries (设备, 队列) |

### Renamed

| Was | Is |
| --- | --- |
| 公司项目, 评估项目 | 项目 › 公司级, 项目 › 单应用 |
| 发现 (rail, `/discovery`) | 证据 |
| 发现 (workbench tab) | 风险发现 |
| 候选路径 (discovery) | 待证假设 |
| 候选审核 items (knowledge) | 知识候选 |
| 执行记录 (project) | 执行 |
| 应用清单 (project) | 应用 |
| AI 助手（归档） | AI 助手归档 (out of navigation) |

### Redirected (permanent, query string forwarded)

| Old | New |
| --- | --- |
| `/pentest` | `/projects` |
| `/company` | `/projects?scope=company` |
| `/pentest/project/:pid` | `/projects/:pid?tab=runs` |
| `/company/projects/:pid` | `/projects/:pid` |
| `/pentest/project/:pid/session/:sid` | `/projects/:pid/sessions/:sid` |
| `/new-audit` | `/new-assessment` |
| `/skills` | `/knowledge` |
| `/discovery` | `/evidence` |
| `/tasks?status=degraded` | `/tasks?status=done&partial=1` |
| `?ui=v2|v3|v4` on a session | dropped (as in Phase 17) |

Unchanged paths: `/dashboard`, `/tasks`, `/reports` (and `?taskId=`, `?sid=&cmp=`), `/agent` (and `?task=`),
`/system`, `/ai-assistant`.

### Retired (each only after its capability has an owner)

| Item | Capability goes to |
| --- | --- |
| `PentestProjectsPage`, `ProjectCard`, `CompanyProjectsPage`, `CompanyProjectDetailPage`, `ProjectSessionsPage` | `features/projects/*` |
| `TaskCenterPage` detail drawer, running lanes, session rail | `TaskListPage`, `TaskDetailPage`, project 执行 tab |
| `SessionOverview` three-card layout | `OverviewSurface` |
| `ReviewRoundsBar` as a bar | Inspector › 进度 |
| Workbench left rail | `WorkbenchTabs` |
| "批量确认（预览）" | real batch triage |
| Duplicate export buttons in the workbench report | reader `ExportMenu` |
| `DiscoveryPage` | `EvidencePage` (same endpoint) |
| `AgentComposer` | `Composer` |
| `AiSidebar` | nothing: unreachable since Phase 15, its feedback call already has another owner |
| `window.confirm` (Agent, archive) | `ConfirmDialog` |
| KPI / fact strips above tables | scope tabs |
| Header tint gradient, card shadows, 30 px page titles | V3 tokens |

Nothing in the capability matrix loses its owner. `docs/capability-matrix.md` is updated in the phase that
moves each row.

---

## Open decisions taken on defaults

cz can overturn any of these; none blocks implementation.

1. Direction A, with the fonts already approved in `CLAUDE.md`.
2. Canonical routes change (`/projects`, `/knowledge`, `/evidence`, `/new-assessment`); the earlier default
   "paths stay as in code" is replaced by permanent redirects because the brief asks for one project domain.
3. Noto Sans SC stays unbundled; Chinese uses the system face through `--jz-font-cjk`.
4. The inspector docks from 1280 px (was 1400).
5. `/reports` keeps 预览 as its default view mode.
