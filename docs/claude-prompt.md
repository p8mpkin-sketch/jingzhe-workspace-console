# Copy-Paste Prompt for Claude

```text
You are the frontend design lead for Jingzhe Workspace.

You have two inputs:

1. Design baseline:
   https://github.com/p8mpkin-sketch/jingzhe-workspace-ui
2. Current frontend source:
   [Claude must be given access to the production frontend repository or a sanitized branch]

Read the design baseline first:
- README.md
- CLAUDE.md
- docs/architecture.md
- docs/page-matrix.md
- docs/ux-audit.md
- docs/design-system.md
- docs/page-specs.md
- docs/version-roadmap.md
- docs/implementation-contract.md
- docs/migration-map.md
- design/tokens.css

Your task is to evolve the current frontend into this design system without changing business behavior.

Hard constraints:
- Preserve API contracts, permissions, routes, task behavior, and report behavior.
- Use the jz token namespace only.
- Do not reintroduce the old theme namespace or old visual vocabulary.
- Do not use neon glow, scanlines, grid backgrounds, breathing borders, or sci-fi ornament.
- Use neutral assessment language in UI copy.
- No hardcoded colors, font sizes, radii, or shadows outside tokens.
- No centered narrow page container.
- Every page defines loading, empty, error, stale, permission, and mobile states.

Before writing code, return:
1. Current route/component/API map.
2. Files you will change.
3. Shared primitives to introduce.
4. Page migration order.
5. Screenshot and test plan.
6. Risks and rollback plan.

Then implement in this order:
1. tokens + typography
2. shared primitives
3. shell
4. project index
5. project workspace
6. reports
7. tasks + discovery
8. knowledge + agent + system
9. responsive + accessibility

For every phase:
- keep the app runnable;
- run typecheck and production build;
- capture 1440 / 1024 / 760 screenshots;
- commit with a short changelog;
- report what changed and what remains.

Do not build a static mock and call it done. If source or API access is missing, stop and state the missing input instead of inventing behavior.
```
