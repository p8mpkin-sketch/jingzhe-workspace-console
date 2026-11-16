# Capability matrix

Phase 15 audit of every capability that existed in the legacy session surfaces (V3 `?ui=v3`, V2 `?ui=v2`)
against the six-tab workbench. Source of truth for the workbench structure is
`app/src/features/pentest/workbench/ia.ts`; every row below was checked against the component that renders it.

Status values:

- **Owned** – reachable in the workbench before Phase 15.
- **Moved in Phase 15** – was legacy-only; now has a workbench owner.
- **Shared owner** – two renderings of the same job exist on purpose; the reason is listed.

No capability is missing an owner. Legacy `?ui=v3` and `?ui=v2` were retired in Phase 17 after every gate item at
the end of this file passed on the real backend; old links open the workbench.

## Panels named in the Phase 15 brief

| Old panel | Capability | Current owner (tab › subtab › segment) | `?view=` | Status |
| --- | --- | --- | --- | --- |
| PackerPanel | Packer detection, unpack state, DEX list, unpack retry | Artifacts › Packaging information | `packer` | Owned |
| VulnsPanel | Rule-card list with severity / credential / MASVS (`?masvs=`) filters | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | Manual add (local), import / export, local notes, copy | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | Code board, hook stack, agent verdict, chain per card | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| VulnsPanel | State change (`POST /vulns/state`) | Findings › 规则卡 | `rulecards` | Moved in Phase 15 |
| AttackCanvas | Application structure canvas (React Flow), minimap, chain walk | Evidence › Relation graph › 应用结构 | `structure` | Moved in Phase 15 |
| AttackCanvas | Source slice on double click (`/api/chat/source`) | Evidence › Relation graph › 应用结构 | `structure` | Moved in Phase 15 |
| AttackCanvas | Select a node as inspection target | Inspector › 复核队列 › 当前检查对象 | any | Moved in Phase 15 |
| AiInspectorDrawer | Model routing chip | Inspector › 简报 | any | Moved in Phase 15 |
| AiInspectorDrawer | Approve / reject pending actions | Runtime › Agent trace (inline approval cards); Inspector › 复核队列 links to them | `stream` | Owned |
| AiInspectorDrawer | Object inspector (selected node / finding) | Inspector › 复核队列 › 当前检查对象 | any | Moved in Phase 15 |
| AiInspectorDrawer | Decision stream | Runtime › Agent trace | `stream` | Owned |
| Raw terminal | Terminal output, command input | Runtime › Terminal | `raw` | Owned |
| Execution monitor | Step timeline, running command, exit state | Runtime › Terminal (same surface as the raw terminal) | `raw` | Owned |
| Proxy traffic | Captured requests, bridge status, plugin health | Runtime › API / Requests › 代理流量 | `burp` | Owned |
| API inventory | Endpoint tree, per-endpoint detail | Runtime › API / Requests › 接口资产 | `apitree` | Owned |
| Version compare | Report diff between two versions | Report › Version compare | `diff` | Owned |

## Other legacy capabilities found during the audit

| Legacy surface | Capability | Current owner | Status |
| --- | --- | --- | --- |
| V3 header | Mission start (device exploration / replay inventory), `POST /mission/start` with the same body | Header › 更多操作 | Moved in Phase 15 |
| V3 header | Mission status (`GET /mission/status`) | Inspector › 简报 | Moved in Phase 15 |
| V3 findings | Finding clusters (`GET /vulns/clusters?limit=50`) | Findings › 聚类 (`clusters`) | Moved in Phase 15 |
| V3 header | Session switcher | Project sessions page (`/pentest/projects/:pid`) | Owned |
| V3 / V2 | Operator clue (`POST /clue`) | Runtime › Agent trace composer; consumed clues appear in the trace | Owned |
| AutopilotLaunchBar | Start / pause / resume | Header primary action | Owned |
| AutopilotLaunchBar | Stop | Header › 更多操作 › 停止任务 (confirmation) | Owned |
| SessionOverview | Session summary, usage, coverage summary | Overview | Owned |
| AiThinkPanel | Reasoning trace | Runtime › Agent trace › 推理记录 (`ai`) | Owned |
| V3 / V2 | Fact graph, credentials, coverage | Evidence | Owned |
| V3 / V2 | Analysis output (task artifacts) | Artifacts › Analysis output | Owned |
| V3 / V2 | Report view and export | Report › Report | Owned |

