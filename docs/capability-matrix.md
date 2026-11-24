# Capability matrix

Phase 15 audit of every capability that existed in the legacy session surfaces (V3 `?ui=v3`, V2 `?ui=v2`)
against the six-tab workbench. Source of truth for the workbench structure is
`app/src/features/pentest/workbench/ia.ts`; every row below was checked against the component that renders it.

Status values:

- **Owned** – reachable in the workbench before Phase 15.
- **Moved in Phase 15** – was legacy-only; now has a workbench owner.
- **Shared owner** – two renderings of the same job exist on purpose; the reason is listed.

No capability is missing an owner. Legacy `?ui=v3` and `?ui=v2` were retired in Phase 17 after every gate item at
the end of this file passed on the real backend; old links open the workbench.

## Panels named in the Phase 15 brief

| Old panel | Capability | Current owner (tab › subtab › segment) | `?view=` | Status |
| --- | --- | --- | --- | --- |
| PackerPanel | Packer detection, unpack state, DEX list, unpack retry | Artifacts › Packaging information | `packer` | Owned |
| VulnsPanel | Rule-card list with severity / credential / MASVS (`?masvs=`) filters | Findings › 规则卡 | `rulecards` | Rebuilt as `RuleCardsSurface` (V3 Phase 5 follow-up) |
| VulnsPanel | Manual add (local), import / export, local notes, copy | Findings › 规则卡 | `rulecards` | Rebuilt as `RuleCardsSurface` (V3 Phase 5 follow-up) |
| VulnsPanel | Code board, hook stack, agent verdict, chain per card | Findings › 规则卡 | `rulecards` | Rebuilt as `RuleCardsSurface` (V3 Phase 5 follow-up) |
| VulnsPanel | State change (`POST /vulns/state`) | Findings › 规则卡 | `rulecards` | Rebuilt: the shared triage button (V3 Phase 5 follow-up) |
| AttackCanvas | Application structure canvas (React Flow), minimap, chain walk | Evidence › Relation graph › 应用结构 | `structure` | Presentation rebuilt (V3 Phase 5 follow-up) |
| AttackCanvas | Source slice on double click (`/api/chat/source`) | Evidence › Relation graph › 应用结构 | `structure` | Presentation rebuilt; also on a toolbar button (V3 Phase 5 follow-up) |
| AttackCanvas | Select a node as inspection target | Inspector › 复核队列 › 当前检查对象 | any | Moved in Phase 15 |
| AiInspectorDrawer | Model routing chip | Inspector › 简报 | any | Moved in Phase 15 |
| AiInspectorDrawer | Approve / reject pending actions | Runtime › Agent trace (inline approval cards); Inspector › 复核队列 links to them | `stream` | Owned |
| AiInspectorDrawer | Object inspector (selected node / finding) | Inspector › 复核队列 › 当前检查对象 | any | Moved in Phase 15 |
| AiInspectorDrawer | Decision stream | Runtime › Agent trace | `stream` | Owned |
| Raw terminal | Terminal output, command input | Runtime › Terminal | `raw` | Owned |
| Execution monitor | Step timeline, running command, exit state | Runtime › Terminal (same surface as the raw terminal) | `raw` | Owned |
| Proxy traffic | Captured requests, bridge status, plugin health | Runtime › API / Requests › 代理流量 | `burp` | Owned |
| API inventory | Endpoint tree, per-endpoint detail | Runtime › API / Requests › 接口资产 | `apitree` | Owned |
| Version compare | Report diff between two versions | Report › Version compare | `diff` | Owned |

## Other legacy capabilities found during the audit

| Legacy surface | Capability | Current owner | Status |
| --- | --- | --- | --- |
| V3 header | Mission start (device exploration / replay inventory), `POST /mission/start` with the same body | Header › 更多操作 | Moved in Phase 15 |
| V3 header | Mission status (`GET /mission/status`) | Inspector › 简报 | Moved in Phase 15 |
| V3 findings | Finding clusters (`GET /vulns/clusters?limit=50`) | Findings › 聚类 (`clusters`) | Moved in Phase 15 |
| V3 header | Session switcher | Project › 执行 (`/projects/:pid?tab=runs`) | Owned (moved in V3 Phase 2) |
| V3 / V2 | Operator clue (`POST /clue`) | Runtime › Agent trace composer; consumed clues appear in the trace | Owned |
| AutopilotLaunchBar | Start / pause / resume | Header primary action | Owned |
| AutopilotLaunchBar | Stop | Header › 更多操作 › 停止任务 (asks for confirmation since V3 Phase 3) | Owned |
| SessionOverview | Session summary, usage, coverage summary | Overview (`OverviewSurface` since V3 Phase 4, see below) | Owned |
| AiThinkPanel | Reasoning trace | Runtime › Agent trace › 推理记录 (`ai`) | Owned |
| V3 / V2 | Fact graph, credentials, coverage | Evidence | Owned |
| V3 / V2 | Analysis output (task artifacts) | Artifacts › Analysis output | Owned |
| V3 / V2 | Report view and export | Report › Report | Owned |

## Project domain (V3 Phase 2)

One project domain replaced four pages: the assessment project index (`/pentest`, `PentestProjectsPage` +
`ProjectCard`), the project sessions page (`/pentest/project/:pid`, `ProjectSessionsPage`), the company project index
(`/company`, `CompanyProjectsPage`) and the company project detail (`/company/projects/:pid`,
`CompanyProjectDetailPage`). Owners live in `app/src/features/projects/`. The old paths are permanent redirects that
forward the query string. Checked by `app/scripts/check-projects.mjs` (fixtures).

