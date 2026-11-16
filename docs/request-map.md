# Request map for real-backend replay

Everything below was recorded against fixtures (`app/scripts/fixtures/api.mjs`) on a production preview build
(`npm run build && npx vite preview --port 4173`), not the dev server, so React StrictMode double effects are
not in the numbers. The local backend at `127.0.0.1:8099` refused connections from the build environment, so
the per-route tables below come from fixtures. The real-backend results of Phase 16 are in their own section.

## How to replay with backend access

```sh
cd app && npm run build && npx vite preview --port 4173 --strictPort   # proxy /api to the backend as in vite.config
BASE=http://localhost:4173/v2/ REAL=1 TOKEN=<your session token> node scripts/check-polling.mjs > real-cadence.json
```

`REAL=1` turns the fixtures off and passes every request through. Pass the token through the environment only;
do not commit it or paste it into the output. Compare `real-cadence.json` with
`docs/screenshots/phase-15/request-cadence.json` (`held.phase15`): the unique request set per route should match
the tables below, `initialDuplicates` should be empty, and `repeating` should show the intervals listed here.

Ids in the tables come from the fixtures: `{sid}` is a session id (fixture 40, compare target 41),
`{task_id}` a task id (fixture 100), project id 1. Replace them with real ids.

## Result summary

| Check | Phase 14 (bdae05d) | Phase 15 | Status |
| --- | --- | --- | --- |
| Unique request set, 14 routes (`check-requests.mjs`) | baseline | identical to baseline | Verified with fixtures |
| Duplicates in the first 3 s, streams held open | 0 | 0 | Verified with fixtures |
| Total requests in 65 s, streams held open | 346 | 344 | Verified with fixtures |
| Duplicates in the first 3 s, fixture closes streams at once | 13 | 17 | Fixture artefact, see below |
| Same checks against 127.0.0.1:8099 | — | — | **Pending real backend** |

When the fixture closes every SSE response immediately, EventSource reconnects with jittered backoff (about 1 s,
2 s, 4 s …). Two attempts sometimes land inside the 3 s window and are counted as a duplicate. The count moves
between runs of the same build (13 to 17 observed) and every entry is a stream reconnect or the agent event
poll; none is a repeated data fetch. With the streams held open, as a live backend holds them, both builds show 0.
This is the number to confirm on a real backend.

`/api/tasks` with different query strings (`?status=running&limit=50`, `?limit=…`) are different requests and are
listed separately.

## Real-backend audit (Phase 16)

Two scripts replace the manual replay above. Both read the token from `JZ_TOKEN` or from `JZ_TOKEN_FILE`
(a file with mode 600), never print it, and refuse to write a result that still contains it.

```sh
cd app && npm run build && npx vite preview --port 4173 --strictPort
# read-only: 14 routes for 65 s each, then the 20 workbench surfaces; any non-GET request is aborted and reported
JZ_TOKEN_FILE=~/.jz-token node scripts/real-read-audit.mjs --out ../docs/screenshots/phase-16/real-read.json
# writes against a disposable project, task and session that the script creates and deletes
JZ_TOKEN_FILE=~/.jz-token JZ_APK_PATH=<server path of your own sample> [JZ_DEVICE=<serial>] [JZ_ALLOW_START=1] \
  node scripts/real-write-audit.mjs --out ../docs/screenshots/phase-16/real-write.json --shots ../docs/screenshots/phase-16/real
```

The real backend holds SSE connections open itself, so the read audit needs no `HOLD_STREAMS`; that switch only
exists for the fixture run (`docs/screenshots/phase-16/request-cadence.fixtures-held.json`: 14 routes, 65 s,
0 duplicates).

### Result: read audit, real backend, 2026-11-15

Run on the machine that hosts the backend, production preview build, `/api` proxied to `127.0.0.1:8099`,
project 9, session 260 (existing data, read only). Result file: `docs/screenshots/phase-16/real-read.json`.

| Check | Result |
| --- | --- |
| Routes / workbench surfaces replayed | 14 routes × 65 s, 20 surfaces × 6 s |
| Duplicate data requests in the first 3 s | 0 |
| Duplicate stream connections | 0; each SSE endpoint connected once and stayed open, no reconnect in 65 s |
| Write attempts during load (aborted by the audit) | 0 |
| `/api/feedback` on `/system` | 1 read, not duplicated |
| `/api/tasks` with different query strings | 5 distinct keys, each counted separately |
| Polling intervals | 8 s (devices, session, autopilot status, timeline, progress events, grouped findings, approvals, recent events) and 30 s (tasks summary, running tasks): same as the fixture run |
| Page errors | 0 |
| Failed requests | 1: `GET /api/pentest/sessions/260/auth_matrix` → 500 on `/reports` (backend response for a session without auth-matrix data; also the only console error) |

