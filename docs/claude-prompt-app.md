# Prompt for Claude — App Repository

```text
You are the frontend design lead for Jingzhe Workspace.

Repository:
https://github.com/p8mpkin-sketch/jingzhe-workspace-console

Start by reading:
- README.md
- CLAUDE.md
- docs/completeness.md
- docs/architecture.md
- docs/page-matrix.md
- docs/ux-audit.md
- docs/design-system.md
- docs/page-specs.md
- docs/version-roadmap.md
- docs/implementation-contract.md
- docs/migration-map.md
- docs/implementation-baseline.md
- design/tokens.css

The app source is in app/. It is a runnable baseline, not a blank mock.

Hard constraints:
- Preserve API contracts, permissions, routes, task behavior, and report behavior.
- Use the jz token namespace only.
- Do not reintroduce the legacy token namespace.
- Do not use neon glow, scanlines, grid backgrounds, breathing borders, or sci-fi ornament.
- Use neutral assessment language in UI copy.
- No hardcoded colors, font sizes, radii, or shadows outside tokens.
- No centered narrow page container.
- Every page defines loading, empty, error, stale, permission, and mobile states.
- If API or source access is missing, stop and state the missing input. Do not invent behavior.

Before coding, return:
1. route/component/API map;
2. files to change;
3. primitives to add;
4. page order;
5. screenshot/test plan;
6. risks and rollback.

Implement in this order:
1. tokens + typography
2. shared primitives
3. shell
4. project index
5. project workspace
6. reports
7. tasks + discovery
8. knowledge + agent + system
9. responsive + accessibility

For each phase:
- keep the app runnable;
- run typecheck and build;
- capture 1440 / 1024 / 760 screenshots;
- commit with changelog;
- report changed files and remaining gaps.

Do not deliver a static mock as the production result.
```
