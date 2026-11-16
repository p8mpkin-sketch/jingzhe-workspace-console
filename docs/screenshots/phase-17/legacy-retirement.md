# Legacy workbench retirement (Phase 17)

Decision: **`?ui=v3` and `?ui=v2` are retired.** Every gate item below has a recorded real-backend response or a
recorded fixture result. Old links still work: the session route drops the `ui` parameter, keeps every other
parameter (`view`, `tab`, …) and opens the six-tab workbench. The 旧版工作台 entry is gone.

## Gate

| Gate item | Result | Evidence |
| --- | --- | --- |
| Real read audit: 0 duplicates, 0 errors, 0 5xx | **Pass.** 14 routes × 65 s and 20 workbench surfaces on session 260 / project 9: 0 duplicate data requests, 0 duplicate stream connections, 0 failed requests, 0 page errors, 0 console errors, 0 write attempts | `real-read.json` |
| auth_matrix non-500 | **Pass.** Sessions 260, 261 and 29 return 200 with the documented `{"status":"error","error_class":"NO_BASELINE"}` body; before the backend fix 260 and 261 returned 500 | `real-read.json` › `checks.authMatrix` |
| Successful task start | **Pass.** `POST /api/pentest/sessions/262/autopilot/start` → 200, status `running`; stop → 200, `stopped` | `real-write.json` steps 4c |
| Rule-card state change | **Pass.** `POST …/262/vulns/state {id, state:"confirmed"}` → 200, read back `confirmed`; restored to `pending`, read back `pending` | steps 4d |
| Mission start and status | **Pass.** `POST …/262/mission/start` (replay, unchanged body) → 200; `GET …/mission/status` went `running/inventory` → `done/done` | steps 4e |
| Rule-card import / export on real data | **Pass.** Local-only feature (no backend endpoint exists). Export of session 262 → 5 rows (JSON); import of that file → 1 card in the local layer (the importer merges rows with the same title + MASVS into one card, so the 5 rows shared one key); 0 non-GET requests | step 4g, `real/rulecards*.png` |
| Source slice | **Pass after a fix.** API: `GET /api/chat/source?task_id=100413&path=com/pentest/demo/MainActivity.java` → 200, 4405 bytes. UI: the first run showed 路径越界 because the canvas built `/MainActivity.java` from the relative name `.MainActivity`; fixed in this phase. Rechecked with a real double-click on session 260 (fully qualified class) and on a fresh session 263 (relative name): request path correct, 200, dialog shows source | steps 4f, `real/structure-source*.png`, `source-slice.fixtures.json` |
| V3 overflow 0 at 1440 / 1024 / 760 / 390 | **Pass** (Phase 16, unchanged since) | `docs/screenshots/phase-16/legacy/` |
| Capability matrix has no missing owner | **Pass** | `docs/capability-matrix.md` |
| No primary route depends on the legacy shell | **Pass.** The only link was the 旧版工作台 entry, now removed | `legacy-retired.fixtures.json` |

## What was removed

`features/pentest/SessionWorkspace.tsx` (V2), `features/pentest/v3/SessionWorkspaceV3.tsx` (V3) and the modules only
they imported: `AutopilotLaunchBar`, `layout/EnvBar`, `v3/CockpitHeaderBar`, `DecisionStreamCard`, `DeepDive`,
`DualTemporalCommandDock`, `InlineApprovalCard`, `thread`, `useEventStreamBuffer`, `v3.css`. Every capability they
held has a workbench owner (`docs/capability-matrix.md`). `v3/RawView.tsx` and `v3/SessionShell.tsx` stay because
the workbench uses them. The stale `apksec-ui-v3` / `apksec-ui-v4` preference keys are cleared on load.

Rollback: revert the retirement commit; no data or API change is involved.

## Test data

| Id | What | Outcome |
| --- | --- | --- |
| project 11 | disposable project from Phase 16, reused | stays: the API has no project delete route |
| session 261 | Phase 16 session | stays soft-closed: session delete is a soft close |
| task 100413 / session 262 | write audit | task deleted (GET → 404); session closed (`DELETE …?force=true`) |
| task 100414 / session 263 | relative-name source-slice recheck (no start, no mission) | task deleted (GET → 404); session closed |
| feedback `phase16-audit-manual-…` | Phase 16 residue | deleted with `DELETE /api/feedback/{ts}` → 200 |
| `com.pentest.demo` on emulator-5554 | installed by the autopilot start | uninstalled; the device is back to its pre-run state |

Only emulator-5554 was used. No database was edited by hand. A project delete route is needed for full cleanup; it
is a backend request, not part of this phase.
