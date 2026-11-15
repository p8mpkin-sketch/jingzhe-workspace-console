# Changelog

Design-system migration of `app/`. Routes, API calls, permissions, task and report behavior are unchanged.
Phases 1–13 are presentation only; Phase 14 also changes request dedupe and stream reconnect pacing;
Phase 15 routes the feedback requests through the shared client.
Phase 16 verifies against the real backend and fixes the legacy V3 header overflow.
One entry per phase.

## Phase 16 — Real-backend verification and legacy cleanup

A verification and cleanup phase. No redesign, no new endpoint, no change to API contracts, routes, permissions,
task behavior or report behavior.

### Real-backend read audit
`app/scripts/real-read-audit.mjs`, run on the machine that hosts the backend (the build environment cannot reach
`127.0.0.1:8099`), on a production preview build. 14 routes for 65 s each and the 20 workbench surfaces, read-only.
- 0 duplicate data requests, 0 duplicate stream connections; each SSE endpoint connected once and stayed open.
- `/api/feedback` is one read. `/api/tasks` with different query strings stay separate (5 keys).
- Polling intervals match the fixture run (8 s and 30 s). 0 page errors, 0 write attempts on load.
- One failed request: `GET /api/pentest/sessions/260/auth_matrix` → 500, a backend response for a session without
  that data. The reports page already treats a failed read as "no matrix".
- `GET /api/models/providers` was not requested on the session and agent routes although the fixture run requests
  it; cause not determined, nothing failed.
- Result: `docs/screenshots/phase-16/real-read.json`.

### Real-backend write audit
`app/scripts/real-write-audit.mjs`, against a disposable project (11), task (100409) and session (261).
- 200 with unchanged endpoints and bodies: project creation, assessment creation, session creation, clue,
  feedback, task stop.
- Task start returned 400: the disposable sample is not installable, so the backend refused and no device was
  driven. A successful start is still unverified.
- Rule-card state change was not sent: the disposable session has no finding, and the audit does not change
  findings of real sessions.
- Session creation returned 404 in the automated run because the task had no run directory yet; the script now
  waits for the task to finish first.
- Cleanup: task deleted (GET → 404), session closed. Left behind because the API has no delete route: project
  11, the closed session 261 and one feedback row. No database was edited by hand.
- Results: `docs/screenshots/phase-16/real-write.json`, `real-write-verified.json`, screenshots in `real/`.
  The local filesystem path of the sample was removed from the automated result after the run.

### Legacy V3 overflow
The overflowing element was the header row `[data-v3-rail]` (content 1507 px in a 1372 px row at 1440). Its
`[data-v3-dive-dock]` child was `flex-none` although it scrolls horizontally. The dock now shrinks; below 640 px
the row wraps and the composer toolbar wraps. 0 px overflow at 1440 / 1024 / 760 / 390, light and dark, for V3
and V2 (`docs/screenshots/phase-16/legacy/`). Three class changes, no behavior change.

### Legacy retirement gate
Not met; `?ui=v3` and `?ui=v2` stay. Read audit, overflow, capability matrix and "no route depends on the
legacy shell" pass. The write audit has two open items (a successful task start, the rule-card state change),
and mission start and status, rule-card import and export and the source slice are still unverified on a real
backend. The gate table is in `docs/capability-matrix.md`.

### Keyboard
The findings table was mouse-only. Sortable headers now respond to Enter and Space; rows are focusable, select
with Enter or Space, and ArrowUp / ArrowDown move between them.

### Verification (fixtures, production preview build)
- `npm run lint:tokens`: 0. `tsc --noEmit` and `npm run build` pass. Contrast: 0 failing pairs.
- 14 routes × 1440 / 1024 / 760 / 390 × light / dark: 0 overflow, 0 page errors; request set identical to the
  baseline. Empty, error, forbidden and slow variants at 1440 and 390, stale at 1440: 0 overflow, 0 page errors.
- 20 workbench surfaces × the same widths and themes, plus five data-state variants: 0 overflow, 0 errors,
  2054 focus stops, 0 without a focus indicator, 0 covered.
- 65 s held-stream cadence: 0 duplicates (`docs/screenshots/phase-16/request-cadence.fixtures-held.json`).
- Keyboard: route tabs and workbench tabs with arrow keys, menus with arrows / Home / End, Escape returns
  focus from menus and the inspector, findings table as above.

### Not verified
- A successful task start, the rule-card state change, mission start and status, rule-card import and export,
  and the source slice, on a real backend.
- The route and workbench screenshots are from fixtures; only the three in `real/` show real-backend data.

## Phase 15 — Assessment suite consolidation and legacy parity

Closes the gap between the six-tab workbench and the legacy workbenches, tightens the pages around it, and
records what a person with backend access has to replay. Routes, API contracts, permissions, task behavior and
report behavior are unchanged; no endpoint was added. The six tabs, the token migration and the spacing
migration from Phase 14 are untouched.

### Requests
- `/api/feedback` (GET on the system page, POST from the AI sidebar) goes through the shared API client. The
  system page's feedback statistics gain loading, error, forbidden and retry states.
- Audit on a production preview build (not the dev server): the unique request set of the 14 routes is identical
  to the baseline. With SSE requests held open, as a live backend holds them, duplicates in the first 3 s are 0
  for Phase 14 (bdae05d) and 0 for Phase 15, with the same polling set and intervals.
- When the fixture closes every stream at once, reconnect attempts are counted as duplicates and the number moves
  between runs of the same build (13 to 17 observed; 13 for Phase 14 and 17 for Phase 15 in the recorded pair).
  Every entry is a stream reconnect or the agent event poll. `scripts/check-polling.mjs` gains `HOLD_STREAMS=1`
  to measure without that artefact. Data: `docs/screenshots/phase-15/request-cadence.json`.
- `docs/request-map.md` lists route, method, query, expected unique count and polling interval per route and
  per workbench view, with a replay command, and separates "verified with fixtures" from "pending real backend".

### Capability parity
`docs/capability-matrix.md` maps every legacy panel to its workbench owner. No capability is without an owner
and none was removed. New owners in this phase:

| Legacy capability | Owner | `?view=` |
| --- | --- | --- |
| VulnsPanel (rule cards, manual add, import / export, MASVS and credential filters, notes, state change) | 发现 › 规则卡 | `rulecards` (new id) |
| V3 finding clusters | 发现 › 聚类 | `clusters` (new id) |
| AttackCanvas (structure canvas, source slice, path walk) | 证据 › 证据关系 › 应用结构 | `structure` (new id) |
| V3 mission start (device / replay) | Header › 更多操作 | — |
| V3 mission status, model routing chip | Inspector › 简报 | — |
| AI inspector drawer object inspector | Inspector › 复核队列 › 当前检查对象 | — |

Every earlier `?view=` id still resolves; the default is still `stream`. `?ui=v3` and `?ui=v2` stay reachable
until the pending real-backend checks in the matrix pass.

### Inspector
The inspector keeps low-frequency context only: 复核队列, 简报, 进度, 日志. The 证据 tab, the recent-findings card
and the counter card are gone, since the main surface already shows them.

### Project and session index
- Projects: the four metric cards become one fact row, followed by the sessions in progress (running, waiting
  for sign-in, or paused; ordered by id, since rows carry no reliable timestamp). One primary action (新建评估项目).
- Project sessions: the primary action is 继续会话 for the session in progress, or the most recent open one;
  新建会话 opens the wizard in place and becomes primary when there is nothing to continue.

### New assessment
One submit action. The former second button (create and go to the session) is a destination choice next to it
(任务队列 or 渗透会话), which keeps the `data-submit-pentest` hook. The review panel lists what will be produced.
Request body and saved prefill are unchanged.

### Visual consolidation
- Session overview: the three cards size to their content instead of stretching to the viewport, and use
  neutral titles.
- Proxy traffic: one primary action; the plugin generator is secondary.
- Neutral copy in the rule-card and application-structure surfaces now that they are first-class.

### Responsive and accessibility
- 390 px is part of every audit. Proxy traffic and analysis output stack and scroll below the tablet
  breakpoint; before, the detail pane covered 26 focusable controls at 390 px.
