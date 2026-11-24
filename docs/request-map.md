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
| Same checks against 127.0.0.1:8099 | — | — | Real backend: 0 duplicates (Phase 16 and Phase 17) |

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
  backend although the fixture run requests it. Resolved in Phase 17: the agent composer asks for providers only
  when `/api/models/catalog` is empty or fails; the real catalog has 3 items, the old fixture catalog was empty.

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

### V3 Phase 2: the project routes merged

The four project pages below (`/pentest`, `/pentest/project/1`, `/company`, `/company/projects/1`) no longer exist
as pages; their paths redirect. Their tables stay as the recorded pre-V3 baseline. The merged routes issue:

| V3 route | Requests on load | Polling |
| --- | --- | --- |
| `/projects` (any `?scope=`) | the union of `/pentest` and `/company` below: projects, `sessions?limit=500`, `vulns/severity-summary`, one `projects/{pid}/sessions` per project | none |
| `/projects/1` (any `?tab=`) | the union of `/company/projects/1` and `/pentest/project/1` below: projects, and the project's `overview`, `apps`, `candidates`, `reports`, `runs`, `sessions`; each one an independent request | none |
| `/projects/1?tab=runs`, while the tab is open | in addition `GET /api/tasks?limit=2000` and `GET /api/pentest/sessions` (the two lists `/tasks` reads), to show each session's task | none |

`scripts/check-requests.mjs` compares a merged route with the union of the pages it replaces.

### V3 Phase 3: the workbench shell

`/projects/{pid}/sessions/{sid}` issues the requests it issued in Phase 2 and nothing else. What moved:

| Request | Before | Now |
| --- | --- | --- |
| `GET /api/pentest/sessions/{sid}/security-rounds` | Review-rounds strip under the header: once when the workbench opens; every 3.5 s while a recompute starts, a run is in progress or the rounds are missing | `shell/useSecurityRounds`, mounted by the page: same read, same poll. Rendered in Inspector › 进度 |
| `POST /api/pentest/sessions/{sid}/security-rounds/recompute` | Strip button | Inspector › 进度 › 运行五轮复核, same body (`{}`) |
| `GET /api/pentest/sessions/{sid}/mission/status`, `GET /api/models/routing` | Inspector brief, on open | Unchanged: Inspector › 简报, on open and after a mission start |
| `POST /api/pentest/sessions/{sid}/autopilot/stop` | Header menu, sent on click | Header menu, sent after the confirmation dialog |

The elapsed-time readout in the header is computed from the progress events the page already loads; it issues no
request. `node scripts/check-requests.mjs <log> --against <earlier log>` compares two capture logs route by route.

### V3 Phase 4: overview, runtime and composer

The workbench issues the requests it issued in Phase 3. The overview, trace, terminal, inventory and traffic
surfaces were rewritten; their reads were kept. What changed:

| Request | Before | Now |
| --- | --- | --- |
| `GET …/events?source=hook|progress|evidence|bridge&since_seq=0&limit=200` (`?view=raw`) | Terminal: one page per source when the view opens | Same first read. If a source answers a full page, the next page is asked for (`since_seq=<last seq>`), up to 40 pages. While the run is active, each source is asked for what is new every 8 s (`since_seq=<last seq>`); nothing is polled for a run that is not active |
| `GET …/events?source=progress&since_seq=…&limit=200` (`?view=overview`) | Overview step durations, up to five pages | Unchanged (`surfaces/overview/useOverviewData`) |
| `GET …/burp/status`, `GET …/llm-usage`, `GET …/report/summary` (`?view=overview`) | Overview | Unchanged, once each on open and on 重试 |
| `GET /api/pentest/devices?refresh=…` (`?view=overview`) | Overview, when the shell's device list was empty | Unchanged |
| `GET …/api_tree` (`?view=apitree`) | Inventory, on open | Unchanged |
| `GET …/burp/status`, `GET …/burp/plugin?probe=1`, `GET …/events?source=bridge&limit=200` every 8 s (`?view=burp`) | Traffic | Unchanged, including the pause switch |
| `POST …/clue` | Trace composer | `features/composer`, same body (`{text}`). Context chips are prepended to the text as quoted lines; no new field |
| `POST …/approvals/{id}/decide` | Trace entry | Approval row, same body |
| `POST …/autopilot/stop` | Header menu, after confirmation | Also the composer's 停止, through the same confirmation |

The run strip, stage stack, execution monitor and the overview's statement, attention list and recent activity are
computed from data the workbench already loads (`autopilot/status`, `timeline`, `events?source=progress&limit=300`,
`vulns/grouped`, `approvals`); they issue no request.

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

## Real-backend audit (Phase 17)

Run on the machine that hosts the backend, production preview build, token from a mode-600 file.

```sh
cd app && npm ci && npm run build && npx vite preview --port 4173 --strictPort &
JZ_TOKEN_FILE=~/.jz-token JZ_PID=9 JZ_SID=260 JZ_MATRIX_SIDS=260,261,29 DUR=65000 VIEW_DUR=6000 \
  node scripts/real-read-audit.mjs --out ../docs/screenshots/phase-17/real-read.json \
  --cadence ../docs/screenshots/phase-17/request-cadence.json
```

