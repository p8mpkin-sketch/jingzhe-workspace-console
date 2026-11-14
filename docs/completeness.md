# Completeness and Prerequisites

## What this repository is complete for

- Product and UX direction.
- Full page and feature inventory.
- Current frontend architecture summary.
- Design tokens, typography, color, background, spacing, and component rules.
- Per-page redesign specifications.
- Version-by-version roadmap.
- Claude execution guardrails.

## What this repository does not contain

- Production frontend source code.
- Backend API implementation or private contracts.
- Customer data, credentials, or production assets.
- The current behavior test suite.
- Pixel-accurate legacy screenshots.

## Why source is not copied here

Copying the production tree would reintroduce the old theme namespace, legacy visual vocabulary, and domain-specific wording that this clean repository is meant to avoid.

## Prerequisites before Claude implements

1. Claude must have access to the current frontend source repository or a sanitized branch.
2. Claude must have the current route list and API contract.
3. Provide one screenshot per current page at 1440 and 1024 widths.
4. Provide the current font assets or confirm fallback stacks.
5. Provide permission rules for each navigation item.
6. Decide whether the migration is:
   - in-place refactor of the current app, or
   - a new app shell that reuses the existing API layer.

Without items 1–5, Claude should only build a static UI prototype, not modify production behavior.
