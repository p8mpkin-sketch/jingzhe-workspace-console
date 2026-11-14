# Migration Map

## Shared primitives

| Current pattern | Target primitive |
|---|---|
| one-off buttons | `Button` variants |
| ad-hoc status colors | `StatusBadge` + state dictionary |
| page-specific tables | `DataTable` |
| repeated filter rows | `DataToolbar` |
| inline forms | `Field`, `Input`, `Select` |
| custom modals | `Modal` / `Drawer` |
| inline empty text | `EmptyState` |
| page-specific skeletons | `Skeleton` layouts |
| arbitrary cards | `Panel` / `Metric` / `ObjectCard` |

## Pages

| Area | Current problem | Target |
|---|---|---|
| Dashboard | mixed card sizes, weak hierarchy | KPI row + activity grid + recent table |
| Project index | narrow centered grid | full-width 3/4-column object grid |
| Project workspace | tab content lacks shared rhythm | shell header + sticky tabs + page sections |
| Reports | short generator card beside long history | full-width generator + history table |
| Apps | inconsistent table density | shared table, filters, pagination |
| Discovery | source limitations invisible | source panel + coverage disclosure |
| Tasks | rows lack detail affordance | table + detail drawer |
| Report center | duplicated list/detail patterns | hub + sectioned detail |
| Knowledge | card-only browsing | searchable list + review queue |
| Agent | cramped multi-column | sessions / conversation / context |
| System | settings mixed with health | tabs + tables |

## Tokens

```text
old namespace -> jz namespace
old accent -> jz-brand
old surfaces -> jz-surface / jz-surface-2
old text -> jz-ink / jz-ink-2 / jz-muted
old border -> jz-border
```

No compatibility alias for the old namespace should remain in new components.