`HOLD_STREAMS` only applies to fixture runs (`check-polling.mjs`); the real backend holds every stream open.

### Result: read audit, real backend, 2026-11-16 (session 260, project 9)

| Check | Result |
| --- | --- |
| Routes × duration, workbench surfaces | 14 × 65 s, 20 × 6 s |
| Duplicate data requests / duplicate stream connections | 0 / 0 |
| Failed requests, page errors, console errors, write attempts on load | 0, 0, 0, 0 |
| `GET /api/pentest/sessions/{sid}/auth_matrix` | 260, 261, 29 → 200 `NO_BASELINE` (260 and 261 were 500 before the backend fix) |
| `/api/feedback` | one read on `/system` |
| `/api/tasks` query variants | 5 separate keys, never merged |
| Polling | every repeating request at 8 s or 30 s, as in the tables below |
| `/api/models/catalog` | 200, 3 items; `/api/models/providers` not requested on the session or agent route (expected, see above) |
| Differences from the fixture baseline | `/tasks` (real task ids in `counts?ids=`), `/agent` (non-numeric agent session id, real event cursor); no other route |

A first run picked session 261 automatically and recorded one 404 for `GET /api/tasks/100409/artifacts`: that task
was deleted in the Phase 16 cleanup. The run above is pinned to session 260, the Phase 16 baseline session.

### Result: write audit, real backend, 2026-11-16

Disposable data: project 11 (reused), task 100413 / session 262 on emulator-5554. Full record:
`docs/screenshots/phase-17/real-write.json`.

| Write | Method and path | Body | Status | Resulting state | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Assessment | `POST /api/tasks` | `{kind:"audit", app_name, apk_path, authorized}` | 200 | task 100413, `done` after about 2 min | `DELETE /api/tasks/100413` → 200, then GET → 404 |
| Session | `POST /api/pentest/projects/11/sessions` | `{task_id, device:"emulator-5554", authorized}` | 200 | session 262, `ready` | `DELETE /api/pentest/sessions/262?force=true` → 200, `closed` |
| Task start | `POST /api/pentest/sessions/262/autopilot/start` | none | 200 | `running`; one finding listed | stop → 200, `stopped`; `com.pentest.demo` uninstalled from the emulator |
| Rule-card state | `POST /api/pentest/sessions/262/vulns/state` | `{id, state:"confirmed"}` | 200 | read back `confirmed` | restored with `{state:"pending"}` → 200, read back `pending` |
| Mission | `POST /api/pentest/sessions/262/mission/start` | `{mode:"replay", max_screens:20, max_minutes:10, run_tests:true, max_tests:5, run_adjudicate:true, max_adjudications:3}` | 200 | `GET …/mission/status` → `done` | closed with the session |
| Source slice | `GET /api/chat/source` | `task_id=100413&path=com/pentest/demo/MainActivity.java` | 200 | 4405 bytes of source | read only |
| Rule-card import / export | none (local only) | — | — | 5 rows exported, 1 card imported, 0 non-GET requests | local storage keys removed |
| Feedback cleanup | `DELETE /api/feedback/{ts}` | — | 200 | Phase 16 row removed | — |

A second disposable pair (task 100414 / session 263, no start, no mission) confirmed the source slice of a relative
component name (`.MainActivity`) in the UI, then was removed the same way.

## Writes (verified on the real backend in Phase 17)

The page audits only load pages. These writes were sent by the write audits with unchanged bodies; results above.

| Method | Route | Body | Trigger | Status |
| --- | --- | --- | --- | --- |
| GET | `/api/feedback` | — | System page, feedback statistics | Routed through the shared client in Phase 15; fixtures only |
| POST | `/api/feedback` | unchanged from before Phase 15 | AI sidebar, feedback buttons | 200 (Phase 16) |
| POST | `/api/tasks` | `{kind:"audit", app_name, apk_path, authorized, device_serial?}` | New assessment, single submit | 200 (Phase 16, Phase 17) |
| POST | `/api/pentest/sessions/{sid}/mission/start` | `{mode:"device"|"replay", max_screens:20, max_minutes:10, run_tests:true, max_tests:5, run_adjudicate:true, max_adjudications:3}` | Workbench header menu | 200, replay mode (Phase 17); device mode not sent |
| GET | `/api/pentest/sessions/{sid}/mission/status` | — | Inspector brief, on open and after a start | 200, reached `done` (Phase 17) |
| POST | `/api/pentest/sessions/{sid}/vulns/state` | unchanged (VulnsPanel) | Findings, rule cards | 200, read back and restored (Phase 17) |
| POST | `/api/pentest/sessions/{sid}/clue` | `{text}` | Agent trace composer | 200 (Phase 16) |

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
| `features/tasks/ArtifactsModal.tsx`, `features/projects/ProjectDetailPage.tsx`, `features/new-audit/NewAuditPage.tsx`, `features/pentest/BurpBridgePanel.tsx` | downloads and uploads |
| `stores/auth.ts` | login |
