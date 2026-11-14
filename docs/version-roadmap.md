# Version Evolution Roadmap

## v2.0 — Foundation

Deliverables:

- neutral token file and theme mapping;
- typography stack and type scale;
- button/input/select/badge/card/table/modal primitives;
- shell grid and responsive breakpoints;
- remove decorative effects from shared components.

Acceptance:

- 5 sample pages use only primitives;
- no hardcoded colors outside tokens;
- 760/1024/1440 screenshots.

## v2.1 — Projects

Deliverables:

- project index and workspace shell;
- full-width layout;
- overview/report/apps/discovery/runs tabs;
- table density and empty states.

Acceptance:

- no page has unexplained lower-half blank;
- report history pagination;
- app and candidate tables consistent;
- mobile table → cards.

## v2.2 — Reports

Deliverables:

- report hub/detail;
- generator panel;
- section navigation;
- export/import dialogs;
- print styles.

Acceptance:

- report list and generator use full width;
- download, retry, error states;
- no duplicate action patterns.

## v2.3 — Tasks, discovery, knowledge

Deliverables:

- task list/detail/bulk actions;
- discovery source disclosure, batch workflow;
- knowledge cards and review queue;
- consistent status dictionary.

Acceptance:

- every async page has loading/empty/error;
- batch actions confirm;
- source coverage visible.

## v2.4 — Agent and system

Deliverables:

- agent three-pane workspace;
- model console;
- environment and audit tables;
- preferences.

Acceptance:

- composer and streaming states;
- no layout shift while streaming;
- mobile context drawer.

## v3.0 — Product polish

Deliverables:

- keyboard navigation and command palette;
- accessibility audit;
- density preference;
- motion audit;
- performance budget.

Acceptance:

- WCAG AA;
- no layout shift on load;
- first meaningful paint and bundle budget documented.

## Claude execution rule

Never start a page before its primitives exist. Each phase ends with a commit, screenshots, and a short changelog.