- Menus move with ArrowUp / ArrowDown / Home / End. Escape in the inspector returns focus to its toggle.

### Legacy V3 overflow at 1440 px
Reproduced and measured: the V3 header chip row overflows the document by 148 px at d7c1471 (Phase 13, before
the workbench work) and by 135 px now. It predates Phase 14 and is left as is.

### Verification (fixtures, production preview build)
- `npm run lint:tokens`: 0. `tsc --noEmit` and `npm run build` pass. Contrast: 0 failing pairs.
- 14 routes × 1440 / 1024 / 760 / 390 × light / dark: 0 overflow, 0 page errors. Empty, error, forbidden and
  slow variants at 1440 and 390, stale at 1440: 0 overflow, 0 page errors.
- 20 workbench surfaces × the same widths and themes, plus five data-state variants: 0 overflow, 0 errors,
  2014 focus stops checked, 0 without a focus indicator, 0 covered (`scripts/check-workbench.mjs`).
- Screenshots: `docs/screenshots/phase-15/` and `docs/screenshots/phase-15/workbench/`.

### Not verified
- Nothing was run against a real backend; `127.0.0.1:8099` refused connections. All numbers above are from
  fixtures. The replay list is in `docs/request-map.md`.
- No write was sent, even to fixtures: mission start, rule-card state change, clue, feedback POST and task
  creation are wired to the same endpoints and bodies as before but were not exercised.
- Legacy V3 / V2 keep their earlier copy and layout.

## Phase 14 — Assessment workbench consolidation

An information-architecture phase. The workbench's panels now have one owner each, and the data layer stops repeating requests. Routes, API contracts, permissions, task behavior and report behavior are unchanged; no endpoint was added. Unlike earlier phases, this one edits `src/services` and `src/stores`, as requested, for request dedupe and reconnect pacing only.

### Information architecture
The rail listed 13 views in two groups, and a context panel had six more tabs. The workbench now has six primary tabs, defined once in `workbench/ia.ts`. Each surface is reachable from exactly one place.

| Primary | Secondary | Surfaces (`?view=`) |
| --- | --- | --- |
| 概览 | | `overview` |
| 运行 | Agent 轨迹 | 研判 `stream`, 取证 `stream&tab=trajectory`, 推理记录 `ai` |
| | 终端 | `raw` (终端输出, 执行监控) |
| | 接口与请求 | 接口资产 `apitree`, 代理流量 `burp` |
| 发现 | | 主发现 `findings`, Shadow 对照 `shadow` |
| 证据 | 证据关系 | 关系图 `graph`, 事实图谱 `facts` |
| | 凭据 | `credentials` |
| | 覆盖矩阵 | `coverage` (new id) |
| 产物 | 分析输出 | `artifacts` (new id) |
| | 加固信息 | `packer` (new id) |
| 报告 | 报告 | `report` |
| | 版本对比 | `diff` |

- Every earlier `?view=` link resolves to the same surface. The default surface is still `stream`, so the session route's request log is unchanged.
- **Moved.** The coverage matrix moves from the context panel to 证据. The task artifacts browser (previously only a dialog in the task list) is also the 分析输出 surface, on the same endpoints. The packaging panel (previously only in the legacy workbench) is the 加固信息 surface.
- **Merged.** 决策流 and AI 思考 are segments of Agent 轨迹. 接口资产 and Burp 联动 are segments of 接口与请求. Shadow 发现 is a segment of 发现. 关系图 and 事实图谱 are segments of 证据关系. The stream tab bar, the tool header with its "back to stream" button and the per-view title bars are replaced by one surface bar.
- **Inspector.** The context panel is the 检查器: 复核, 进度, 简报, 证据, 日志. It stays open across surfaces when docked (≥ 1400 px) and closes on a surface change when it is an overlay.
- **Legacy.** The earlier workbenches stay reachable from the rail (旧版工作台), with a bar that returns to the current one. The findings matrix, the canvas and the AI inspector drawer of those workbenches are only there.

### Data layer
- **GET dedupe** (`services/apiClient.ts`): identical plain GETs share one in-flight request, and a successful response is reused for 2 s. Any write, any pointer or key input, and a token change invalidate the reuse, so a refresh control always reaches the server.
- **One owner per stream.** `notifications.connect()` is idempotent. The dashboard reads the signed-in user from the auth store instead of requesting `/api/me` again.
- **Reconnect** (`services/backoff.ts`), used by the agent stream, the notification stream and the session event stream: exponential backoff with equal jitter from 1 s, capped at 30 s; reset only after a connection delivers data or stays open 5 s; the cursor (`since_seq`) is read at every reopen; nothing reconnects while the tab is hidden, and one attempt runs when it is shown again. The session event stream previously relied on the browser's fixed-interval retry, which also replayed the original cursor.

### States
- A partial-data notice with retry shows on every surface when a workbench source failed.
- Reused panels no longer render a failed read as empty data: reasoning record, terminal output, step monitor, API inventory, proxy status, relation graph, packaging, version compare (which reported "0 differences" on failure), report (which rendered an all-zero report) and analysis output.
- Report: the chapter list scrolls to its section; a 复核状态 chapter is built from finding states; export actions appear once; the paper is left-aligned at 960 px.
- Copy in the promoted panels uses neutral assessment language.

### Spacing
`padding`, `margin` and `gap` in `workbench.css`, `v3.css` and the inline styles of `workbench/*.tsx` read `--jz-space-*`: 347 values map exactly, 74 off-grid values snap to the nearest step, and 0 / 1 px offsets stay literal. `design/tokens.css` gains `--jz-space-0-5`, `-1-5`, `-2-5` and `-5`.

### Added
- `scripts/check-workbench.mjs`: audits all 17 surfaces at 1440 / 1024 / 760 in both themes — deep links, click reachability with no duplicate owner, overflow with and without the inspector, focus indicator and occlusion, and the empty / error / forbidden / slow / stale variants.
- `scripts/check-reconnect.mjs`: reconnect pacing, hidden-tab pause and cursor preservation of the agent stream.
- Fixtures for packaging, model usage, credentials and proxy status.

### Verified
- `tsc --noEmit`, `npm run build` and `npm run lint:tokens` (0) pass; 0 contrast failures.
- Workbench: 17 surfaces × 3 widths × 2 themes, 0 overflow, 0 page errors, 1218 tab stops with a visible indicator and none covered; 5 data-state variants with no blank surface.
- 14 routes at 1680 / 1440 / 1280 / 1024 / 760 in both themes: 0 overflow, 0 page errors. The request log is identical to the baseline.
- Request cadence over 65 s (`docs/screenshots/phase-14/request-cadence.json`): no duplicate non-stream request in the first 3 s on any route; `/agent` goes from 209 to 35 requests.
- Reconnect: gaps of 0.7 / 1.7 / 3.1 / 7.4 / 11.8 s, 0 attempts while hidden, 1 on show, `since_seq` kept.

### Gaps
- **No live backend.** `127.0.0.1:8099` refuses connections in this environment, so everything above ran on fixtures. `REAL=1 BASE=… TOKEN=… node scripts/check-polling.mjs` is ready for a live run.
- Fixtures answer every stream with an empty body, so streams reconnect (now backed off) in every fixture run; against a live backend they stay open.
- The legacy workbenches keep their earlier layout and copy. Legacy V3 (`?ui=v3`) overflows its header by 135 px at 1440; whether that predates this phase was not checked.
- The terminal surface keeps its own 终端输出 / 执行监控 switch inside the panel.
- The 2 s GET reuse applies to all plain GETs. A view that must re-read within 2 s without user input should pass `cache: 'no-store'`.

## Phase 13 — Finish quality and real-data readiness

This phase finishes quality on top of Phase 12 with no redesign. Routes, requests, permissions, task behavior and report behavior are unchanged. The split preview stays the default report view.

