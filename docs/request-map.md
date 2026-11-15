# Request map for real-backend replay

Everything below was recorded against fixtures (`app/scripts/fixtures/api.mjs`) on a production preview build
(`npm run build && npx vite preview --port 4173`), not the dev server, so React StrictMode double effects are
not in the numbers. The local backend at `127.0.0.1:8099` refused connections from the build environment, so
**no request in this file has been seen against a real backend**. No request log here comes from a real backend.

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
