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
| VulnsPanel | Rule-card list with severity / credential / MASVS (`?masvs=`) filters | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | Manual add (local), import / export, local notes, copy | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | Code board, hook stack, agent verdict, chain per card | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | State change (`POST /vulns/state`) | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| AttackCanvas | Application structure canvas (React Flow), minimap, chain walk | Evidence › Relation graph › 应用结构 | `structure` | Moved in Phase 15 |
| AttackCanvas | Source slice on double click (`/api/chat/source`) | Evidence › Relation graph › 应用结构 | `structure` | Moved in Phase 15 |
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

## Shared owners (kept on purpose)

| Job | Renderings | Why both stay |
| --- | --- | --- |
| Findings list | Findings › 主发现 (workbench list) and Findings › 规则卡 (VulnsPanel) | 规则卡 carries local notes, import / export, MASVS filter and per-card code board that the main list does not have. Merging them needs a product decision; 主发现 stays the default. |
| Graph | Evidence › Relation graph › 关系图 and › 应用结构 (AttackCanvas) | Different data: session relation graph versus application structure with source slices. |

## Inspector ownership

The inspector holds low-frequency context only: 复核队列 (approvals waiting and the current inspection target),
简报 (session and task numbers, authorisation, model routing, exploration run), 进度 (stages with their steps, the
five review rounds), 日志 (last 20 events). It repeats neither findings, reports or metrics (those live on the work
surfaces) nor the run status, current stage, elapsed time or pending count (those live in the session header).

## Verification

Verified with fixtures (`app/scripts/fixtures/api.mjs`, production preview build): every `?view=` id in the
table resolves and renders, including error, forbidden, slow and empty variants (`scripts/check-workbench.mjs`).
The shell itself (one navigation layer, header readouts, tabs, surface bar, the three inspector layouts, keyboard
and focus) is covered by `scripts/check-workbench-shell.mjs`.

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
