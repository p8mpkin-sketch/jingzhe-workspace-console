# Page Specifications

## Shell

- Sidebar 232px expanded, 68px collapsed.
- Top bar 52px.
- Main area uses the full width after sidebar; no 1440px cap.
- Mobile: sidebar becomes a drawer; top bar keeps current module and primary action.

## Dashboard

```text
Header: title + time range + refresh
Row 1: 4 metrics (projects, active tasks, reports, coverage)
Row 2: activity chart 2/3 + queue health 1/3
Row 3: recent projects table + recent reports
```

All cards must align to the same 12-column grid. No orphan card row.

## Project index

- Header: title, description, create action.
- Toolbar: search, type filter, sort, count.
- Body: 3-column card grid at >=1280; 2 at 900–1279; 1 below 900.
- Card: name, owner, app count, type, primary action.
- Empty: create action.
- Loading: 6 skeleton cards.

## Workspace header

```text
Breadcrumb
Title + ID + type
Owner / brand / source
Primary action: run
Secondary: import, refresh
Tabs with counts
```

Tabs: Overview, Reports, Apps, Discovery, Runs.

## Overview

- KPI row: apps, completed, candidates, reports.
- Coverage panel with progress and status split.
- Recent reports list.
- Recent runs list.
- Quick actions.
- No empty lower half: if activity is sparse, show a compact “what to do next” panel.

## Reports

```text
KPI row
Generator panel (full width):
  template | LLM toggle | generate
  report contents checklist
History table (full width):
  report / template / status / actions
  search + pagination
```

Do not put a short generator card beside a long history card.

## Apps

- KPI row: total, complete, running, failed.
- Toolbar: search, status, ownership, page size.
- Table: app, package, version, brand, ownership, status, report, action.
- At <900px: cards with the same fields.
- Pagination footer.

## Discovery

- Source panel: seeds, official list, Play developer page, Aptoide pagination, AI extraction.
- Required disclosure: public sources cannot guarantee complete coverage.
- Candidate table: app/package, developer, source, ownership, confidence, status.
- Batch bar: selected count, verify, download, import.
- Coverage panel: sources used, failures, unavailable reasons.

## Runs

- KPI row: batches, succeeded, failed, skipped.
- Run rows: id, status, progress, counts, retry.
- Explain execution policy and failure handling in a compact side panel only if the list is short.

## Task center

- List with search, status, owner.
- Columns: task, target, status, duration, result, actions.
- Bulk selection and rerun.
- Detail drawer with logs and artifacts.

## Report center

- Hub: search, template, status, pagination.
- Detail: left section nav, right report content.
- Import modal and manual finding modal share form primitives.
- Export actions grouped in one menu.

## Knowledge

- Header, search, tag filter.
- Card grid or list.
- Candidate review queue with approve/reject.
- Empty state with “create from a task”.

## Agent workspace

- Left: sessions.
- Center: conversation.
- Right: context (files, plan, sources).
- Composer fixed at bottom of center panel.
- Mobile: context collapses into a drawer.

## System

- Tabs: models, environment, audit, preferences.
- Model rows with health/latency.
- Environment rows with status.
- Audit table with filters.

## Dialogs and drawers

- Max width 640px, mobile full-width sheet.
- Header, body, footer.
- Primary action right, cancel left.
- Escape and backdrop close except destructive confirm.
