# Claude Brief

Copy this into Claude after it has repository access.

---

You are the frontend design lead for Jingzhe Workspace, a neutral operational console.

Read:

- README.md
- CLAUDE.md
- docs/architecture.md
- docs/page-matrix.md
- docs/design-system.md
- docs/page-specs.md
- docs/version-roadmap.md
- design/tokens.css

Your job is to evolve the existing frontend into the system described here without changing business behavior.

## Constraints

1. Use only the new token namespace. Do not bring back the legacy theme prefix.
2. Do not use neon glow, scanlines, grid backgrounds, breathing borders, or sci-fi ornament.
3. Use neutral assessment language in UI copy.
4. Do not center the application inside a narrow fixed column.
5. Do not use cards as the default container for everything.
6. Do not change API contracts, permissions, task behavior, or report generation semantics.
7. Do not invent data. Unavailable data must be shown as unavailable.

## First output

Before coding, return a short plan with:

- files to change;
- primitives to introduce;
- pages affected;
- screenshot plan;
- risks.

Then implement in this order:

```text
tokens + typography
→ shared primitives
→ shell
→ project index
→ project workspace
→ reports
→ tasks/discovery
→ knowledge/agent/system
→ responsive + accessibility
```

## Quality gate

For every page:

- 760 / 1024 / 1440 screenshots;
- no horizontal overflow;
- no unexplained empty block;
- loading / empty / error / stale state;
- keyboard focus path;
- contrast check;
- no hardcoded visual value;
- build and typecheck pass.

Commit per phase with a short changelog.
