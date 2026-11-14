# Jingzhe Workspace App

Runnable frontend baseline for the Jingzhe Workspace UI evolution.

- `app/` — current frontend source, mechanically migrated to the neutral `jz` token namespace.
- `docs/` — architecture, page matrix, design system, migration contract, Claude brief.
- `design/` — neutral tokens and static visual direction.
- `CLAUDE.md` — implementation constraints for Claude.

## Run

```bash
cd app
npm install
npm run dev
```

Build:

```bash
cd app
npm run build
```

The backend API is not included. Grant Claude access to the API contract or a running environment before changing behavior.