### Token lint: 19 → 0
The lint rule was not loosened. Every finding was resolved at its source.
- **Hex 6.** All six were task numbers in copy, not colors: the `任务 #100367` examples in `AgentPage.tsx` and `AgentComposer.tsx`, and `#792` in the `NewProjectWizard.tsx` placeholder.
  - Example prompts now build the reference from `EXAMPLE_TASK_ID` in `agent/model/sessionMeta.ts`, in the product's `任务 #<id>` format.
  - The wizard placeholder no longer names a real app.
- **Font size 6.** ECharts text in `DashboardPage.tsx` and `SkillsPage.tsx` now reads the new `--jz-text-chart-label` (11 px) and `--jz-text-chart-tick` (10 px) through `tokenPx()`. `tokenPx()` is the documented adapter next to `tokenColor()`.
  - Knowledge-graph node labels move from 9 px to 10 px.
- **CSS literal 7.**
  - The three `box-shadow: none` resets use `--jz-shadow-none`.
  - The four `@font-face` blocks move into `design/tokens.css`, because `@font-face` cannot read custom properties. Fonts are still self-hosted, and all four faces load.
- `npm run lint:tokens` runs the lint in `--strict` mode.

### Changed
- `/company` with 0 projects: the start band explains the workflow. The page ends with a next-step surface that states the cause (the list loaded and was empty) and offers 新建公司项目 or 先看候选发现.
- `/company` with 1 project: filters stay hidden. A compact 接下来 surface derives its step from the project's own list fields (an empty inventory means import apps; otherwise generate reports) and offers candidate discovery. It sends no extra request.
- `/company` with 2 or more projects: unchanged.
- The lead company project is ordered by `created_at` only when every candidate carries a finite value; otherwise it is ordered by id. No date is derived or displayed. A `TODO(api)` records that the live list response is unverified.
- `/agent`:
  - The transcript reserves its scrollbar gutter, so streaming output does not reflow the conversation when scrolling begins.
  - The session menu (联网, Fork, 导出轨迹, seq) now uses `RowActions`.
- `/pentest`: the project menu now uses `RowActions`. All `data-probe` hooks are kept.
- Workbench: the "last updated" time no longer advances when every data source failed.
- Copy: the report preview footer no longer repeats its scope, and the empty company index no longer restates the three steps.

### Added
- `capture.mjs --variant stale`: data loads, then the backend fails and the page's own refresh control is used once. The feedback per route is written to `report.stale.json`.
- `scripts/check-polling.mjs`: lists per-route duplicate requests in the first 3 s and every repeating request over 65 s. `REAL=1 BASE=... TOKEN=...` runs it against a live backend without fixtures.

### Verified
- `tsc --noEmit`, `npm run build` and `npm run lint:tokens` (0) pass.
- 14 routes at 1680 / 1440 / 1280 / 1024 / 760 in both themes: 0 overflow, 0 page errors. The request log is identical to the baseline.
- All 14 routes in the empty, error, forbidden, slow and stale variants at 1440 and 760: 0 overflow, 0 errors.
  - Stale feedback appears on /dashboard, /company, /company/projects/:id, /tasks and the session workbench.
  - /new-audit reports a failed device refresh with a toast.
  - The other routes have no manual refresh control.
- Report keyboard path, run at 1440 and 1280 in both themes:
  - The list is a single tab stop.
  - ↓, End, Home and ↑ (clamped at the ends) move both the selection and the preview.
  - → focuses the preview heading, and Esc or ← return to the row.
  - Enter opens the full report.
  - Keyboard navigation of the preview makes 0 requests.
  - The preview label reads "摘要预览 · 不含发现明细与证据", and the preview background differs from the list surface.
- Focus under the sticky workspace tabs: 0 occluded at 1680, 1440, 1280, 1024 and 760.
- Agent:
  - Pin state survives a reload in both directions.
  - Column widths stay at 248 / 804 / 320 while content streams in.
  - The center minimum holds exactly: a 1128 px workspace (center 560 px) pins, and 1127 px (center 559 px) falls back to the drawer. The toggle explains the fallback.
- Request cadence over 65 s per route, compared with the Phase 12 build: identical duplicates and polling sets on every route (`docs/screenshots/phase-13/request-cadence.json`).
- Contrast: 0 failing pairs. Focus scan: 319 controls, each with a visible ring.
- Screenshots in `docs/screenshots/phase-13/`:
  - Each route at 1440 / 1024 / 760 in both themes, plus the five state variants.
  - `states/`: 0, 1 and 2 projects at three widths in both themes.
  - `interaction/`: report keyboard, sticky focus, agent persistence and fallback, and row menus.

### Remaining gaps
- **No real backend was reachable.** The repo has no backend and `127.0.0.1:8099` refuses connections, so every flow ran on fixtures. `check-polling.mjs` is ready for a live run.
- **Behavior seen only on fixtures:**
  - The fixture closes every SSE stream at once, so notifications and the workbench hook stream reconnect every 3 s.
  - The agent stream reconnects about every 1.2 s, and each reconnect reloads sessions, snapshot and events.
  - A live backend keeps these streams open.
  - The agent reconnect has no backoff. If a live server closed the stream repeatedly, the client would reconnect at that rate (existing behavior, unchanged).
- **Duplicate requests on first load** (existing behavior, identical in Phase 12, data layer untouched):
  - `/api/me` and `/api/tasks-summary` ×2 on /dashboard.
  - `/api/pentest/devices` ×2 on /pentest and /new-audit (page plus sidebar).
  - `/api/pentest/sessions/40` ×3 on the session page.
  - `/api/models/catalog` and `/api/models/providers` ×3, and sessions and snapshot ×2 on /agent.
- **Timestamps:** `created_at` is optional in `types/pentest.ts`. Whether the live project list returns it is unverified, and the fixture's values are inferred.
- **Spacing literals:** the token lint does not cover spacing. About 500 px spacing values remain in the legacy pentest workbench (`workbench.css`, `v3.css` and inline styles in `features/pentest/workbench/*`). Moving them onto the 8 px token scale is a separate migration.

## Phase 12 — Composition finish

Composition work on top of Phase 11, without touching tokens. Presentation only: routes, requests, permissions, task and report behavior are unchanged; the split preview stays the default report view.

### Added
- `FeatureBand variant="editorial"`: rules instead of a card, a 7 / 5 split with the facts as a definition list. Text facts render at body size, numbers at headline size.
- `ObjectCard compact`: tighter padding, with the open action in the title row and no footer bar.
- `RowActions` takes `triggerAttrs` and `menuAttrs`, so existing hooks keep their selectors.
- Fixture switch `FIXTURE_PROJECTS=n`, which trims the project list to capture the 0 / 1 / 2-project states.

### Changed
- `/company`: the lead project is an editorial band labelled 最近创建的公司项目 (最近创建的项目 when there is no company-level project) and is never called the current project. Its facts are apps, brands and source, with portfolio facts beside it.
  - Other projects are compact cards under "其他项目 · N".
  - With no projects, the page explains how to start in three steps, with one create action in the band.
  - With one project, the search, filter, sort and view controls are hidden. A note points to 候选发现.
  - With two projects, the next-steps tile stays.
  - When the list fails to load, the heading reads 项目列表 with no count.
- `/company/projects/:id`: header facts move into a context strip that the tab bar hangs beneath.
  - The report generator and history are steps ① 生成 and ② 历史与下载, joined by a rail.
  - The page scroller reserves the sticky tab bar's height as `scroll-padding-top`, so keyboard focus never lands under it.
  - Table headers no longer stick beneath the sticky tab bar.
- `/reports` split view: the preview sits on the second surface under "摘要预览 · 不含发现明细与证据". Its title is one step smaller than before, and 打开完整报告 is its one primary action, with the export menu beside it.
  - The list is one tab stop with roving focus. ↑ / ↓ / Home / End move the selection and the preview, Enter opens the full report, → moves into the preview, and Esc or ← return to the row. Checkboxes stay separate tab stops.
  - The footnote states these keys.
- `/agent`: the run-details pane remembers pinned or collapsed (`jz-view:agent-inspector`). From 1440 px it falls back to the drawer whenever pinning would leave the conversation narrower than 560 px, and the toggle's title says why.
- `/tasks`: the row overflow menu is now the shared `RowActions`, which the reports and workspace pages already use. The hooks `data-more-btn`, `data-more-menu`, `data-act-*`, `data-goto-session`, `data-ask-btn` and `data-artifacts-btn` are kept. Rows stay at comfortable density, since each row holds two lines and an action. Other tables are compact.
- Copy trimmed: the workspace no longer repeats where downloads are, and the preview states its scope once.