| Old page | Capability (request) | Current owner | `data-*` hooks kept |
| --- | --- | --- | --- |
| Both indexes | Project list (`GET /api/pentest/projects`) | `/projects` (`ProjectsPage` + the one `ProjectTable`) | `data-company-projects`, `data-pentest-projects`, `data-company-project`, `proj-row-*`, `proj-card-*` |
| Company index | Type filter all / company / single | Scope tabs, `?scope=all|company|single` | `data-project-scope-tab` (new) |
| Company index | Lead project band (most recent company project) | Same row model; the lead row carries the hooks | `data-company-primary`, `data-company-primary-open` |
| Company index | Portfolio facts (projects, apps, with inventory) | Readout above the scope tabs | `data-company-portfolio` |
| Assessment index | Facts: projects, covered apps, sessions, devices online, high findings | Same readout | `data-overview-bar`, `stat-projects-total`, `stat-running-projects`, `stat-covered-apps`, `stat-sessions-total`, `stat-devices`, `stat-high-sev` |
| Assessment index | Sessions (`GET /api/pentest/sessions?limit=500`), open findings (`GET /api/pentest/vulns/severity-summary`), step progress per project (`GET /api/pentest/projects/:pid/sessions`) | Row columns 最近会话 / 进度 / 风险发现 | `prog-text-*`, `prog-bar-*`, `stage-*-*`, `sev-row-*`, `device-dot-*`, `pkg-copy-*`, `pkg-mix-*` |
| Assessment index | Sessions under way, open workbench | Strip at the top of the list pane | `data-active-sessions`, `data-active-session` |
| Both indexes | Search, sort, card / table view | Toolbar of the list pane; sort options merged (activity, created, sessions, progress, apps, name) | `data-toolbar="projects"`, `data-company-toolbar`, `data-toolbar-main`, `proj-search`, `data-toolbar-search`, `data-toolbar-sort`, `data-view-toggle`, `data-view-btn`, `data-card-grid`, `data-view` |
| Assessment index | Filters: findings, packer, status (packer and status persisted) | Filter chips; counts follow the scope on screen | `data-filter-bar`, `data-toolbar-filters`, `data-toolbar-filter`, `packer-chip-*`, `status-chip-*`, `data-empty-filtered`, `data-reset-filters` |
| Assessment index | Pagination 12 / 24 / 50 / 100 | Pager under the list | `data-toolbar="projects-pager"` |
| Assessment index | Export filtered rows as CSV / JSON / Markdown | Header › 导出 (three columns added: type, company, inventory apps) | `data-toolbar-export`, `data-toolbar-export-toggle`, `data-toolbar-export-panel`, `data-toolbar-export-item` |
| Assessment index | Import projects from JSON / CSV (`POST /api/pentest/projects` `{name, note}` per new row) | Header › 导入项目 | `data-toolbar-import`, `data-toolbar-actions` |
| Assessment index | Row actions: open workbench, report, new session, copy config, export sessions JSON | Row › 工作台 and the row menu; 报告 opens the project's 报告 tab | `enter-workbench-*`, `report-entry-*`, `proj-menu-*`, `proj-menu-btn-*`, `proj-menu-panel-*`, `proj-menu-newsession-*`, `proj-menu-copy-*`, `proj-menu-export-*` |
| Company index | Create company project (`POST /api/pentest/projects`, body unchanged) | 新建项目 dialog › 公司级 | `data-company-create`, `data-company-start-create` |
| Assessment index | Create project while creating a session (wizard create mode) | 新建项目 dialog › 单应用 (`POST /api/pentest/projects` `{name, note}`), then the session wizard opens on the new project | `data-newproject-btn`, `data-toolbar-create`, `data-wizard-project-name` (on the dialog's name field) |
| Both indexes | Empty index, next steps, single-project guidance | Empty state of the list pane; "接下来" pane when there is one project | `data-empty-projects`, `data-company-start`, `data-company-start-next`, `data-goto-new-audit`, `data-company-discovery`, `data-company-next`, `data-company-next-project` |
| Company detail | Identity (`GET …/overview`), header facts | `/projects/:pid` shell; identity falls back to the project list when the overview endpoint fails | `data-company-project-detail`, `data-company-context`, `data-company-sticky`, `data-company-sticky-title`, `data-company-sticky-run`, `data-company-tab` |
| Company detail | Import APK (`POST /api/upload`, `POST …/apps`) | Shell header › 导入 APK | `data-company-upload` |
| Company detail | Batch run with confirmation (`POST …/run` `{concurrency: 2, template}`) | Shell header › 批量执行 | `data-company-run`, `data-company-msg` |
| Company detail | Overview: progress, next steps, recent reports, recent runs | 概览 tab (adds the most recent sessions) | `data-company-next` |
| Company detail | Reports: generate project report (`POST …/reports`), history, search, download PDF / DOCX | 报告 tab | `data-report-workflow`, `data-report-step`, `data-report-row`, `data-report-latest`, `data-report-download` |
| Company detail | App inventory: search, status / ownership filters, single-app report | 应用 tab | — |
| Company detail | Candidates: discover (`POST …/discover`), verify / download / import (`POST …/candidates/*`), selection | 候选应用 tab | — |
| Company detail | Batch run records (`GET …/runs`) | 执行 tab › 批量执行批次 | — |
| Sessions page | Session list (`GET …/sessions`), open workbench | 执行 tab › 任务与会话 | `data-project-sessions` |
| Sessions page | Continue the session under way / the most recent one | 执行 tab header; also 概览 › 接下来 | `data-continue-session` |
| Sessions page | New session (wizard) | Shell header › 新建会话 | `data-new-session` |
| Sessions page | Close an idle session with confirmation (`DELETE /api/pentest/sessions/:sid`) | 执行 tab row action | `data-sess-idle`, `data-sess-close` |

The 执行 tab is the task model filtered to the project, not a list of its own: a task belongs to a project through
its session (`session.task_id`), the same join `/tasks` uses, so the tab reads `GET /api/tasks?limit=2000` and
`GET /api/pentest/sessions` while it is open and offers the task page's four scopes.

Each endpoint of the detail page is a separate resource (`useResource`): a failing endpoint shows its error in its
tab and leaves the shell and the other tabs on screen.

Changes of behaviour, all deliberate:

- The default tab of a project is 概览 (the company detail opened on 报告). `/company/projects/:pid` links land on 概览;
  `/pentest/project/:pid` links land on 执行.
- The device count on the index is read from the shell's device poll instead of a second request by the page.
- The company form no longer pre-fills the brand field with sample brand names.
- The lead project is a row of the list (with its hooks), not a separate band, so every project appears once.
- A single-app project is created with a name first; the session wizard no longer creates projects.

## Workbench shell (V3 Phase 3)

The workbench has one navigation layer: the global rail. Below the top bar the page is the session header, one row
of six primary tabs, one surface bar, then the work surface with the inspector beside it
(`app/src/features/pentest/workbench/shell/`). The 240 px workbench rail, the review-rounds strip and the stage
rail in the header are gone; this table gives every capability they carried an owner. Work surfaces are mounted
unchanged; the trace is the one adapter (its follow switch renders into the surface bar; `ConversationView` in
Phase 3, `TraceSurface` since Phase 4).

| Old element | Capability | Owner now | Hooks |
| --- | --- | --- | --- |
| Workbench rail | Six primary tabs, findings count | `WorkbenchTabs`, one row, read from `ia.ts` | `data-wb-tab`, `data-wb-tabs` |
| Workbench rail | Number of approvals waiting on 运行 | Marker on the 运行 tab; the number is the header readout 待处理 | `data-wb-readout="pending"` |
| Workbench rail | 检查器 shortcuts (复核队列, 任务简报) | Inspector tabs behind the one toggle and Ctrl/⌘ + . | `data-wb-inspector-toggle`, `data-wb-inspector-tab` |
| Workbench rail | 刷新数据 | Surface bar, live-status position | `aria-label="刷新数据"`, `data-wb-live` |
| Workbench rail | 收起导航 | Removed with the rail; the global rail collapses as before | — |
| Header | Back to the project | Session header; goes to `/projects/:pid?tab=runs` directly | — |
| Header | Title, package, version, device | Session header | `data-wb-title`, `data-wb-identity` |
| Header | Status pill | Header readout 状态 (glyph and word) | `data-wb-readout="status"` |
| Header | Stage rail: seven numbered stages, popover with progress, duration, produced findings, state and steps | Header readout 阶段 (current stage, steps done / total); every stage with its steps in Inspector › 进度 | `data-wb-readout="stage"`, `data-wb-stage` |
| Header | “N 项待复核” button | Header readout 待处理; the list is Inspector › 复核队列 | `data-wb-readout="pending"`, `data-wb-queue-item` |
| Header | Start / pause / resume / run again | Session header, the one primary action | `data-wb-primary` |
| Header | 更多操作: device exploration, replay inventory, stop | Same menu; stop asks for confirmation | `data-wb-more`, `data-v3-mission-start`, `data-wb-stop` |
| Header | Inspector toggle | Session header | `data-wb-inspector-toggle` |
| (new) | Elapsed time of the latest run | Header readout 已用时, read from the event stream; “—” when the stream has no start event and no step durations | `data-wb-readout="elapsed"` |
| ReviewRoundsBar | State of the five rounds; recompute | Inspector › 进度 › 五轮复核 (same endpoint, same read when the workbench opens, same poll) | `data-security-rounds`, `data-round`, `data-round-status`, `data-round-recompute` |
| Surface bar | Secondary tabs, segment switch | `SurfaceBar` | `data-wb-surfacebar`, `data-wb-sub`, `data-wb-seg` |
| Surface bar | Summary chips (P0–P3 counts, findings · instances, 待审批, 待复核, steps) | Removed: the findings tab count, the findings surface, and the header readouts 待处理 and 阶段 state each of them once | — |
| Trace live bar | Follow switch, “N 条新进展” jump | Follow switch: surface bar live-status position. Jump: a pill over the trace list since Phase 4 (in the bar it moved the live status when it appeared) | `data-wb-follow`, `data-wb-new-entries` |
| Trace live bar | Status chip, 最后更新 | Header readout 状态; surface bar “实时 / 已同步 / 部分未更新” with the time data last arrived | `data-wb-live` |
| Trace live bar | 进度 button, 发现 N button | Inspector › 进度; the 风险发现 tab | — |
| ContextPanel | 复核队列: approvals waiting, current inspection target | Inspector › 复核队列 | `data-wb-inspector-target`, `data-wb-queue` |
| ContextPanel | 简报: 授权, model routing, exploration run | Inspector › 简报, with the session and task numbers | `data-wb-mission`, `data-v3-mission-state` |
| ContextPanel | 简报: application, package, device, current stage, steps | Session header only (not repeated in the inspector) | — |
| ContextPanel | 进度: stage list, jump to the stage in the trace, steps of the current stage | Inspector › 进度 › 阶段 (steps of every stage) | `data-wb-stage`, `data-wb-stage-jump` |
| ContextPanel | 日志: last 20 events | Inspector › 日志 | `data-wb-log` |
| ContextPanel | Layout: side column from 1400 px, overlay below | Docked column from 1280 px (280–480 px, resizable, remembered per user in `jz.inspector.<username>`), drawer below 1280, bottom sheet at 760 and below | `data-wb-inspector`, `data-wb-inspector-mode` |
| ContextPanel | Escape closes the inspector | Drawer and sheet: Escape closes and returns focus to the control that opened them. Docked: Escape returns focus to the toggle and the column stays | — |

Labels in `ia.ts`: the findings tab is 风险发现 (the V3 name of a session finding); the first secondary tab of 报告 is
报告草稿, so no tab label appears twice in the workbench. `?view=` identifiers are unchanged.

## Overview, runtime and composer (V3 Phase 4)

`SessionOverview`, `ConversationView` (with `CaseEntry` and `agentAdapter`), `v3/RawView` (with `VirtualTerminal`
and `TimelinePanel`), `ApiTreePanel` and `BurpBridgePanel` are replaced by `workbench/surfaces/overview/`,
`workbench/surfaces/runtime/` and `features/composer/`. Every capability they carried has an owner below. The
endpoints are the ones those components read; nothing was added. Checked by `app/scripts/check-trace.mjs` (fixtures).

| Old component | Capability (request) | Owner now | Hooks |
| --- | --- | --- | --- |
| SessionOverview | Three equal cards (应用, 环境, 进展) | Removed. One run statement, the run strip, one fact row, then definition rows in two columns | `data-overview`, `data-overview-statement`, `data-overview-facts`, `data-overview-section` |
| SessionOverview | Run state, current stage, step count | Run statement (status word, one sentence, elapsed time, the one action that fits the state) | `data-overview-status`, `data-overview-statusline`, `data-overview-elapsed`, `data-overview-start`, `data-overview-resume`, `data-overview-open-trace` |
| SessionOverview | Stage timeline | Compact run strip; a stage opens it in the trace | `data-run-strip`, `data-strip-stage` |
| SessionOverview | Severity ring and pills | 严重程度 rows (instances per level, share as an orange bar); counts once in the fact row | `data-overview-severity`, `data-overview-fact` |
| SessionOverview | Application facts (package, version, hardening, components) | 应用 definition rows; a missing value says 未采集 and why | `data-overview-section="app"`, `data-overview-def` |
| SessionOverview | Device, proxy (`GET /burp/status`), model route | 环境 definition rows | `data-overview-section="env"` |
| SessionOverview | Step durations (`GET /events?source=progress&since_seq=…&limit=200`, up to five pages) | 阶段耗时 rows: share per stage, the three longest steps, the number of steps still open | `data-overview-section="durations"`, `data-overview-duration` |
| SessionOverview | Model usage (`GET /llm-usage`) | 模型用量 rows by stage; calls and tokens once in the fact row | `data-overview-section="llm"` |
| SessionOverview | JS bridge focus (`GET /report/summary`) | One line under 严重程度 | `data-overview-jsbridge` |
| SessionOverview | Task instruction | 任务指令 row | `data-overview-section="brief"` |
| (new) | Items that need the operator | 待处理 list: approvals waiting, findings to review, device offline, the engine's own note, sources that failed. One line when there is nothing | `data-overview-attention`, `data-overview-attention-item` |
| (new) | Latest events | 最近活动: the last trace rows, same glyphs and words as the trace | `data-overview-activity` |
| SessionOverview | Own reads of the session, run status, timeline, findings and devices | Removed: the overview takes them from the workbench, which already reads them. Devices come from the shell's poll; read once here only when that list is empty | — |
| ConversationView | Stage sections with entries | `StageStack` of `StageSection`s: the active stage open, completed stages one summary row, stages not started one placeholder row | `data-stage-stack`, `data-stage-head`, `data-stage-mode`, `data-stage-summary`, `data-stage-future`, `data-stage-upcoming` |
| ConversationView / CaseEntry | Entries: decision, tool call, finding, approval, clue, error | `TraceRow`, five types (判断, 工具, 风险发现, 审批, 结果 / 错误); operator guidance is a 判断 variant with a hollow diamond and the word 引导 | `data-trace-row`, `data-row-type`, `data-row-variant`, `data-author`, `data-row-toggle`, `data-row-panel` |
| CaseEntry | Open a finding, approve / deny | Finding row 打开; approval row 批准 / 拒绝 (same `POST /approvals/:id/decide`) | `data-row-open`, `data-row-approve`, `data-row-deny` |
| ConversationView | Follow, “N 条新进展” | Follow in the surface bar, pin on the run strip, the new-entries pill over the list | `data-wb-follow`, `data-strip-pin`, `data-wb-new-entries` |
| ConversationView | Jump to a stage from the inspector | Same (`#wb-conv-<stage>` anchors kept); also from the run strip and the overview | `data-strip-stage`, `data-wb-stage-jump` |
| (new) | Filter the trace | Row type and stage selects, 清除筛选 | `data-trace-filter`, `data-trace-stage-filter`, `data-trace-clear` |
| ConversationView | Composer: operator clue (`POST /clue`) | `features/composer/Composer`: context chips, “/” commands, “@” to quote a finding, model route, elapsed timer, send and stop in one position; while running, 发送引导 beside 停止 | `data-composer`, `data-composer-input`, `data-composer-primary`, `data-composer-send-guidance`, `data-composer-chip`, `data-composer-menu`, `data-composer-route`, `data-composer-timer` |
| RawView | 终端输出 / 执行监控 switch | Segments of `TerminalSurface` | `data-v3-raw-tab` |
| VirtualTerminal | Recorded output of four sources (`GET /events?source=hook|progress|evidence|bridge`, pages of 200) | `TerminalSurface`, virtualised | `data-terminal`, `data-terminal-line`, `data-terminal-source`, `data-terminal-level` |
| VirtualTerminal | Keyword filter | Find with a hit count and next / previous; 只列匹配行 gives the old filter | `data-terminal-find`, `data-terminal-hits`, `data-terminal-only-hits` |
| VirtualTerminal | Follow, copy | Follow / pause, copy (selection or the listed lines), clear the view, wrap, fullscreen, reload | `data-terminal-follow-toggle`, `data-terminal-copy`, `data-terminal-clear`, `data-terminal-wrap`, `data-terminal-fullscreen`, `data-terminal-reload` |
| TimelinePanel | Steps by stage, state per step | 执行监控 segment, from the workbench's timeline (no second read) | `data-monitor`, `data-monitor-state`, `data-monitor-step` |
| ApiTreePanel | Interface inventory (`GET /api_tree`), OpenAPI import (local), export | `RequestsSurface` › 接口资产: one list, filters (module, method, state, text), pages of 50 / 100 / 200 | `data-api-dual`, `data-api-row`, `data-api-method-filter`, `data-api-search`, `data-api-pager`, `data-api-openapi-input`, `data-api-openapi-btn`, `data-api-export-csv`, `data-api-export-json`, `data-api-status`, `data-api-verified`, `data-api-traffic-total` |
| ApiTreePanel | Interface detail beside the list | Drawer | `data-api-detail` |
| ApiTreePanel / BurpBridgePanel | “+ 线索” (dispatched an event nothing listened to) | 引用到引导输入框: the request becomes a context chip of the composer | `data-api-clue-btn`, `data-burp-clue-btn` |
| BurpBridgePanel | Proxy state (`GET /burp/status`), plugin probe, start / stop forwarding, script download | `RequestsSurface` › 代理流量 status bar | `data-burp-dock`, `data-burp-bridge`, `data-burp-port` |
| BurpBridgePanel | Captured requests (`GET /events?source=bridge&limit=200`, every 8 s), pause, filters, export | Same reads; list with filters, request detail in a drawer | `data-burp-flow`, `data-burp-live`, `data-burp-kw`, `data-burp-code-filter`, `data-burp-export-csv`, `data-burp-export-json`, `data-burp-detail`, `data-burp-empty`, `data-burp-filter-empty` |

Hooks that went with their element: `data-soc-*` (the overview cards), `data-api-group`, `data-api-pf`,
`data-api-variant`, `data-api-dock-head`, `data-api-dock-chips`, `data-api-traffic-group`, `data-api-traffic-head`
(module tree and its chips; the module is a filter and a column now), `data-burp-detail-body`,
`data-burp-detail-clue`, `data-burp-detail-empty` (the side pane; the detail is a drawer).

Changes of behaviour, all deliberate:

- Stopping from the composer goes through the same confirmation as 更多操作 › 停止任务.
- A send failure is stated in the composer with the text kept (it was a toast); a 403 disables the input and says so.
- Guidance can be sent while the run is active (Phase 4 follow-up; it could not before). 停止 stays the primary
  button; 发送引导 is a secondary button beside it, and Ctrl/⌘ + Enter sends. Plain Enter does not send during a
  run. The composer says 引导会追加到当前运行，不会停止任务; sending issues `POST /clue` and nothing else.
- When every read of a session answers 403 the shell shows a permission state (Phase 4 follow-up): header status
  无权限, the run action and the menu's run actions disabled, the banner 当前账号无权读取该会话，请切换账号或联系管理员,
  the live position 无权限, and no retry wording. A single source that answers 403 is named as a permission matter
  in the banner, the inspector and the overview; retry is offered only for reads that failed otherwise.
- A finding or approval row stays in the stage where it first appeared instead of moving to the current stage.
- The terminal reads new output every 8 s while the run is active (it read once on open).
- The inventory lists every module at once with a module filter (it showed one module at a time).
- Request and interface details open in a drawer, not in a side pane.

## Findings and evidence (V3 Phase 5)

`workbench/FindingsView.tsx`, `workbench/GraphView.tsx` and `workbench/EvidenceMatrix.tsx` are replaced by
`workbench/surfaces/findings/` (`FindingsSurface`, `FindingDetail`, `TriageButton`, `marks`) and
`workbench/surfaces/evidence/` (`EvidenceSurface`, `GraphOverview`, `EvidenceList`, `CoverageMatrix`, `graph`). The
three old files are deleted; every capability they carried has an owner below. Findings and evidence stay two
primary tabs. The endpoints are the ones those components read; nothing was added. Checked by
`app/scripts/check-findings-evidence.mjs` (fixtures).

| Old component | Capability (request) | Owner now | Hooks |
| --- | --- | --- | --- |
| FindingsView | List of findings from `vulns/grouped`, de-noised ones left out | `FindingsSurface`: a virtualised grid (priority, title, status, confidence, evidence, instances); the scope statement counts findings, instances and de-noised | `data-findings`, `data-findings-grid`, `data-findings-scope`, `data-finding-row` |
| FindingsView | Priority chip in colour | Four encodings on every row: the orange finding line (3 px for P0 / P1, 2 px for P2 / P3), the cap marker on P0 / P1, a shape per level, the P label with its word. Status is a glyph and a word. No red, no dimming | `data-row-priority-level`, `data-row-cap`, `data-severity`, `data-review` |
| FindingsView | Search, priority filter, status filter, 清除 | Kept, plus a filter by evidence type and sorting by priority, title or instances; a filtered-empty statement with 清除筛选 | `data-findings-toolbar`, `data-sort`, `data-findings-clear` |
| FindingsView | Master / detail: the list stays, the detail does not push it away; “← 列表” below the breakpoint | Pane beside the table from 1280 px; a drawer below. The current row sits on surface-2 | `data-findings-pane`, `data-current` |
| FindingsView | Previous / next finding | Kept in the detail head, with the position (n / total) | `data-finding-prev`, `data-finding-next` |
| FindingsView | 确认发现, 排除, 标记待复核 as three buttons (`POST …/vulns/state` per instance) | One split button: 确认 is the primary action, 排除 and 恢复待复核 are in its menu; the outcome a finding already has is not offered. Same request, same body | `data-triage="primary"`, `data-triage-primary`, `data-triage-more`, `data-triage-item` |
| FindingsView | 批量确认（预览）: a control that wrote nothing | Removed. Ticking rows shows a secondary split button for those rows; it asks in a dialog that lists the rows and the instance count, then writes each instance through the same `POST …/vulns/state` | `data-finding-check`, `data-findings-all`, `data-findings-picked`, `data-triage="secondary"`, `data-findings-confirm` |
| FindingsView | 取消选中 | 取消选择 beside the count of ticked rows; Escape closes the detail | `data-findings-bulk` |
| FindingsView | Detail: 判定摘要, 代码位置, 变量, 提取值, 熵值 | Detail › 概览 | `data-credential-summary`, `data-credential-value` |
| FindingsView | Detail: 用途与调用链, 类型, 作用域, 置信度, 调用链, 关联接口, 同文件凭据组 | Detail › 概览 | `data-credential-context`, `data-credential-group` |
| FindingsView | Detail: 触发实例 (实例 ID, 状态, 静态证明), one instance at a time | Detail › 概览, with the instance switch; Detail › 证据 lists every instance with 证明, 复核步骤 and 原始证据 | `data-finding-instances`, `data-finding-tab` |
| FindingsView | Detail: 代码发现信息 (文件, 行号, 语言, 作用域, context) | Detail › 代码 | `data-finding-tab="code"` |
| FindingsView | Detail: 决策轨迹, with a way to the trace | Detail › 轨迹, 打开 Agent 轨迹 | `data-finding-open-trace` |
| FindingsView | Detail: 修复建议 | Detail › 修复 | `data-finding-tab="fix"` |
| FindingsView | Shadow 对照 (`vulns/grouped?source=shadow`), read-only | The same surface with `source="shadow"`: no tick boxes, no triage control, and a line that says it is read-only | `data-findings="shadow"`, `data-findings-readonly`, `data-finding-readonly` |
| FindingsView | Empty and filtered-empty text | loading, empty (with the de-noised count when that is the reason), error with retry, forbidden without retry, stale, filtered-empty | `data-state` on `[data-findings]`, `data-findings-stale`, `data-findings-notice` |
| (new) | Keyboard | ↑ ↓ Home End move the row, Enter opens the detail and moves focus into it, Escape closes it and returns focus to the row, Space ticks the row | `data-row-index` |
| (new) | A write that is refused or fails | 403: stated as a permission matter, the remaining writes are not sent, no retry. Other failures: what was not written, with 重试 for exactly those rows | `data-findings-notice`, `data-findings-retry` |
| GraphView | Relation graph from `GET …/graph`, read when the view opens | `EvidenceSurface`, same single read; a failed re-read keeps the graph and says it may be old | `data-evidence="graph"`, `data-ev-stale` |
| GraphView | Layered canvas of every node at once | Progressive: groups by type first (folded when there are more than 40 nodes, each with its count and first names), then one node with its direct neighbours, then one more hop on request. The whole graph is drawn only on 完整布局 | `data-ev-lanes`, `data-ev-lane`, `data-ev-neighbourhood`, `data-ev-expand`, `data-ev-full`, `data-ev-view` |
| GraphView | Semantic zoom 0.5x 聚合 / 0.9x 节点 / 1.3x 详情 | Replaced by the three views 总览 / 列表 / 完整布局: aggregation is the grouped overview, node level is the neighbourhood, detail is the side panel | `data-ev-mode` |
| GraphView | Search (节点 / 规则 / 域名), 清空搜索 | Kept; the scope statement says how many of the nodes are shown | `data-ev-toolbar`, `data-ev-scope` |
| GraphView | 图层筛选 by type | 类型 menu with a count per type | `data-ev-types`, `data-ev-types-menu` |
| GraphView | Node inspector over the canvas: 类型, 归属, 版本, 状态, 优先级, 规则, 实例 | Side panel beside the graph (under it at 760 px): 属性, 关联的风险发现, 关系 | `data-ev-side`, `data-ev-panel`, `data-ev-linked`, `data-ev-relations` |
| GraphView | 点击下钻: open the finding of a finding node | 打开风险发现 in the panel and on every linked finding; opens Findings with `?finding=` | `data-ev-open-finding` |
| GraphView | 复制 ID | 复制标识 | `data-ev-copy` |
| GraphView | 定位同类 | 筛选同名 (puts the node's name in the search) and 设为检查对象 (rebuilds the picture around the node) | `data-ev-same`, `data-ev-focus` |
| GraphView | 刷新 / 重新加载 | 刷新 in the toolbar; 重新读取 in the empty state; 重试 in the error state | `data-ev-reload` |
| GraphView | Empty text | loading, empty, error with retry, forbidden without retry, stale, filtered-empty, truncated note | `data-state` on `[data-evidence="graph"]` |
| (new) | List view of the graph | 列表: type, name, id, relations, linked findings; the default at 1024 px and below, the only view at 480 px and below | `data-ev-list`, `data-ev-row`, `data-ev-listonly` |
| (new) | One selection for the evidence tabs | The inspect target chosen in the graph or in the coverage matrix is shown above 事实图谱, 应用结构, 凭据 and 覆盖矩阵, and the graph opens on it | `data-ev-target`, `data-ev-crumb` |
| EvidenceMatrix | Evidence type × priority, counted in findings; 合计; 未标注 | `CoverageMatrix`, same counting rule and the same sentence about it | `data-coverage-table`, `data-coverage-row`, `data-coverage-scope` |
| EvidenceMatrix | 阶段分布 | Kept under the table | `data-coverage-stages` |
| (new) | Why a kind of evidence is missing | A reason per row from the run state the workbench already reads: stage still running (with steps done), not run, out of scope, device offline, waiting for login, failed, collected but not in the text, or unknown because the run status could not be read (a 403 says so) | `data-coverage-reason`, `data-reason` |
| (new) | The findings behind a number | A row opens two lists (with and without that evidence); a finding there can be made the inspect target or opened | `data-coverage-detail`, `data-cov-list`, `data-cov-finding`, `data-coverage-target` |
| CredentialsView, ClustersView, FactGraphView | Error text for any failed read | A 403 says 没有权限读取… without retry; other failures keep 重试. Content and requests unchanged | `data-state="forbidden"`, `data-state="error"` |

Changes of behaviour, all intended:

- A finding is opened on arrival only where the detail has its own pane (from 1280 px). Below that the table is
  shown first and a row opens the drawer.
- Triage of one finding is immediate, as before. Triage of several rows is new and always asks first.
- A read-only source shows no triage control at all (it showed disabled buttons).
- Inside a drawer or dialog, Escape closes an open menu first and the overlay on the next press (`useOverlay`).
- `docs/v3-plan.md` lists `GraphView` as modified. It is retired instead: nothing of its canvas is reused, and its
  capabilities are the rows above.

### Rule cards and application structure (V3 Phase 5 follow-up)

`docs/v3-plan.md` lists both as modified in Phase 5; the phase commit left them as V2 components inside the V3 frame.
This follow-up rebuilds them. `pentest/VulnsPanel.tsx` is replaced by `workbench/surfaces/findings/RuleCardsSurface.tsx`
and deleted. `attack-canvas/AttackCanvas.tsx` keeps its file, its export and its data code (aggregation above 200
nodes, drill-down, layer order, folding, layout) and gets a new presentation. Neither view reads or writes anything it
did not before. Checked by groups R1–R9 and S1–S6 of `app/scripts/check-findings-evidence.mjs` (fixtures) and by
`app/scripts/check-source-slice.mjs`.

| Old component | Capability (request) | Owner now | Hooks |
| --- | --- | --- | --- |
| VulnsPanel | Rule cards from `vulns/grouped`, read when the view opens | `RuleCardsSurface`, same single read; the scope statement counts cards, instances and de-noised cards | `data-rulecards`, `data-rulecards-scope`, `data-rulecards-list`, `data-rule-card` |
| VulnsPanel | Severity chip in colour, card dimmed when de-noised or info | The four finding encodings of the main list (orange line 3 px / 2 px, cap on P0 / P1, shape, P label with its word); 提示级 and 已降噪 are tags; nothing is dimmed and nothing is red | `data-rule-priority`, `data-severity`, `data-review` |
| VulnsPanel | Search over title / CWE / MASVS | Kept | `data-rulecards-search` |
| VulnsPanel | Surface split 全部 / APK 静态 / WEB 运行时 | Kept as a segmented control with counts; the WEB-empty reason is kept | `data-rulecards-toolbar` |
| VulnsPanel | Severity chips | One select with a count per level | `data-rulecards-severity` |
| VulnsPanel | 硬编码凭据 filter | Kept as a pressed toggle | `data-rulecards-credential` |
| VulnsPanel | 显示已降噪 toggle with the count | Kept | `data-rulecards-noise` |
| VulnsPanel | Deep-link filters `?severity=` and `?masvs=` (also `__none__`), each with a clear control | Kept | `data-rulecards-link-filters`, `data-clear-sev`, `data-clear-masvs` |
| VulnsPanel | 手动补录: a local entry (title, level, MASVS, evidence) kept in `localStorage` per session, marked 本地, nothing sent | Kept, same storage key, same mark | `data-rulecards-add`, `data-rulecards-form`, `data-rulecards-form-submit` |
| VulnsPanel | 导入 (`UniversalImportModal`, merged locally, marked) | Kept | `data-rulecards-import` |
| VulnsPanel | 导出 csv / json / md / sarif | Kept as one menu, same file name | `data-rulecards-export`, `data-rulecards-export-item` |
| VulnsPanel | One card open at a time, the first open on arrival | Kept; the header is a button with `aria-expanded` | `data-rule-toggle`, `data-rule-open` |
| VulnsPanel | Evidence dimensions 源码行 / 组件声明 / 流量报文 as coloured dots | A mark and the word 有 or 无 per dimension | `data-rule-dims`, `data-rule-dim` |
| VulnsPanel | Per instance: id, state, evidence slice with line numbers, HTTP line marked | Kept | `data-rule-instances`, `data-rule-instance`, `data-rule-slice` |
| VulnsPanel | Per instance: model verdict with its rationale | Kept, worded 模型复核 | `data-rule-verdict` |
| VulnsPanel | Per instance: copy the evidence | Kept | `data-rule-copy` |
| VulnsPanel | Per instance: chain (发现, 触发, 复现报文, 证明, 修复建议, 复现步骤) | Kept; an instance without one says so | `data-rule-chain` |
| VulnsPanel | Hook events of the session (`events?source=hook`), last 8 | Kept, same read | `data-rule-hooks` |
| VulnsPanel | State per instance through a `<select>` (`POST …/vulns/state`, body `{ id, state }`) | The shared `TriageButton` (secondary): 确认 as the action, 排除 and 恢复待复核 in its menu; the state an instance already has is not offered. Same request, same body, the list is read again afterwards | `data-triage="secondary"`, `data-triage-primary`, `data-triage-more`, `data-triage-item` |
| VulnsPanel | A local entry's state | Kept in this browser, said so in a notice, nothing sent | `data-rulecards-notice="info"` |
| VulnsPanel | A failed write kept as a local value and marked | 403: stated as a permission matter, not kept locally, no retry. Other failures: kept in this browser, the instance marked 仅本地, with 重试写入; a write that then succeeds removes the mark | `data-rulecards-notice="forbidden"`, `data-rulecards-notice="error"`, `data-rulecards-retry` |
| VulnsPanel | Loading skeleton, empty text | loading, empty, error with retry, forbidden without retry, stale (a failed re-read keeps the cards and says they may be old), filtered-empty with its reason and 清除筛选 | `data-state` on `[data-rulecards]`, `data-rulecards-stale`, `data-rulecards-clear` |
| AttackCanvas | Layered structure canvas from `GET …/graph` and `GET …/api_tree`, both read when the view opens | Kept, same two reads; layer titles 应用 / 暴露面 / 接口与配置 / 审批 / 风险发现 | `data-attack-canvas="v3"`, `data-node-id` |
| AttackCanvas | Node cards with emoji marks and coloured fills | Hairline cards; the type is an icon and a word (`NodeMark`); a finding node carries the orange finding line, the cap on P0 / P1, the P label with its word and the status glyph with its word | `data-node-rel` |
| AttackCanvas | Selecting a node dims everything else | Nothing is dimmed: the selected node sits on surface-2 with the active line, its direct neighbours get the strong border, the relations that touch it are drawn in the brand colour at 2 px | `data-node-rel="sel"`, `data-node-rel="near"` |
| AttackCanvas | Relation kinds by colour | By stroke pattern and width (solid 2 px confirmed, dashed excluded, dotted pending, long dash tried); the legend draws each one | `data-canvas-legend-toggle`, `data-canvas-legend`, `data-canvas-legend-flow` |
| AttackCanvas | Floating dock: zoom in / out, fit, home, re-arrange, PNG, JSON | A toolbar above the canvas with the same seven actions, each with a name | `data-canvas-dock`, `data-canvas-btn` |
| AttackCanvas | 聚焦 (confirmed findings and what leads to them) / 全部 | 显示范围: 已确认发现 / 全部; when there is no confirmed finding it says so | `data-canvas-btn="focus"`, `data-canvas-btn="all"`, `data-canvas-nofocus` |
| AttackCanvas | Dense layout | 节点密度: 宽松 / 紧凑 | `data-canvas-btn="dense"` |
| AttackCanvas | Chain walk (step through the confirmed paths) | 关联路径 i / n; disabled when there is none; after the last path it returns to no path. The path in view is drawn at 2.5 px | `data-canvas-chain`, `data-node-rel="path"` |
| AttackCanvas | Aggregation above 200 nodes, drill-down into a group, folding at 12, cap at 60 | Unchanged code; the scope statement says how many of the nodes are shown | `data-canvas-scope` |
| AttackCanvas | Minimap | Kept from 761 px up | (React Flow minimap) |
| AttackCanvas | Double click a node: source slice for a component or deep link (`/api/chat/source`), properties otherwise | Kept in a kit dialog; also reachable through 打开 for the selected node, so it does not need a pointer. A 403 on the source says 没有权限读取这份源码 | `data-canvas-src-modal`, `data-canvas-node-info`, `data-canvas-open`, `data-canvas-selected` |
| AttackCanvas | Select a node as inspection target | Kept (click, or Enter / Space on a focused node); a click on the empty canvas clears it | `data-canvas-selected` |
| AttackCanvas | Any failed read shown as “no data yet” | 403: `PermissionState` 没有权限读取应用结构, no retry. Other failures: `ErrorState` with 重试. Empty and loading have their own states | `data-state` on `[data-attack-canvas]` |
| AttackCanvas | Dot-grid background | Removed (design rule) | — |

Changes of behaviour in the follow-up, all intended:

- A refused state change (403) on a rule-card instance is no longer kept as a local value; it showed as changed in
  this browser although the account may not change it.
- The app node shows the real counts per type (they were never passed and read 0), the mark 本地 appears on local
  entries (the field it read was never set), and a click on a layer title scrolls to that layer (it looked up a
  position that did not exist).
- The wording 战果 is replaced by 风险发现 / 已确认发现 everywhere in the canvas.

## Shared owners (kept on purpose)

| Job | Renderings | Why both stay |
| --- | --- | --- |
| Findings list | Findings › 主发现 (`FindingsSurface`) and Findings › 规则卡 (`RuleCardsSurface`) | 规则卡 carries local entries, import / export, the MASVS filter and the per-instance evidence slice that the main list does not have. Both use the same marks and the same triage button, so the job has one action pattern. Merging the two lists needs a product decision; 主发现 stays the default. |
| Graph | Evidence › Relation graph › 关系图 (`EvidenceSurface`) and › 应用结构 (`AttackCanvas`) | Different data: session relation graph versus application structure with source slices. Both use `NodeMark` and the finding marks. |

## Inspector ownership

The inspector holds low-frequency context only: 复核队列 (approvals waiting and the current inspection target),
简报 (session and task numbers, authorisation, model routing, exploration run), 进度 (stages with their steps, the
five review rounds), 日志 (last 20 events). It repeats neither findings, reports or metrics (those live on the work
surfaces) nor the run status, current stage, elapsed time or pending count (those live in the session header).

## Verification

Verified with fixtures (`app/scripts/fixtures/api.mjs`, production preview build): every `?view=` id in the
table resolves and renders, including error, forbidden, slow and empty variants (`scripts/check-workbench.mjs`).
The shell itself (one navigation layer, header readouts, tabs, surface bar, the three inspector layouts, keyboard
and focus) is covered by `scripts/check-workbench-shell.mjs`. The count on the 风险发现 tab (none without
permission to read the findings, 0 only for a readable session without findings) is covered by
`scripts/check-findings-tab-count.mjs`. The findings and evidence surfaces (encodings, keyboard,
triage requests, permission states, the progressive graph, coverage reasons, and since the Phase 5 follow-up the
rule cards and the structure canvas) are covered by `scripts/check-findings-evidence.mjs`.

Real backend (Phase 17, `docs/screenshots/phase-17/`): VulnsPanel state change, import and export, AttackCanvas
source slice, mission start and status all verified. The clusters view was part of the 65 s read audit
(`?view=clusters`, 0 failed requests).

## Legacy retirement gate (Phase 16)

`?ui=v3` and `?ui=v2` are removed only when every row passes. Status as of Phase 16:

| Gate | Status | Evidence |
| --- | --- | --- |
| Real-backend read audit | Pass, with one backend 500 (`auth_matrix` for a session without that data): 0 duplicate requests, 0 duplicate streams, 0 page errors | `app/scripts/real-read-audit.mjs`, result in `docs/screenshots/phase-16/` |
| Real-backend write audit | **Not passed.** Six writes returned 200 (project, assessment, session, clue, feedback, stop). Start returned 400 (sample not installable) and the rule-card state change was not sent (no finding in the disposable session) | `app/scripts/real-write-audit.mjs`, result in `docs/screenshots/phase-16/` |
| V3 1440 px overflow resolved | Pass | `[data-v3-rail]` no longer overflows; 0 px at 1440 / 1024 / 760 / 390, light and dark (`docs/screenshots/phase-16/legacy/`) |
| Capability matrix has no missing capability | Pass | tables above; unchanged in Phase 16 |
| No current route depends on the legacy shell for a primary job | Pass | the only link into a legacy shell is the workbench's 旧版工作台 entry (`WorkbenchPage.openLegacy`); every route renders the six-tab workbench by default |

**Decision: keep `?ui=v3` and `?ui=v2`.** The write audit has two open items (a successful task start and the rule-card state change), and the Phase 15 items listed above (mission start and status, rule-card import and export, source slice) are still unverified on a real backend. Nothing is removed in Phase 16.

## Legacy retirement gate (Phase 17)

| Gate | Status | Evidence |
| --- | --- | --- |
| Real-backend read audit, 0 duplicates, 0 errors, 0 5xx | Pass | `docs/screenshots/phase-17/real-read.json` |
| Successful task start | Pass (200, `running`, then stopped) | `real-write.json` |
| Rule-card state change | Pass (changed, read back, restored) | `real-write.json` |
| Mission start and status | Pass (replay, reached `done`) | `real-write.json` |
| Rule-card import / export on real data | Pass (local only; 0 non-GET requests) | `real-write.json`, `real/rulecards*.png` |
| Source slice | Pass after the relative-name fix; checked in the UI on a fully qualified and a relative component | `real/structure-source*.png` |
| V3 overflow, capability matrix, no route depends on the legacy shell | Pass | Phase 16 and this file |

**Decision: `?ui=v3` and `?ui=v2` retired.** Details, removed modules and test data: `docs/screenshots/phase-17/legacy-retirement.md`.
