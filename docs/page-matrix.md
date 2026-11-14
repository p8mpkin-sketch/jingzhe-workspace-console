# Page and Feature Matrix

Status legend: **Keep** = preserve behavior; **Rework** = restructure presentation; **New** = add missing UI state.

## 1. Global shell

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Top bar | breadcrumb, context pills | copy package, device popover, refresh, theme, notifications, settings, account menu | Rework |
| Left nav | grouped navigation | active indicator, collapsed rail, device health, queue health, user, logout | Rework |
| Command palette | global actions | search, keyboard shortcut, recents, empty result | Keep / restyle |
| Notifications | live notifications | unread count, mark read, deep link, empty | Rework |
| Theme | light / dark | system preference, persistence, no flash | Rework |
| Auth gate | sign in | loading, invalid credentials, expired session | Keep / restyle |

## 2. Dashboard

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Summary | project/task/report counts | trend hint, source note | Rework |
| Activity | recent tasks/reports | status, timestamp, deep links | Rework |
| Health | device and queue state | stale, offline, zero state | Rework |
| Quick actions | create project, import, run | disabled reasons | New |

## 3. Projects

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Project index | search, filter, sort | empty, loading, error, density | Rework |
| Project card | name, owner, app count | type, status, recent activity, primary action | Rework |
| Project workspace | overview | coverage, progress, risks, quick links | Rework |
| Workspace tabs | overview, reports, apps, discovery, runs | counts, sticky tab bar, deep links | Rework |
| Reports | generate, template, queue, history | filter, pagination, download, retry, empty | Rework |
| Apps | list, search, filter, page | per-app action, report state, empty | Rework |
| Discovery | source run, official catalog, batch actions | source checkboxes, selection, verify, download, import | Rework |
| Runs | batch progress | success/fail/skip, retry, timeline, empty | Rework |
| Import | APK/XAPK upload | drag/drop, progress, partial failure, duplicate | New |

## 4. Company / group

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Company index | company cards, app totals | type filter, search, empty | Rework |
| Create company | name, company, brands, source, note | validation, submit, cancel | Rework |
| Company workspace | same as project workspace, company context | brand chips, ownership mix | Rework |

## 5. New assessment

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Input | file / URL / device | validation, size, wrong format | Rework |
| Options | mode, depth, template | advanced disclosure, defaults | Rework |
| Review | summary | edit, confirm, cancel | Rework |
| Progress | stage stepper | queued/running/failed | Rework |

## 6. Task center

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| List | search, status, owner, time | pagination, sticky header | Rework |
| Row | task, target, status, duration | progress, retry, cancel, artifacts | Rework |
| Detail | logs, artifacts, timeline | copy, download, open report | Rework |
| Batch | select, rerun, stop | confirmation, partial failure | New |

## 7. Report center

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Hub | reports, templates, filters | search, pagination, sort | Rework |
| Detail | sections, findings, evidence | section nav, print, export | Rework |
| Import | DOCX/JSON import | preview, conflict, error | Rework |
| Manual finding | create/edit | validation, severity, evidence | Rework |

## 8. Discovery pipeline

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Sources | public source, official list | source toggles, limits, caveats | Rework |
| Candidates | table, filters | confidence, ownership, status | Rework |
| Verification | batch verify | progress, partial result | Rework |
| Download / import | batch actions | retry, failure reason, dedupe | Rework |
| Coverage | source coverage | missing / unavailable explanation | New |

## 9. Knowledge

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Library | search, tags, categories | sort, empty | Rework |
| Card | title, summary, source | status, owner, updated | Rework |
| Candidate review | approve/reject | reason, audit | Rework |
| Detail | content, references | copy, back | Rework |

## 10. Agent workspace

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Session list | search, recent | empty, new session | Rework |
| Conversation | messages, tool calls | streaming, stop, retry | Rework |
| Context panel | files, plan, sources | collapse, stale | Rework |
| Composer | prompt, attachments | disabled state, shortcut | Rework |

## 11. System

| Area | Major features | Small features / states | Decision |
|---|---|---|---|
| Model console | model list, health | latency, error, refresh | Rework |
| Environment | devices, services | online/offline, stale | Rework |
| Audit | action log | filter, pagination | Rework |
| Preferences | theme, locale, density | save, reset | New |

## 12. Shared components

```text
Button, icon button, input, textarea, select, checkbox, radio
Tabs, segmented control, filter bar, search field
Card, panel, section header, metric
Table, row, cell, pagination, bulk bar
Badge, status dot, confidence, tag
Modal, confirm dialog, drawer, sheet, popover
Toast, inline alert, empty state, skeleton
```
