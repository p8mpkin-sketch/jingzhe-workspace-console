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

```text
Editorial operations console
Warm neutral canvas
Graphite typography
Indigo primary
Teal success/health
Amber attention
Red only for blocking failures
Quiet borders, layered surfaces, restrained motion
```

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