### Verified
- `tsc --noEmit` and `npm run build` pass after every commit.
- 14 routes at 1680 / 1440 / 1280 / 1024 / 760 in both themes: no overflow and no page errors. The request log is identical to the baseline (14 routes).
- Company, workspace, reports, tasks and agent in the empty, error, forbidden and slow variants at 1440 and 760: no overflow and no page errors.
- Focus under the sticky tab bar: Tab and Shift+Tab across all five workspace tabs at 1440, 1024 and 760 reach 171–272 controls and leave 0 occluded. A control run without the scroll padding finds 9 occluded, so the check does detect occlusion.
- Report keyboard path (arrows, Home/End, →, Tab, Esc, ←): the preview follows the selection with no new requests. Card/table preference survives a reload. Agent collapse survives a reload. The narrow-center fallback opens the drawer. Interactions send no write requests.
- Keyboard focus scan: 318 controls on the eight priority routes, each with a visible ring. Token lint stays at 19. Contrast: no failing text pair.
- Screenshots in `docs/screenshots/phase-12/`:
  - Every route at 1440 / 1024 / 760 in both themes.
  - The state variants of the changed routes.
  - `states/`: the 0 / 1 / 2-project index at three widths in both themes.
  - `interaction/`: report keyboard preview, focus clearing the sticky bar, agent collapse after reload, agent drawer fallback and the task row menu.

### Remaining gaps
- The project id is still a proxy for creation order, by decision. The list endpoint carries no timestamp the UI uses.
- The 0-project page ends after the start band. Nothing else exists to show until a project is created.
- The agent inspector's inner styling is unchanged. Only its placement and memory changed.

## Phase 11 — Composition and product identity

Bolder composition on the priority pages: one leading object or signal per page, secondary facts as quiet lists or fact rows instead of equal cards, master-detail where reading matters, grouped actions instead of repeated buttons. Presentation only: routes, requests, permissions, task and report behavior are unchanged.

