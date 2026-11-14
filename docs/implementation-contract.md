# Implementation Contract

## Source of truth

| Concern | Source of truth |
|---|---|
| Behavior, API, permissions | Current production frontend + backend |
| Visual language | This repository |
| Tokens | `design/tokens.css` |
| Page structure | `docs/page-specs.md` |
| Feature completeness | `docs/page-matrix.md` |
| Delivery order | `docs/version-roadmap.md` |

## Preserve

- Existing API contracts.
- Existing authentication and permission checks.
- Existing deep links, with redirects only when unavoidable.
- Existing task execution and report generation semantics.
- Existing data sources and visibility rules.

## Replace

- Old theme namespace.
- Old color values, radii, shadows, and type scale.
- Decorative visual effects.
- Ad-hoc page containers and fixed narrow widths.
- One-off table/card implementations where a primitive exists.

## Required page states

Every page must explicitly design:

```text
loading
empty
error
stale
permission denied
partial data
mobile
```

## Required acceptance evidence

For each page:

- desktop screenshot 1440;
- tablet screenshot 1024;
- mobile screenshot 760;
- keyboard focus path;
- contrast check for body and muted text;
- no horizontal overflow;
- typecheck and production build output;
- changelog entry.
