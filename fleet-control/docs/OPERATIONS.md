# Operations and recovery

## Local service

`Start Fleet Studio.cmd` starts the API and separate worker as hidden background processes and opens your browser. `Stop Fleet Studio.cmd` stops only the processes recorded for this application path. It requests a graceful database shutdown; it does not delete data. The logs and owned process records live under the selected data directory’s `runtime` folder.

Restart after changing server/worker source. Only one server may own a PGlite data directory. The worker talks to the API and never opens the embedded database directly.

Local endpoints bind to loopback by default. Accounts are application-local; no default account/password is created. Sessions expire after 12 hours. There is no email delivery or password-reset flow yet. Keep the owner password safe.

## Back up a local workspace

1. Stop the worker/server using the stop launcher. Confirm the URL is no longer responding.
2. Run `npm run backup` from this folder.
3. The command copies the stopped database, media and secrets to a new timestamped `backups/fleet-…` directory. It does not overwrite an existing backup.
4. Store an encrypted copy off this computer and restrict access. The backup includes the authentication encryption key; anyone with the backup may be able to recover the corresponding browser session.

The backup command refuses to copy a running local database and refuses external PostgreSQL mode. `FLEET_BACKUP_DIR` can select another destination outside the live data directory.

To restore: stop the app; copy the backup’s `data` folder to a **new** workspace data directory; point `FLEET_DATA_DIR` there; start and verify login, counts, media, revisions and queued-job states. Keep the original untouched. Revoke/reconnect cloud authentication if the backup or device was exposed. Do not immediately replay a restored running/unknown job.

## Job recovery

- Only queued jobs are claimable. A single account runs one job at a time.
- A worker holds a 90-second lease, renewed every 20 seconds.
- An expired running/verifying job becomes `result_unknown`, never automatically queued again.
- Pause prevents subsequent jobs from starting. It is not an emergency kill switch for a browser action already in progress.
- Three consecutive non-successful jobs pause the connector for review.
- Cancel is available only before a job starts.
- For unknown/partial results, inspect Xiaohui first. Reconcile exact target IDs and content versions, then submit a new operation only for targets still needing it.
- Training screenshot requests intentionally fail: there is no physical screenshot to return.

## Security model

- Password hashes use salted scrypt; sessions are random, hashed in the database and sent in HTTP-only, same-site cookies.
- Browser mutations require an application request header and a matching Origin when present. Internal routes require a separate high-entropy worker credential.
- Media is served only after login, with content-type sniffing, download disposition for PDFs and byte-range support for video. HTML/SVG uploads are not accepted.
- The interface uses a restrictive CSP, does not execute remote widget content, and cannot be framed by another site.
- Content libraries are workspace-wide. Device-group restrictions apply to device reads/commands, not to hiding particular media or programs.
- Program versions prevent stale saves. Content references and destructive local deletions are transactionally serialized.
- Media referenced by current drafts, saved revisions or publish history is protected from deletion. Unreferenced deletion retains bytes in `trash`.
- Browser sessions are encrypted at rest, but the decryption key is on the same machine. This is not a replacement for full-disk encryption, OS permissions and a managed secret store in production.
- Do not commit `.env`, `.data`, session files, backups or production traces/screenshots to source control.

## External PostgreSQL / container deployment

`DATABASE_URL` switches the API to a PostgreSQL connection pool with the same schema. `compose.yaml` includes PostgreSQL, the server and one worker. The persistent database and file volumes are separate. Set strong `POSTGRES_PASSWORD` and `FLEET_WORKER_TOKEN` values first; use URL-safe values or encode them appropriately in a connection URL.

The Docker daemon was not running during this build, so **container build/start, external PostgreSQL concurrency, TLS and hosted deployment are not verified**. Treat the included files as a deployment starting point, not a production certification.

Before hosting:

1. Provision a trusted host and HTTPS reverse proxy. Keep database/worker endpoints private.
2. Set `PUBLIC_ORIGIN` to the exact HTTPS origin and `SECURE_COOKIES=true`.
3. Complete owner setup before making the app reachable by other people.
4. Mount private persistent storage, provision managed secrets, and install the exact browser version matching Playwright.
5. Make logical PostgreSQL backups with `pg_dump`, plus a coordinated archive of uploads and secrets; run a restore drill.
6. Add observability, disk quotas/retention, credential rotation, password recovery and a production access review.
7. Run this test suite against the hosted stack, then the live test-player matrix.
8. Verify vendor automation permission and integration reliability before production rollout.

This application is not an emergency safety controller. Have an independent way to recover power/network access to your screens.