### Added
- `components/ui/Composition.tsx`: `FeatureBand` (the page's primary object), `FactRow`, `SignalPanel` (question, large answer, breakdown), `StackedBar`, `MetricList`, `ActionMenu` (grouped exports and downloads), `RowActions` (one primary action plus overflow), `SplitView` (list and preview from 1280 px, drawer below), `CoverageDisclosure`, `ChartPanel` (a chart titled by its question, with an empty state), `ViewToggle` with `useViewPreference` (per-viewer, wrapped localStorage), `useScrolledPast`.
- Token `--jz-text-headline` (24 px) for primary objects; Tailwind `text-headline`.

### Changed
- `/company`: the most recently created company-level project leads in a feature band with portfolio facts beside it (replacing four metric cards); the other projects follow with a card / table toggle; a short list ends with a next-steps tile instead of open canvas.
- `/company/projects/:id`: project facts move into the header summary (per-tab metric rows removed); the tab bar sticks and, once the header scrolls away, carries the project name and batch run. Reports: generator and history share one surface, the chapter list is a disclosure, DOCX / PDF per row become one download menu, a report being generated is highlighted. Overview: completion as the leading signal with a stacked state bar, a next-steps list from the project's data, recent reports and runs side by side. Runs: totals as a fact row.
- `/dashboard`: asymmetric 12-column grid. The queue is the leading signal (8 columns) with the running tasks folded in and the failed-task link as its action; assets, findings, models and open sessions are a metric list (4 columns). The domain chart is titled by its question and shows an empty state instead of an all-zero radar; the event feed is bounded to the chart's height.
- `/reports`: new default preview view: compact list on the left, readable preview on the right (sticky) from 1280 px, drawer below. The preview uses the hub's existing aggregates only. Card and table views keep the full width; per-row summary CSV moves into a row menu. KPI cards become one fact strip.
- `/tasks`: metrics and the running-tasks panel become one queue surface; one primary action per row at every width, the rest in the row menu.
- `/discovery`: counts and the processing chain on one surface; evidence table beside a coverage disclosure of matching height; rows open a detail drawer; unresolved candidates per app run full width; stale notice on a failed refresh with data.
- `/agent`: from 1440 px the run details are a pinned third pane (collapsible); below that the existing drawer.
- `/system`: the model tab opens with a health surface (providers, active model, keys, routing coverage, probe results, one row per provider) before the settings; feedback has its own heading.
- `DataTable`, `Pagination`, `BulkBar`: 20 px edge padding, matching `Panel`, so forms and tables share one rhythm.

### Verified
- `tsc --noEmit` and `npm run build` pass after every commit.
- 14 routes at 1680 / 1440 / 1280 / 1024 / 760 in both themes: no overflow, no page errors; request log identical to the baseline (14 routes).
- The eight changed routes in the empty, error, forbidden and slow variants at 1440 and 760: no overflow, no page errors. The dashboard no longer reads "no failed tasks" when the queue request failed.
- Interactions (overview tab, sticky header on scroll, download menu, report preview drawer, discovery detail drawer, task row menu, agent inspector collapse, company table view) send no write requests.
- Keyboard: tabbing the eight changed routes reaches 321 distinct controls, each with a visible focus ring.
- Token lint unchanged at 19; contrast check: no failing text pair.
- Screenshots: `docs/screenshots/phase-11/` (each changed route at 1440 / 1024 / 760 in both themes, state variants, interaction states).

### Remaining gaps
- Projects carry no timestamps, so "current project" means the most recently created company-level project (highest id).
- The report preview shows only hub aggregates (score, matrix, domains); findings and evidence stay in the full report.
- The agent inspector keeps its own inner styling; only its placement changed.

## Phase 10 — Visual elevation

A second, presentation-only pass requested after phase 9 ("a large visible upgrade"). Changes go through tokens, shared primitives and the shell, so every route picks them up; no request, route, storage key or `data-*` hook changes.

### Changed
- Tokens (`design/tokens.css`): warm neutral canvas, surface-2 and border (`246 245 242`, `240 239 235`, `228 226 220`); new `--jz-rail` for the navigation rail; new `--jz-shadow-raised` for hover on interactive cards; new `--jz-header-tint` (two radial tints, brand 7–8% and teal 5%, within design-system.md §5). Page title 28 → 30 px, metric value 30 → 32 px.
- `Page` paints the header tint behind the top of every page. `PageHeader` gains a `summary` row (status facts under a rule) and a brand-colored eyebrow.
- `Panel` and `ObjectCard` use the 16 px panel radius and 20 px padding, footers sit on a quiet surface, panel title icons take the brand color, object cards lift on hover.
- `Metric`: a tone rail on the left (teal / amber / red, always with the text value), an optional icon tile, the hint below a rule, and an optional whole-card click with keyboard activation.
- `Tabs`: active tab in ink with a brand underline; counts in pills. Table header uses the meta size on a lighter surface.
- Shell: the rail sits one step below the canvas; the active item is a raised surface with a brand indicator and brand icon; device and queue cards are surfaces. The top bar shares the canvas color.
- `/dashboard`: date and user in the eyebrow; a summary row with running, queued, failed (links to the failed task filter) and critical counts, all from data the page already loads; metric icons; success-rate tone follows the rate (≥ 90% teal, below amber).

### Verified
- `tsc --noEmit` and `npm run build` pass.
- 14 routes at 1680 / 1440 / 1280 / 1024 / 760 / 390 in both themes: no overflow, no page errors; request log identical to baseline; shell checks pass; phase 8 and 9 interaction scripts pass with no write requests; 546 focusable controls with a visible focus ring.
- Contrast check: no failing text pair on the new surfaces. Token lint unchanged at 19.
- Screenshots: `docs/screenshots/phase-10/`.

### Remaining gaps
- Fixture data is thin, so some index pages (for example `/company` with three projects) end with open canvas below the grid.

## Phase 9 — Responsive and accessibility

### Changed
- `/ai-assistant`: below 1024 px the session list is a drawer opened from a new button in the conversation bar (`data-ai-session-toggle`); choosing a session closes it. The citation source pane and the inspector were hidden below 1024 px, so opening them did nothing; they are now drawers there and stay columns from 1024 px. The conversation bar wraps instead of breaking words.
- `/agent`: the run-details drawer is capped at the viewport width; the composer's model select no longer pushes the send button out of the card on phones (the shortcut hint is hidden below 761 px). The session sidebar filters are two labeled rows (group and sort, then filters) with pressed states instead of one wrapping row.
- `/skills`: the candidate review header is a `Panel` with the pre-review count and action, and a counted `SegmentedControl` for the pre-review filter. Loading, empty and filtered-empty states added; candidate checkboxes have labels. The fifth metric spans the row on phones.
- Keyboard: a shared `pressable()` helper (`components/ui/pressable.ts`) gives clickable rows and cards one Tab stop and Enter / Space activation. Applied to agent and assistant session items, assistant group headers (with `aria-expanded`), evidence and finding rows, API tree rows, Burp flow rows, environment chips and the AI sidebar cards. Session hover actions also show on keyboard focus.
- Session workbench and attack graph (`features/pentest`, `features/attack-canvas`): node, severity, step and method colors read the `jz` tokens instead of hex and `rgb()` literals; the old `accent-*` classes are gone; the glow box shadow, drop-shadow edge filter, gradient approval orb, blurred minimap and the pulsing running dots are removed. Exported PNGs use the canvas token as background.
- `/skills` review: rejecting a single candidate now asks for confirmation first (same outcome text as bulk reject); the request is unchanged and is sent only on confirm. Approving a single candidate stays one click.
- Motion: skeleton pulse is `motion-safe` only; indeterminate progress bars stay (system feedback) and the global reduced-motion rule still applies.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 928.1 kB, CSS 154.0 kB.
- 14 routes at 1680 / 1440 / 1024 / 760 / 390 in both themes: no overflow, no page errors; request log identical to baseline; shell checks pass.
- `/agent`, `/ai-assistant`, `/skills` and the session workbench in the empty, error, forbidden and slow variants at 1440 and 390.
- Drawer script at 390, 760, 1024 (dark) and 1440: assistant session drawer opens and closes, inspector opens at every width, agent run details fit. Phase 8 interactions re-run. No write requests.
- Keyboard pass: tabbing through all 14 routes reaches 545 distinct controls, each with a visible focus ring. A scan for pointer-only clickable elements on the rendered routes finds none.
- Token lint 19 (from 120). The remainder: task numbers in prompt text read as hex (6), chart font sizes passed to ECharts (6), `@font-face` and `box-shadow: none` declarations (7). Contrast check: no failing pair.

### Remaining gaps
- The agent and assistant composers keep their own markup; their model select stretches wide on desktop.
- ECharts label sizes are numbers in JS; there is no token accessor for font sizes yet.
- Fixtures are inferred; the attack graph and candidate bodies are thin in screenshots because the fixtures carry little data.

## Phase 8 — Knowledge, agent and system

### Changed
- `/dashboard` (`features/dashboard/DashboardPage.tsx`): `Page`, `PageHeader` (node strip in the header meta, refresh and new-assessment actions), four `Metric`s, then the domain radar (2/3) beside the session event feed (1/3), running tasks, and recent assessments in a `DataTable`. Chart colors come from `tokenColor()` and re-read on theme change (`useThemeVersion`). The summary loads are one `loadSummary` callback with the same requests and order; a failed summary refresh shows a stale notice. The radar mode is a `SegmentedControl` instead of the model chip.
- `/system` (`features/system/SystemPage.tsx`): rebuilt on `Tabs`, `Panel`, `DataTable`, `Pagination`, `Field`, `Select`, `Drawer`, `Dialog` and `ConfirmDialog`. Users: create in a drawer, password reset in a dialog, disabling an account and deleting an account both confirm first (delete had no confirmation before). Audit log: filters, presets, paginated table, detail drawer. API tokens and webhooks keep their probes. Non-admin roles see `PermissionState`.
- Model console (`features/system/ModelConsole.tsx`): routing rules as four `Select` fields, provider cards with endpoint, model, reasoning level and masked key, probe results inline, provider config in a `Drawer` with `Field`s and a masked key toggle. Deleting a provider confirms first (it did not before). Load failure shows an alert with retry instead of an empty list.
- `/skills` (`features/skills/SkillsPage.tsx`, `SkillCard.tsx`, `CandidateCard.tsx`, `skillsShared.tsx`): `PageHeader` with the manual-operations toggle and rescan, five clickable metrics that filter the list, `Tabs` for library and candidate review. Cards use `StatusBadge`, `Tag`, `Button`, `IconButton`; categories are a quiet dot instead of tinted fills. Deleting a skill and bulk approve / reject use `ConfirmDialog` instead of `window.confirm` (built-in skills still get the stronger warning, now in one dialog). The knowledge relation panel is a `Panel` with a search form; its graph colors come from tokens.
- `/agent` and `/ai-assistant`: suggestion tiles are flat token fills; the old `accent-*` classes, the empty ambient layer and the inline hex colors in the usage sparkline are gone. Layout and behavior are unchanged; both stay for phase 9 responsive work.
- Copy: neutral wording for headings, metric hints and confirmations; stored values, request bodies and export columns are unchanged.

### Fixed
- The skill-pack import dialog closed the wrong dialog on cancel (`setImpOpen` instead of `setPackImpOpen`), so it could not be dismissed.
- The skill source drawer crashed the page when the response had no `content`; it now shows an empty state.
- The dashboard printed `undefined` in the model hint and the event feed description when a field was missing.
- A failed skill list load showed a bare red line with no retry and metrics stuck on “…”; it now shows the error state with retry and “—” in the metrics. Loading, empty and no-match states use the shared skeleton and `EmptyState` (one no-match message instead of two).

### Removed
- Gradient tiles and the category gradient bar on skill cards, pulsing status dots in the agent and assistant views, the amber ping on the review tab, emoji in the feedback stats and skill paths.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 925.6 kB, CSS 153.7 kB.
- 14 routes at five widths and both themes: no overflow, no page errors; request log identical to baseline; shell checks pass.
- Phase 8 routes captured in the empty, error, forbidden and slow variants. Interactions at 1440, 1024, 760 and dark 1440: metric filters, manual operations, skill delete confirm (cancel sends nothing), source drawer, candidate review with bulk reject confirm, provider delete confirm, provider config drawer, user delete confirm, dashboard refresh. No write requests were sent by cancelled dialogs.
- Token lint 120 (from 178); the remaining phase 8 hits are task numbers in prompt text (`#100367`). Contrast check: no failing pair.

### Remaining gaps
- The candidate review panel keeps its older inner header (counts as chips, pre-review filter buttons); the cards inside are migrated.
- `/agent` and `/ai-assistant` keep their own three-column layouts; the session sidebar filter chips wrap awkwardly at 1440 (phase 9).
- `src/features/pentest/**` still uses `accent-*` classes and pulsing dots; that route was not in this phase.
- Approve and reject on a single candidate card are still one click, as before, although the decision cannot be undone. Adding a confirmation is a behavior question for review.
- Fixtures for skills, candidates, providers and the new source endpoint are inferred; candidate fixtures have no `content`, so card bodies render empty in screenshots.

## Phase 7 — Tasks and discovery

### Changed
- `/tasks` (`features/tasks/TaskCenterPage.tsx`): rebuilt on `Page`, `PageHeader` (title from `layout/navigation.ts`), `MetricGrid`, `Panel`, `SearchField`, `Select`, `Checkbox`, `Tabs`, `DataTable`, `BulkBar`, `Pagination`, `Popover`, `Dialog`, `ConfirmDialog` and `Drawer`. Order on the page: header actions, four metrics (concurrency, running, queued, online devices), then the list, then running tasks, linked sessions and the batch-unpack summary. Columns follow `docs/page-specs.md`: task, target, status, duration, result, owner, actions.
- Task detail is a drawer with fields, progress log, failure reason, unpack result and the artifact and retry actions. It opens from the row menu for every status (before: failed, running and queued only).
- Status cell: one badge per state (完成 / 部分完成 / 失败 / 运行中 / 排队) with the reason underneath. The decision of what counts as partially complete (`honestDone`, `outcomeProbe`, `bizOf`) moved unchanged into `features/tasks/taskParts.tsx` together with the formatters and the live-progress cell.
- Row actions: 会话, 重试, 报告 and 产物 inline from 1440 px; between 1280 and 1440 px only the first stays inline and the rest sit in the row menu with the same `data-*` hooks; below 1280 px the list is record cards. The inline delete button and the menu delete are one menu item; single delete uses `ConfirmDialog` instead of `window.confirm`.
- Bulk bar: rerun, export (CSV / JSON in one menu), compare, delete. The three confirmations are dialogs that list the affected tasks and say what cannot be undone; the result line reports succeeded and skipped counts.
- A failed refresh keeps the last list and shows a stale notice with a refresh action; a failed first load shows the error state with retry. Before, both rendered as an empty list. A refresh button is added to the header (same `loadAll` requests).
- `ArtifactsModal`, `RerunTaskModal`: on `Dialog`, `SearchField`, `Field`, `Select`, `IconButton`, `EmptyState`, `ErrorState`. Traversal limits, preview rules, download endpoints and the rerun payload are untouched.
- `/discovery` (`features/discovery/DiscoveryPage.tsx`): metrics, pipeline steps as an ordered list with a text state per step, confirmed evidence in a `DataTable` with a counted source filter, provenance and unresolved panels. The fixed "2 / 15 APK" text is replaced by `apk_with_confirmed / tasks_total` from the response. Loading, empty, error (with retry) states.
- `/new-audit` (`NewAuditPage.tsx`, `NewAuditSections.tsx`, `NewAuditDock.tsx`): three numbered panels on the left (asset, scope and mode, device), pre-check result and the create panel on the right. Readiness steps in the header link to their panel and scroll the page's own scroller. Channels, presets, baselines and devices are selectable cards with radio semantics; inputs use `Field`, `Input`, `Textarea`, `Checkbox`, `Radio`. The create button states what is still missing.
- Batch unpack from a directory asks through `ConfirmDialog` instead of `window.confirm`; the request is the same.
- Copy: 评估 for audit, 加固 for shell, 负责人 for operator, plain statements of what a number counts. Stored values (mode and baseline names, `authorized` strings, `app_name` fallback, export column names) are unchanged.
- `components/ui`: `DataTable` gains `selectAttrs` (hooks for its checkboxes) and `layout="cards"`; `PipelineStepper` steps are narrower so five phases fit the create panel.

### Removed
- `ScanLine` icon and emoji in the pre-check panel, the dashed "raster" scan placeholder, pulsing dots on running rows and session cards, the inline hex colors of the result bar (now severity tokens), the permanent "/api/download 未接通" note in the artifacts footer, the visible `status=` chip next to the status tabs (kept for assistive tech and existing hooks).

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 934.5 kB, CSS 159.5 kB.
- 14 routes at five widths: no overflow, no error boundary; request log identical to baseline; shell checks pass.
- `/tasks`, `/discovery`, `/new-audit` captured in the empty, error, forbidden and slow variants. Interactions at 1440, 1024, 760, 390 and dark 1440: status filter, no match, row menu, detail drawer, rerun dialog, selection and the three confirmations, a real bulk rerun (two `POST /api/tasks`), export menu, artifacts with preview, `/` focusing search, `?focus=` deep link; discovery source filter; new assessment by server path through pre-check to an enabled create button.
- The bulk rerun and the pre-check send the same bodies as before (`authorized: '任务中心重跑'`, `{ apk_path }`).
- Token lint 178 (from 184): the task and new-assessment files have no findings left. Contrast check: no failing pair.

### Remaining gaps
- No visible stale indicator on `/discovery` and `/new-audit`: both load once and have no refresh failure path other than the error state.
- The disabled 会话 button on finished tasks without a linked session is kept because the page has always shown it; it can never be enabled from this page.
- Running tasks appear twice (in the list and in the running panel below it), as before.
- `/tasks` loads up to 2000 rows and filters on the client, as before; there is no server paging contract to move to.
- The task, count, batch-summary, artifact and pre-check fixtures are inferred from what the pages read, not from an API contract.

## Phase 6 — Reports

### Changed
- `/reports` hub (`features/reports/ReportCenterPage.tsx`, `HubView.tsx`): rebuilt on `Page`, `PageHeader` (title from `layout/navigation.ts`), `MetricGrid`, `Panel`, `SearchField`, `SegmentedControl`, `Popover`, `ObjectCard`, `DataTable`, `BulkBar`, `Pagination` and `AsyncBoundary`. The two list requests, the per-task aggregation (three requests per task, four at a time), filtering, sorting, paging, selection, single and batch CSV export and the `?taskId=` / `?sid=&cmp=` deep links are unchanged. A failed task-list request now shows the error or permission state with retry (it rendered as "no tasks" before), and a deep link to a task is kept while the list is failing instead of being dropped.
- Report detail (`DetailView.tsx`): page header with back link, title, task id, package, task switcher, import and one export menu; section navigation on the left from 1024 px and as a sticky bar below; sections on the right. Section jumps scroll the page's own scroller and respect reduced motion.
- Exports are grouped in one menu, as `docs/page-specs.md` asks. The per-section copies (matrix CSV / JSON, PDF, summary PDF, evidence JSON, ZIP) are removed; each menu item keeps the `data-*` hook of the button it replaces next to its own. Items that need a session are disabled when the task has none. The handlers, endpoints and file names are the same.
- Sections (`MatrixSection`, `MasvsSection`, `VulnSection`, `ReportSection`, report files): each is a `Panel` with skeleton, empty, error and, for the matrix, stale states. The matrix is a semantic grid with search, a counted result filter, expandable rows and the shared pagination. Findings use severity badges, a counted state filter and labeled evidence blocks. The session report shows its key facts as a definition list with the source text below. A task without an active session says so once at the top.
- `ImportModal`, `ManualVulnModal`, `TaskSwitcher`: on `Dialog`, `Field`, `Input`, `Select`, `Textarea`, `Radio`, `SegmentedControl`, `Popover` and `SearchField`. Parsing, validation, merge strategies and the local-only merge are untouched. The manual form marks the missing title on the field as well as in the toast.
- Print view: a labeled dialog with focus trap and Escape; `report-print-container` and the paper tokens are unchanged.
- Copy: 发现 for findings, 评估 for audit, matrix verdicts named by what they mean (匿名可访问 / 登录后可见 / 已拒绝 / 未判定) instead of by color, plain statements of what a number counts. The pulsing icon on anonymous-reachable rows is now a static icon.
- `components/ui`: `Pagination` gains an optional jump-to-page input, a custom summary and `data-*` hooks for its inner controls; its page-size select is sized by a wrapper. `Page` makes its scroller the containing block, so visually hidden text inside a page can no longer extend the document (it let the whole shell scroll by a few hundred pixels on long pages).

### Removed
- The local `Menu` popover in `features/reports/shared.tsx`, the floating aggregation pill (now a status line in the page header), the always-empty "AI 因果链" block and the permanently disabled "生成修复补丁" button in a finding.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 961.9 kB, CSS 161.7 kB.
- 14 routes at five widths: no overflow, no error boundary; request log identical to baseline; shell checks pass.
- `/reports` captured in the empty, error, forbidden and slow variants. Hub (cards, table, selection, no match), detail sections, export menu, task switcher, import with a parsed CSV, manual form validation, print view, a task without a session, a failed list on a deep link with retry, and the `?sid=&cmp=` deep link exercised at 1440, 1024, 760 and 390 px in light and 1440 px in dark, with no overflow and no request other than GET.
- Token lint 184, unchanged: the report files had no findings left; the rest belongs to phases 7 to 9. Contrast check: no failing pair.

### Remaining gaps
- Exported files and the print view are composed by `reportIo.ts`, which is not edited. Their text still uses the earlier wording (审计, 越权暴露, 红 / 黄 / 绿 / 灰), so a file and the screen name the same verdict differently.
- The detail header is no longer sticky; the section navigation is. Export and back are one scroll away on long reports.
- In the hub table, 加固 and the state counts show from 1280 px, 主要域 and 更新 from 1600 px; all of them remain in the cards and in the CSV. The page-size choice is a select and sort is a menu; `data-hub-pagesize` moved to the select's options.
- Session comparison cannot tell "no differences" from a failed comparison request (both arrive as an empty list); the message says so.
- `ReportDiffPanel` (shared with the workbench) is embedded as is.
- The report fixtures (`summary`, `auth_matrix`, `vulns`, report text) are inferred from what the page reads, not from an API contract.

## Phase 5 — Project workspace

### Changed
- `/company/projects/:pid` (`features/company/CompanyProjectDetailPage.tsx`): rebuilt on `Page`, `PageHeader` (back link, id, type, company, brands), `Tabs`, `MetricGrid`, `Panel`, `DataTable`, `Pagination`, `BulkBar`, `Field`, `Checkbox`. All five tabs keep their requests, payloads, filters, page sizes and the default tab. Tables become record cards below 900 px (two of them scrolled sideways at a fixed 900 px width before). Candidate selection uses the table's selection and a bulk bar. "批量执行" now asks for confirmation before it queues the whole inventory. A first-load failure shows the error or permission state with retry; a failed refresh keeps the data and shows a stale notice. The "快捷入口" card is removed because it repeated the tabs.
- `/pentest/project/:pid` (`features/pentest/PentestPages.tsx`): sessions as a `DataTable` under a page header with a back link; states for loading, empty, error and permission. Closing an idle session uses `ConfirmDialog` instead of `window.confirm`; the DELETE and the reload after it are the same calls. The row no longer nests a button inside a button.
- `NewProjectWizard`: drawer shell on surface with the dialog shadow, a real heading that names the mode (new project or new session), close as an icon button, focus trap and Escape. Steps, polling and the create payload are untouched.
- Session workbench (`features/pentest/workbench/*`): the 31 local `--wb-*` aliases are gone; `workbench.css` and 12 views read the `jz` tokens directly. Inline font sizes and radii in the views use the type and radius tokens. Two references to variables that were never defined (`--wb-text-1`, `--wb-text-2`) now resolve to ink and ink-2. Layout and behavior are unchanged; the session screenshot is pixel-identical to phase 3 at 1440 px.
- `layout/EnvBar.tsx`: pills share the quiet outline style, state is carried by text color and label; the tone key `cyan` is renamed `brand`. Measuring and folding logic is untouched.
- `features/pentest/SessionOverview.tsx`: 40 classes on an `accent-*` palette that no longer exists (so they rendered without color) now use the token colors.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 974.3 kB, CSS 161.4 kB.
- 14 routes at five widths: no overflow, no error boundary; request log identical to baseline; shell checks pass.
- Both workspace routes captured in the empty, error, forbidden and slow variants; all five company tabs captured at 1440 and 760 px in light and at 1440 px in dark with no overflow; bulk bar, run confirmation, close-session confirmation and the wizard exercised. Neither confirmation sends a request before it is confirmed.
- Token lint 184 (was 833). Contrast check: no failing pair.

### Remaining gaps
- The inside of `NewProjectWizard` (asset picker, strategy step, device step) is still on phase 1 styling and its own controls.
- The session workbench keeps its own layout, class names and density by design; it was restyled through tokens only. `SessionWorkspace.tsx`, `AiAssistantPage.tsx` and two v3 files still contain 22 `accent-*` classes that emit no CSS; they are cleaned up in phases 8 and 9.
- Neither workspace page polls, so progress of a running batch appears only after "刷新". Adding polling would add requests, so it is left as is.
- The company project tabs are not in the URL (they were not before either), so a reload returns to the reports tab.

## Phase 4 — Project index

### Changed
- `/company` (`features/company/CompanyProjectsPage.tsx`): rebuilt on `Page`, `PageHeader`, `MetricGrid`, `SearchField`, `SegmentedControl`, `ObjectCard`, `AsyncBoundary` and `Dialog`. Three card columns from 1280 px, two from 900 px, one below. The list request, the create request and its payload, filtering and sorting are unchanged. A first-load failure now shows the error or permission state with retry; a failed refresh keeps the list and shows a stale notice; create errors show inside the dialog.
- `/pentest` (`features/pentest/PentestProjectsPage.tsx`, `ProjectCard.tsx`): same page frame; actions moved to the header; metrics use `Metric`; filters are one chip style with pressed state; card and table views share the packer badge, progress bar and finding summary. The table view is a `DataTable` and becomes record cards below 900 px (it scrolled sideways before). Export and card menus use `Popover`. All five requests, the derived counts, filter persistence keys, export columns, import flow, wizard wiring and every `data-probe` / `data-*` hook are kept.
- Copy: neutral names (评估项目, 工作台, 会话, 加固, 发现), no emoji as status, status values shown through the state dictionary, stage names 加固识别 / 静态分析 / 接口梳理 / 动态验证 / 报告归档. Tooltips state what a number counts instead of internal change notes.
- A project load failure is now visible on `/pentest` (it rendered as "no projects" before); metrics show a dash in that case.

### Removed
- `ProjectCompactRow` (replaced by table columns), the project initial avatar, the per-page input and button class strings.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 976.6 kB, CSS 161.2 kB.
- 14 routes at five widths: no overflow, no error boundary; request log identical to baseline; shell checks pass.
- `/pentest` and `/company` captured in the empty, error, forbidden and slow variants, plus table view and create dialog; table view has 3 rows as a table at 1440 px and as cards at 760 px; card menu, filtered-empty state and required-field validation exercised.
- Token lint 833 (was 835). Contrast check: no failing pair.

### Remaining gaps
- The pager under the project grid is still the older `DataToolbar` pager, kept for its probes; it moves to `Pagination` with the tasks page in phase 7.
- `NewProjectWizard` and `UniversalImportModal` are opened from this page and are still on phase 1 styling; the wizard is restyled with the project workspace in phase 5.
- `/pentest` has no refresh action and no stale state because the page loads once; adding a reload would add requests, so it is left as is.
- The create dialog keeps the prefilled brand value `TECNO,Infinix,itel` because it is part of the posted payload when left untouched.

## Phase 3 — Shell

### Changed
- Layout (`app/src/app/App.tsx`): the rail runs the full height on the left and the top bar sits over the page column. Routes, the route table, the session wiring, the notification stream connect / disconnect and the build-version check are untouched. Added a skip link and a `main` landmark; the lazy-route and session-check fallbacks are skeletons.
- Rail (`layout/Sidebar.tsx`): 232 px expanded, 68 px collapsed, quiet right border, active item on `brand-soft`. Starts collapsed between 761 and 1023 px, and is a focus-trapped drawer at 760 px and below, opened from the top bar and closed by Escape, the backdrop or a navigation. Device and queue cards keep their data sources, polling and `data-*` hooks; collapsed, they stay reachable as icon buttons.
- Top bar (`layout/TopBar.tsx`): 52 px, surface with a bottom border (no blur, no shadow). Context pills share one outline style; the account menu uses `Popover` and `MenuItem`; icon controls use `IconButton` with names.
- Navigation names come from one list (`layout/navigation.ts`) used by the rail, the breadcrumb and the command palette: 新建评估, 公司项目, 评估项目, 任务, 概览, 报告, 发现, 知识, Agent, 系统; groups 工作区 and 分析. Route paths are unchanged. The breadcrumb now names `/company` and `/discovery` (it fell back to the dashboard name before).
- Notifications (`layout/NotificationBell.tsx`): panel and arrival cards on surface with a border; unread count and unread dots use the brand color, red only for failed items; read items are no longer dimmed by opacity; empty states state the cause; a full-width sheet on mobile. Store calls, deep links and local "clear view" behave as before.
- Device popover (`layout/DeviceFridaFlyout.tsx`): opens below the top bar pill and above the rail card (the top bar one opened off-screen before); focus trap and Escape.
- Command palette (`components/CmdPalette.tsx`): same shortcut and local matching; arrow keys and Enter, listbox semantics, every route listed.
- Sign-in (`app/LoginGate.tsx`): two columns from 1024 px, one below; labelled fields in a form, error as an alert. The login call is unchanged.
- Theme (`theme/ThemeContext.tsx`, `app/index.html`): the first visit follows the system preference and keeps following it; the stored choice under `apksec-theme` wins; only the toggle writes it. Before, the default was dark and it was stored on load.
- `features/agent/components_agent/AgentWorkspace.tsx`: three fixed offsets that assumed a 48 px top bar and a 56 px rail now use the shell tokens.
- Document title is "惊蛰 Jingzhe Workspace".

### Added
- `scripts/capture-shell.mjs`: overlay screenshots and interaction checks for the shell.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 979.6 kB, CSS 162.8 kB.
- 14 routes at 760 / 1024 / 1280 / 1440 / 1680: no overflow, no error boundary; request log identical to baseline.
- Shell checks: rail 232 / 68 px and top bar 52 px measured; drawer opens, traps focus, closes on Escape and on navigation; rail collapsed at 900 px and expands; both device popovers stay in the viewport; palette navigates by keyboard; skip link is the first tab stop and the next 14 stops show the 2 px ring; theme follows the system with no stored choice, stored choice wins, toggle stores.
- Contrast check: no failing text pair.

### Remaining gaps
- Sign-out exists in the rail footer and in the account menu, and system settings as an icon and as a menu item. `docs/page-matrix.md` lists each of them, so they are kept; one of each pair should go.
- Command palette has no recents, and the top bar has no visible entry to it.
- Session-expired handling is whatever the auth store does; the sign-in page shows no separate "session expired" message.
- `EnvBar` and `AiSidebar` (the latter is switched off in code) belong to the session workspace and are restyled in phase 5.
- Page content inside the shell is not migrated yet, so page titles still differ from the navigation names.
- Token lint unchanged at 835; the shell files had no violations left after phase 1.

## Phase 2 — Shared primitives

### Added (`app/src/components/ui`)
- Actions: `Button` (primary, secondary, ghost, danger, danger-solid; 32 / 36 / 40 px; loading), `IconButton` (label required).
- Forms: `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `SearchField`.
- Navigation: `Tabs` (underline, counts, arrow keys), `SegmentedControl`.
- Layout and surfaces: `Page` (full width, 24 / 16 / 12 px padding, 1680 px max), `PageHeader`, `Section`, `Panel`, `Metric`, `MetricGrid`, `ObjectCard`.
- Data: `DataTable` (36 px header, 44 / 52 px rows, selection, record cards below 900 px), `Pagination`, `BulkBar`.
- Status: `StatusBadge` with dot + label and a `status` prop backed by `stateDictionary.ts`; `SeverityBadge`, `Tag`.
- Overlays: `Dialog` (focus trap, Escape, focus restore, mobile sheet), `ConfirmDialog` (not dismissible by backdrop or Escape), `Popover`, `MenuItem`, `Tooltip`.
- States: `InlineAlert`, `EmptyState` (cause, action, shortcut), `ErrorState`, `PermissionState`, `StaleNotice`, `AsyncBoundary`; skeleton layouts `cards` and `metrics`.
- Helpers: `tokens.ts` (token colors for chart and canvas libraries), `useMediaQuery.ts`, design breakpoints `tablet` / `table` / `desktop` / `wide` in the Tailwind config.
- Dev-only gallery `app/dev/ui-kit.html` (served by `vite dev`, absent from the production build) and `scripts/capture-kit.mjs`.

### Changed
- `Modal` and `UnifiedModal` delegate to `Dialog`; `Drawer` gains focus trap, Escape, footer and mobile full width. Props are unchanged.
- `Button` default height is 36 px (was about 28 px). Existing `subtle` maps to `secondary`; `ghost` is transparent until hover.
- `StatusBadge` and `Badge` keep their legacy tones; mono and bold are dropped from both.
- One preset label in `EmptyStatePlaceholder` reworded to neutral language.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 970.4 kB, CSS 160.3 kB.
- Gallery: no overflow at 1440 / 1024 / 760 in both themes; table renders as cards below 900 px; dialog, confirm and drawer move focus in and trap it; Escape closes dialog and drawer and does not close the confirm; 44 tab stops all show the 2 px focus ring.
- App pages: no overflow on 14 routes at five widths; request log identical to baseline.

### Remaining gaps
- No page uses the new primitives yet except through the reworked `Button`, `Modal`, `Drawer`, `Badge`, `StatusBadge`, `Skeleton`. Pages adopt them in phases 3 to 8.
- `DataToolbar`, `SearchableTaskCombobox`, `ModelSelectorChip`, `PipelineStepper`, `UniversalImportExportModal` and both toast systems are restyled by the phase 1 codemod only; they move onto the form primitives with their pages.
- Token lint unchanged at 835.

## Phase 1 — Tokens and typography

### Changed
- `design/tokens.css` is now the single source for color, type scale, radii, shadows, spacing, layout
  sizes, motion and focus. Added: `border-strong`, `on-brand`, `on-red`, `orange`, `teal-ink`,
  `amber-ink`, `scrim`, severity (`sev-*`), type scale (`text-*` / `leading-*`), weights, spacing,
  shell and control sizes, motion, focus, print colors.
- Dark tokens are scoped to `html.dark` (was `.dark`) so React Flow's own `dark` container class cannot
  capture them.
- `--jz-muted` light value changed from `107 114 128` to `97 104 118`: the original is 4.47:1 on the
  canvas, below AA. Teal and amber are below 4.5:1 as text on light surfaces, so text utilities use the
  new `teal-ink` / `amber-ink`; fills and status dots keep the original hues.
- Tailwind theme replaces (not extends) colors, font sizes, weights, radii and shadows with token-backed
  values. A class outside the token set now produces no CSS.
- Global stylesheet rewritten on tokens; the old `--c-*` variables, `neon`, `vuln`, glow shadow,
  breathing, scan-line, status-glow and ambient-gradient rules are deleted. Press-scale on buttons removed.
  Focus ring is 2px brand with 2px offset. Reduced motion is honored globally.
- Fonts: Instrument Sans, Inter and IBM Plex Mono are self-hosted (Latin subsets, 108 kB total).
  Chinese text uses the system CJK stack from the tokens.
- Class codemod (`app/scripts/codemod-tokens.mjs`) over 98 source files: legacy color, size, radius,
  shadow and weight classes mapped to token classes; decorative gradients flattened; letter-spacing
  utilities removed; text colors no longer carry alpha.
- Session workspace stylesheets (`v3.css`, `workbench.css`) now read from the tokens in both themes.
- `index.html`: inline hex background removed; stored theme applied before first paint.

### Added (dev-only, not bundled)
- `app/scripts/capture.mjs` + `fixtures/` (screenshots, overflow check, request log on fixture data),
  `check-tokens.mjs` (token lint), `check-contrast.mjs`, `check-requests.mjs`, `codemod-tokens.mjs`.

### Verified
- `tsc --noEmit` and `npm run build` pass. Main chunk 963.7 kB (baseline 977.2 kB), CSS 156.0 kB (169.8 kB).
- No horizontal overflow on 14 routes at 760 / 1024 / 1280 / 1440 / 1680 (fixture data).
- Request log per route identical to the baseline; API paths, `data-*` hooks, storage keys and route
  paths in source are unchanged (1,366 signatures compared).
- Contrast: every text token is at least 4.5:1 on canvas, surface, surface-2 and brand-soft in both themes.
- Token lint: 9,770 findings before, 835 after.

### Remaining gaps
- 835 lint findings: 604 are the local `--wb-*` aliases in the session workbench (now pointing at jz
  tokens; rename in phase 5); 141 hex and 12 rgb literals are chart, graph and canvas colors set in JS
  (dashboard, attack canvas, graph views, API tree); 38 inline font sizes in the workbench views.
- Layouts, navigation labels, page copy and per-page states are untouched until their phases.
- Screenshots use inferred fixture data, not a real backend.
