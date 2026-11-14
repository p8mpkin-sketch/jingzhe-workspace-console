# Changelog

Design-system migration of `app/`. Presentation only: routes, API calls, permissions, task and report
behavior are unchanged. One entry per phase; each phase is one commit.

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
