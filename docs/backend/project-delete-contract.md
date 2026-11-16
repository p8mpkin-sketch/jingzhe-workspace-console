# Backend contract: project delete

Status: implemented in Phase 18 in the backend working tree (`apk_scan-agent`, `APK-Sec-Web/backend`, files `db.py`
and `pentest_api.py`), not committed there; the patch is saved on the backend host. Before Phase 18 the backend had
no project delete function and no `DELETE /api/pentest/projects/{id}` route. The frontend does not call this endpoint and gains no
UI for it; it exists so that disposable audit projects can be cleaned up through the API instead of by editing
the database.

## Endpoint

`DELETE /api/pentest/projects/{id}?force=true`

| Condition | Status | Body |
| --- | --- | --- |
| Caller is not `super_admin` or `org_admin` (`require_admin`), or is an `org_admin` outside the project's org (the project table has no org column, so the org of its sessions is used) | 403 | — |
| `force=true` missing | 400 | `{"status":"error","error_class":"FORCE_REQUIRED"}` |
| `mode=hard` requested | 400 | `{"status":"error","error_class":"HARD_DELETE_UNSUPPORTED"}` |
| Project missing or already deleted | 404 | — |
| A linked session has live autopilot (`running` / `waiting_login`) or a running job, or a task linked to its sessions is `queued` / `running` | 409 | `{"status":"error","error_class":"PROJECT_BUSY","blocking":{…ids}}` |
| A linked session is not `closed` | 409 | `{"status":"error","error_class":"PROJECT_HAS_OPEN_SESSIONS","sessions":[…]}` |
| Otherwise | 200 | `{"status":"ok","id":…,"mode":"soft","retained":{"sessions":n,"apps":n,"runs":n,"reports":n,"candidates":n,"discovery_jobs":n}}` |

The request never closes sessions or stops work on the caller's behalf; the caller resolves a 409 first.

## Behavior

- Soft delete only: `pentest_projects.status = 'deleted'`, `updated_at = now`. No schema change (the `status`
  column exists, default `draft`).
- `list_projects()` and `get_project()` take `include_deleted=False`, so the API hides `status = 'deleted'`:
  `GET /api/pentest/projects` leaves it out and the per-project routes (`/overview`, `/sessions`, …) return 404.
  `list_projects` has one caller (`GET /api/pentest/projects`). There is no `GET /api/pentest/projects/{id}` route,
  so that bare path answers 405, before and after this change.
- No child row is modified or deleted: sessions, tasks, reports, apps, runs, candidates, candidate evidence and
  discovery jobs stay as they are. The response says how many were retained.
- Audit: `db.log_action("project_delete", user=…, detail="#id name mode=soft retained=…", ip=…, org_id=…)` and
  `db.notify_admins(kind="danger", …)`, the same pattern as `DELETE /api/tasks/{id}`.

## Rollback

Code: reverse the backend patch and restart. Data: a soft-deleted project is restored by setting its `status` back
(through an admin API or by the backend owner); nothing else changed.

## Verification of the first use (project 11), real backend, 2026-11-16

| Check | Result |
| --- | --- |
| `GET /api/me` | 200 |
| `auth_matrix` sessions 260 / 261 / 29 | 200 `NO_BASELINE` |
| `DELETE /api/pentest/projects/11` | 400 `FORCE_REQUIRED` |
| `DELETE …/11?force=true&mode=hard` | 400 `HARD_DELETE_UNSUPPORTED` |
| `DELETE …/11?force=true` | 200, `mode: soft`, retained sessions 3, apps 0, runs 0, reports 0, candidates 0, discovery jobs 0 |
| `GET /api/pentest/projects` | ids 10 … 1, project 11 absent |
| `GET …/11/overview`, `GET …/11/sessions` | 404 |
| Second `DELETE …/11?force=true` | 404 |
| Audit log | one `project_delete` entry for #11, mode soft |
| Sessions 261 / 262 / 263 | present, `closed`, still linked to project 11 |
| 403 for a non-admin caller | not tested: no non-admin token was available, and creating a user was not authorised |
