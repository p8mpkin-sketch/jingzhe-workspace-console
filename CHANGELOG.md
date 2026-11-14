# Changelog

Design-system migration of `app/`. Presentation only: routes, API calls, permissions, task and report
behavior are unchanged. One entry per phase; each phase is one commit.

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