Differences from the fixture request set, ids normalised:

- `/tasks`: `GET /api/tasks/counts?ids=…` carries real task ids. Same request, different ids.
- `/agent`: the agent session id is not numeric (`43bc88f6`), and the event cursor is `since_seq=21` because the
  real session already has events. Same three requests.
- `/pentest/project/{id}/session/{id}` and `/agent`: `GET /api/models/providers` was not requested on the real
  backend although the fixture run requests it. The cause was not determined; nothing failed on either page.

### Result: write audit, real backend, 2026-11-15

Disposable data: project 11 (`jz-phase16-write-audit-20261115173617`), task 100409, session 261. Result files:
`docs/screenshots/phase-16/real-write.json` (the automated run) and `real-write-verified.json` (the same steps
completed after the task finished). Screenshots: `docs/screenshots/phase-16/real/`.

The automated run created the session milliseconds after the task and got 404 (the task had no run directory
yet), which blocked the session-dependent steps. They were then sent once the task was done. The script now
waits for the task before creating the session.

| Write | Method and path | Body | Status | Resulting state | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Project creation | `POST /api/pentest/projects` | `{name, note}` | 200 | project 11 listed | none possible: no project delete route |
| Assessment creation | `POST /api/tasks` | `{kind:"audit", app_name, apk_path, authorized}` | 200 | task 100409 ran to `done` | `DELETE /api/tasks/100409` → 200, then GET → 404 |
| Session creation | `POST /api/pentest/projects/11/sessions` | `{task_id, device, authorized}` | 200 (404 while the task had no run directory) | session 261 `ready`, workbench renders | `DELETE /api/pentest/sessions/261?force=true` → 200, session `closed` |
| Clue submission | `POST /api/pentest/sessions/261/clue` | `{text}` | 200 | `pending: 1` | closed with the session |
| Feedback submission | `POST /api/feedback` | `{card_id, verdict, sid}` | 200 | recorded | none possible: no feedback delete route |
| Task stop | `POST /api/pentest/sessions/261/autopilot/stop` | none | 200 | autopilot `idle` | n/a |
| Task start | `POST /api/pentest/sessions/261/autopilot/start` | none | **400** | rejected: the sample is not installed on the device; autopilot stayed `idle`, the device was not driven | n/a |
| Rule-card state change | `POST /api/pentest/sessions/261/vulns/state` | `{id, state}` | **not sent** | the disposable session has 0 findings, and the audit does not change findings of real sessions | n/a |

Left on the backend, because the API has no route to remove them: project 11, session 261 (closed), and one
feedback row (`card_id` starting `phase16-audit-manual-`). No database was edited by hand. No existing project,
session, task or report was written to.

**Still pending on a real backend:** a successful task start (needs an installable sample on a test device),
the rule-card state change (needs a disposable session with at least one finding), and the Phase 15 items that
were never in this audit: mission start and status, rule-card import and export, and the source slice.

## Shell (every signed-in route)

These come from the app shell, so they appear on every route below and are not repeated in each table.

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/me` | — | 1 | none (on load only) |
| GET | `/api/notifications/stream` | `token=<session token>` | 1 | SSE, held open; reconnect backoff 1 s doubling to 30 s with jitter |
| GET | `/api/notifications` | `limit=50` | 1 | none (on load only) |
| GET | `/api/pentest/devices` | — | 1 | every 8 s |
| GET | `/api/tasks-summary` | — | 1 | every 30 s |

## Per route

### `/dashboard`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/models/providers` | — | 1 | none (on load only) |
| GET | `/api/models/routing` | — | 1 | none (on load only) |
| GET | `/api/nodes` | — | 1 | none (on load only) |
| GET | `/api/pentest/events/recent` | `limit=30` | 1 | every 8 s |
| GET | `/api/pentest/sessions` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions/{sid}/report/summary` | — | 1 per session (4 in fixtures) | none (on load only) |
| GET | `/api/pentest/vulns/domain-summary` | — | 1 | none (on load only) |
| GET | `/api/pentest/vulns/severity-summary` | — | 1 | none (on load only) |
| GET | `/api/tasks/batch-unpack-summary` | — | 1 | none (on load only) |
| GET | `/api/tasks` | `limit=500` | 1 | none (on load only) |
| GET | `/api/tasks` | `status=queued&limit=2000` | 1 | none (on load only) |
| GET | `/api/tasks` | `status=running&limit=50` | 1 | every 30 s |

### `/pentest`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/pentest/projects` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/sessions` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/2/sessions` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/3/sessions` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions` | `limit=500` | 1 | none (on load only) |
| GET | `/api/pentest/vulns/severity-summary` | — | 1 | none (on load only) |

### `/pentest/project/1`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/pentest/projects` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/sessions` | — | 1 | none (on load only) |