## Shared owners (kept on purpose)

| Job | Renderings | Why both stay |
| --- | --- | --- |
| Findings list | Findings › 主发现 (workbench list) and Findings › 规则卡 (VulnsPanel) | 规则卡 carries local notes, import / export, MASVS filter and per-card code board that the main list does not have. Merging them needs a product decision; 主发现 stays the default. |
| Graph | Evidence › Relation graph › 关系图 and › 应用结构 (AttackCanvas) | Different data: session relation graph versus application structure with source slices. |

## Inspector ownership

The inspector holds low-frequency context only: 复核队列 (pending approvals and the current inspection target),
简报 (brief, model routing, mission status), 进度 (stages), 日志 (last 20 events). It no longer repeats recent
findings, counters or evidence; those live on the main surface only.

## Verification

Verified with fixtures (`app/scripts/fixtures/api.mjs`, production preview build): every `?view=` id in the
table resolves and renders, including error, forbidden, slow and empty variants (`scripts/check-workbench.mjs`).

Real backend (Phase 17, `docs/screenshots/phase-17/`): VulnsPanel state change, import and export, AttackCanvas
source slice, mission start and status all verified. The clusters view was part of the 65 s read audit
(`?view=clusters`, 0 failed requests).

## Legacy retirement gate (Phase 16)

`?ui=v3` and `?ui=v2` are removed only when every row passes. Status as of Phase 16:

| Gate | Status | Evidence |
| --- | --- | --- |
| Real-backend read audit | Pass, with one backend 500 (`auth_matrix` for a session without that data): 0 duplicate requests, 0 duplicate streams, 0 page errors | `app/scripts/real-read-audit.mjs`, result in `docs/screenshots/phase-16/` |
| Real-backend write audit | **Not passed.** Six writes returned 200 (project, assessment, session, clue, feedback, stop). Start returned 400 (sample not installable) and the rule-card state change was not sent (no finding in the disposable session) | `app/scripts/real-write-audit.mjs`, result in `docs/screenshots/phase-16/` |
| V3 1440 px overflow resolved | Pass | `[data-v3-rail]` no longer overflows; 0 px at 1440 / 1024 / 760 / 390, light and dark (`docs/screenshots/phase-16/legacy/`) |
| Capability matrix has no missing capability | Pass | tables above; unchanged in Phase 16 |
| No current route depends on the legacy shell for a primary job | Pass | the only link into a legacy shell is the workbench's 旧版工作台 entry (`WorkbenchPage.openLegacy`); every route renders the six-tab workbench by default |

**Decision: keep `?ui=v3` and `?ui=v2`.** The write audit has two open items (a successful task start and the rule-card state change), and the Phase 15 items listed above (mission start and status, rule-card import and export, source slice) are still unverified on a real backend. Nothing is removed in Phase 16.

## Legacy retirement gate (Phase 17)

| Gate | Status | Evidence |
| --- | --- | --- |
| Real-backend read audit, 0 duplicates, 0 errors, 0 5xx | Pass | `docs/screenshots/phase-17/real-read.json` |
| Successful task start | Pass (200, `running`, then stopped) | `real-write.json` |
| Rule-card state change | Pass (changed, read back, restored) | `real-write.json` |
| Mission start and status | Pass (replay, reached `done`) | `real-write.json` |
| Rule-card import / export on real data | Pass (local only; 0 non-GET requests) | `real-write.json`, `real/rulecards*.png` |
| Source slice | Pass after the relative-name fix; checked in the UI on a fully qualified and a relative component | `real/structure-source*.png` |
| V3 overflow, capability matrix, no route depends on the legacy shell | Pass | Phase 16 and this file |

**Decision: `?ui=v3` and `?ui=v2` retired.** Details, removed modules and test data: `docs/screenshots/phase-17/legacy-retirement.md`.
