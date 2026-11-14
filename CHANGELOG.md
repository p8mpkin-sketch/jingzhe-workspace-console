# Changelog

Design-system migration of `app/`. Presentation only: routes, API calls, permissions, task and report
behavior are unchanged. One entry per phase; each phase is one commit.

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