### `/pentest/project/1/session/40`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/models/catalog` | — | 1 | none (on load only) |
| GET | `/api/models/providers` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions/{sid}` | — | 1 | every 8 s |
| GET | `/api/pentest/sessions/{sid}/approvals` | — | 1 | every 8 s |
| GET | `/api/pentest/sessions/{sid}/autopilot/status` | — | 1 | every 8 s |
| GET | `/api/pentest/sessions/{sid}/events/stream` | `source=hook&since_seq=0&token=<session token>` | 1 | SSE, held open; reconnect backoff 1 s doubling to 30 s with jitter |
| GET | `/api/pentest/sessions/{sid}/events` | `source=progress&limit=300` | 1 | every 8 s |
| GET | `/api/pentest/sessions/{sid}/security-rounds` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions/{sid}/timeline` | — | 1 | every 8 s |
| GET | `/api/pentest/sessions/{sid}/vulns/grouped` | — | 1 | every 8 s |

### `/company`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/pentest/projects` | — | 1 | none (on load only) |

### `/company/projects/1`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/pentest/projects/1/apps` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/candidates` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/overview` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/reports` | — | 1 | none (on load only) |
| GET | `/api/pentest/projects/1/runs` | — | 1 | none (on load only) |

### `/new-audit`

Shell requests only.

### `/tasks`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/org` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions` | — | 1 | none (on load only) |
| GET | `/api/tasks/batch-unpack-summary` | — | 1 | none (on load only) |
| GET | `/api/tasks/counts` | `ids=100,101,102,103,104,105,106,107` | 1 | none (on load only) |
| GET | `/api/tasks` | `limit=2000` | 1 | none (on load only) |

### `/reports`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/pentest/sessions` | — | 1 | none (on load only) |
| GET | `/api/pentest/sessions/{sid}/auth_matrix` | — | 1 per session (2 in fixtures) | none (on load only) |
| GET | `/api/pentest/sessions/{sid}/report/summary` | — | 1 per session (2 in fixtures) | none (on load only) |
| GET | `/api/pentest/sessions/{sid}/vulns/grouped` | — | 1 per session (2 in fixtures) | none (on load only) |
| GET | `/api/tasks` | `limit=500` | 1 | none (on load only) |

### `/discovery`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/v2/overview` | — | 1 | none (on load only) |

### `/skills`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/kb/candidates` | — | 1 | none (on load only) |
| GET | `/api/skills` | — | 1 | none (on load only) |
| GET | `/api/tasks` | `limit=200` | 1 | none (on load only) |

### `/ai-assistant`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/chat/sessions` | — | 1 | none (on load only) |
| GET | `/api/models/providers` | — | 1 | none (on load only) |
| GET | `/api/models/routing` | — | 1 | none (on load only) |
| GET | `/api/tasks` | `limit=500` | 1 | none (on load only) |

### `/agent`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/agent/sessions` | — | 1 | none (on load only) |
| GET | `/api/agent/sessions/a1/eval` | — | 1 | none (on load only) |
| GET | `/api/agent/sessions/a1/events` | `since_seq=0` | 1 | backoff poll, 1,2,7,10,26 s observed |
| GET | `/api/agent/sessions/a1/snapshot` | — | 1 | none (on load only) |
| GET | `/api/agent/settings` | — | 1 | none (on load only) |
| GET | `/api/agent/web/status` | — | 1 | none (on load only) |
| GET | `/api/models/catalog` | — | 1 | none (on load only) |
| GET | `/api/models/providers` | — | 1 | none (on load only) |

### `/system`

| Method | Route | Query | Expected unique count on load | Polling interval |
| --- | --- | --- | --- | --- |
| GET | `/api/feedback` | — | 1 | none (on load only) |
| GET | `/api/models/providers` | — | 1 | none (on load only) |
| GET | `/api/models/routing` | — | 1 | none (on load only) |

## Session workbench, per `?view=`

Route `/pentest/project/1/session/{sid}?view=<id>`. The default view (`stream`) makes the requests listed for the session route above; each other view adds the requests below, once each, on load.

