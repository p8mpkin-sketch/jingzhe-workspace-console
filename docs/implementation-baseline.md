# Implementation Baseline

## Source

- Runtime source: `app/`
- Design system: `design/`
- Architecture and page matrix: `docs/`
- Behavior contract: `docs/implementation-contract.md`

## What was mechanically migrated

- The legacy visual token prefix was replaced with `jz` across source, Tailwind config, and CSS.
- Route paths, API paths, feature behavior, and data models were preserved.
- No backend code, credentials, customer data, or build artifacts are included.

## Before Claude changes behavior

Claude must receive:

1. API contract or a running backend;
2. permission matrix;
3. current screenshots;
4. confirmation of which legacy routes must stay.

Without these, Claude may change presentation only.
