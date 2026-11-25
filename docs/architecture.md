# Current Frontend Architecture

## Stack

| Layer | Choice |
|---|---|
| Runtime | React 18 + TypeScript 5.5 |
| Build | Vite 5 |
| Styling | Tailwind CSS 3.4 + CSS variables |
| Routing | React Router 6 (hash routing in the current shell) |
| State | Zustand stores |
| Charts | ECharts |
| Canvas / flow | React Flow |
| Panels | Dockview |
| Icons | Lucide |
| Markdown | react-markdown + remark-gfm |

## Shell

```text
App
├── Auth gate
├── Top bar (48px)
│   ├── breadcrumb
│   ├── session/device/context pills
│   ├── refresh / theme / notifications / settings / account
├── Left navigation
│   ├── product mark
│   ├── primary navigation groups
│   └── device health / engine queue / user / collapse
└── Page outlet
    └── feature page
```

The shell is persistent. Pages own their own header, toolbar, content, and local dialogs.

## Navigation model

```text
/                     redirect
/dashboard            operational overview
/projects             project index
/projects/:id         project workspace
/company              company / group index
/company/projects/:id company project workspace
/new-assessment       create flow
/tasks                task list
/tasks/:id            task detail (V3 Phase 7)
/reports              report center
/discovery            discovery pipeline
/knowledge            reusable knowledge
/agent                agent workspace
/system               system and model console
/login                authentication
```

Names above are the target public vocabulary. Legacy route names may exist internally; do not expose legacy wording in UI copy.

## Data and state

- Server access goes through a single API client and typed service modules.
- Session-local UI state is held in small Zustand stores.
- Polling is used for device and queue truth; event streams are used for live session state.
- Page data is refreshed explicitly or by polling; avoid duplicated polling within one page.
- Every async surface needs four states: loading, empty, error, stale.

## Shared UI primitives

```text
Button, Badge, StatusBadge, Modal, Drawer, Toast, Skeleton
DataToolbar, SearchableTaskCombobox, PipelineStepper
CodePill, UniversalImportExportModal
```

These primitives exist but are not yet a coherent visual system. The target is to make them the only way pages compose controls.

## Layout constraints in the current implementation

- Some pages use fixed max widths that leave large gutters on wide monitors.
- Some pages use two-column card layouts with mismatched heights.
- Some pages stack KPI cards, a large empty card, and a table without a shared grid.
- Tables mix compact and oversized row heights.
- Status vocabulary alternates between English machine states and Chinese labels.
- Theme tokens exist in two modes, but many pages still rely on visual effects rather than hierarchy.

## What must not change during the redesign

- API contracts and route behavior.
- Permission checks and data visibility.
- Task execution semantics.
- Report generation and download behavior.
- Existing deep links, unless a redirect is added.