| `?view=` | Additional requests on load | Duplicates |
| --- | --- | --- |
| `ai` | `GET /api/pentest/sessions/{sid}/api_tree`<br>`GET /api/pentest/sessions/{sid}/events?source=hook&limit=60`<br>`GET /api/pentest/sessions/{sid}/events?source=orchestrator&limit=500`<br>`GET /api/pentest/sessions/{sid}/events?source=progress&limit=200`<br>`GET /api/pentest/sessions/{sid}/report/summary` | 0 |
| `raw` | `GET /api/pentest/sessions/{sid}/events?source=bridge&since_seq=0&limit=200`<br>`GET /api/pentest/sessions/{sid}/events?source=evidence&since_seq=0&limit=200`<br>`GET /api/pentest/sessions/{sid}/events?source=hook&since_seq=0&limit=200`<br>`GET /api/pentest/sessions/{sid}/events?source=progress&since_seq=0&limit=200` | 0 |
| `apitree` | `GET /api/pentest/sessions/{sid}/api_tree` | 0 |
| `burp` | `GET /api/pentest/sessions/{sid}/burp/plugin?probe=1`<br>`GET /api/pentest/sessions/{sid}/burp/status`<br>`GET /api/pentest/sessions/{sid}/events?source=bridge&limit=200` | 0 |
| `overview` | `GET /api/pentest/sessions/{sid}/burp/status`<br>`GET /api/pentest/sessions/{sid}/events?source=progress&since_seq=0&limit=200`<br>`GET /api/pentest/sessions/{sid}/llm-usage`<br>`GET /api/pentest/sessions/{sid}/report/summary` | 0 |
| `findings` | none beyond the session route | 0 |
| `shadow` | `GET /api/pentest/sessions/{sid}/vulns/grouped?source=shadow` | 0 |
| `rulecards` | `GET /api/pentest/sessions/{sid}/events?source=hook&since_seq=0&limit=200` | 0 |
| `clusters` | `GET /api/pentest/sessions/{sid}/vulns/clusters?limit=50` | 0 |
| `graph` | `GET /api/pentest/sessions/{sid}/graph` | 0 |
| `facts` | `GET /api/pentest/sessions/{sid}/fact-graph` | 0 |
| `structure` | `GET /api/pentest/sessions/{sid}/api_tree`<br>`GET /api/pentest/sessions/{sid}/graph` | 0 |
| `credentials` | `GET /api/pentest/sessions/{sid}/credentials` | 0 |
| `coverage` | none beyond the session route | 0 |
| `artifacts` | `GET /api/tasks/{task_id}/artifacts?prefix=`<br>`GET /api/tasks/{task_id}/artifacts?prefix=report`<br>`GET /api/tasks/{task_id}/artifacts?prefix=unpacked` | 0 |
| `packer` | `GET /api/pentest/sessions/{sid}/packer` | 0 |
| `report` | none beyond the session route | 0 |
| `diff` | `GET /api/pentest/sessions`<br>`GET /api/pentest/sessions/{sid}/vulns`<br>`GET /api/pentest/sessions/{sid}/vulns` | 0 |

## Writes (never fired by the audit scripts)

The audits only load pages, so no write was sent, even to fixtures. These are the writes the Phase 15 changes
touch; each needs one manual check on a real backend. Bodies are unchanged from the legacy callers.

| Method | Route | Body | Trigger | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/feedback` | — | System page, feedback statistics | Routed through the shared client in Phase 15; fixtures only |
| POST | `/api/feedback` | unchanged from before Phase 15 | AI sidebar, feedback buttons | Pending real backend |
| POST | `/api/tasks` | `{kind:"audit", app_name, apk_path, authorized, device_serial?}` | New assessment, single submit | Pending real backend |
| POST | `/api/pentest/sessions/{sid}/mission/start` | `{mode:"device"|"replay", max_screens:20, max_minutes:10, run_tests:true, max_tests:5, run_adjudicate:true, max_adjudications:3}` | Workbench header menu | Pending real backend |
| GET | `/api/pentest/sessions/{sid}/mission/status` | — | Inspector brief, on open and after a start | Pending real backend |
| POST | `/api/pentest/sessions/{sid}/vulns/state` | unchanged (VulnsPanel) | Findings, rule cards | Pending real backend |
| POST | `/api/pentest/sessions/{sid}/clue` | `{text}` | Agent trace composer | Pending real backend |

## Requests that still bypass the shared client

These use `fetch` directly, so they are not coalesced by `services/apiClient.ts`. They were left alone in Phase 15
because they are downloads, uploads or streams, or because they belong to pages outside this phase. None of them
duplicated in the fixture runs.

| File | Requests |
| --- | --- |
| `features/reports/ReportCenterPage.tsx` | report summary, auth matrix, grouped findings, findings, report download, executive summary PDF |
| `layout/EnvBar.tsx` | session, proxy status, autopilot status, task |
| `layout/AiSidebar.tsx` | findings, LLM insight, session events |
| `features/pentest/AiThinkPanel.tsx` | orchestrator and progress events |
| `features/agent/useAgentSession.ts` | agent events poll, trajectory download |
| `features/ai-assistant/AiAssistantPage.tsx` | chat send stream |
| `features/tasks/ArtifactsModal.tsx`, `features/company/CompanyProjectDetailPage.tsx`, `features/new-audit/NewAuditPage.tsx`, `features/pentest/BurpBridgePanel.tsx` | downloads and uploads |
| `stores/auth.ts` | login |
