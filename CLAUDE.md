# Claude Instructions

You are working on the Jingzhe Workspace UI, a neutral design-system and frontend evolution repository.

## Read first

1. `docs/architecture.md`
2. `docs/page-matrix.md`
3. `docs/design-system.md`
4. `docs/page-specs.md`
5. `docs/version-roadmap.md`

## Absolute design rules

- Use the new `jz` token namespace only.
- Do not reintroduce the old theme prefix or old CSS variable names.
- Do not use neon cyan, glow shadows, scanlines, grid backgrounds, breathing animations, or sci-fi HUD motifs.
- Use neutral assessment language in all visible UI copy.
- Do not create a narrow centered page. Use the available workspace width with a sensible max width.
- Do not add hardcoded hex colors, font sizes, radii, or shadows outside `design/tokens.css`.
- Every data surface needs loading, empty, error, stale, and mobile states.
- Every destructive action needs confirmation and a reversible/clear outcome.
- Preserve all existing functionality while changing presentation.

## Visual target

V3 direction: **A+ · Living Instrument Panel** (`docs/v3-plan.md` §2, decided by cz on 2026-11-23).

```text
Living instrument panel: panes divided by hairlines, not floating cards
Alive through structure and state: run strip, stage stack, typed trace rows
Warm neutral canvas, six surface levels, no pure white or black
Graphite typography; mono with tabular figures for data
Indigo primary
Teal success/health
Amber attention
Orange is the identity of risk findings (severity = line width, text and a cap marker)
Red only for errors, blocked operations and destructive actions; never for a finding
Status is a glyph shape plus a word, never color alone, never dimmed by opacity
Quiet borders, layered surfaces, motion only for state changes
```

One looping animation is allowed: the opacity pulse on the active-stage dot of the run strip (`.jz-live-dot`),
at most one on screen and off under `prefers-reduced-motion`. The skeleton shimmer while a request is pending is
the only other loop. Everything else in "Absolute design rules" stands.

## Font stack

```text
Display / headings: Instrument Sans, Noto Sans SC
Body / UI: Inter, Noto Sans SC
Numeric / code: IBM Plex Mono
```

If a font is unavailable, fall back to the system stack declared in `design/tokens.css`; do not add a new display font without approval.

## Definition of done

- No horizontal overflow at 760 / 1024 / 1280 / 1440 / 1680.
- No page ends in a large unexplained empty gap.
- No duplicated action patterns for the same job.
- Keyboard focus visible on every interactive control.
- Contrast meets WCAG AA for text and controls.
- `tsc --noEmit` and production build pass.
- Screenshots included for every changed page at desktop and tablet widths.

## Work order

Do not redesign every page at once. Work in the order in `docs/version-roadmap.md`, and keep the app runnable after every phase.
