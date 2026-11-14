# Changelog

Design-system migration of `app/`. Presentation only: routes, API calls, permissions, task and report
behavior are unchanged. One entry per phase; each phase is one commit.

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
