# Implementation status — 25 October 2026

The user requested **build first, connect the test fleet next, then test every function**. This release follows that sequence. It is a functional local acceptance build, not a claim of complete Xiaohui feature parity or production readiness.

## Coverage

**Live update:** Read-only Xiaohui connection now works for YOUR_XIAOHUI_ACCOUNT: 15 real devices imported, saved-session reconnection verified, and the app's Sync button completed through the background worker. Names, IDs, dimensions and firmware are mapped. Detailed settings and write workflows remain pending. See [connection evidence](CONNECTION-PROGRESS.md). Latest local suite: 29 tests passed; TypeScript/build passed.

| Area                                  | Local application / training                                                                                  | Real Xiaohui / screens                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Thai/English workspace                | Implemented; language switch exercised in browser                                                             | Independent of vendor language; vendor selectors still need mapping                                                 |
| Accounts, roles, group restrictions   | Implemented and server-tested                                                                                 | Dedicated cloud account still required                                                                              |
| Groups/subgroups, rename, move        | Queued training operations verified                                                                           | Actual controls and nested-tree read-back pending                                                                   |
| Add device                            | Training device creation; accurate onboarding guidance                                                        | MagicPlayer enrollment/player menus need confirmation                                                               |
| Settings hover/focus and inspector    | Implemented from timestamped cached observations; no hover-triggered browser jobs                             | Exact live field extraction pending                                                                                 |
| Media upload/review/folders           | Real local uploads, checksums, duplicate detection, protected files                                           | Cloud processing, asset-ID mapping and codecs pending                                                               |
| Program editor                        | Local save, layers, positions/sizes, media ordering, text, visibility, locking, undo/redo and browser preview | Full vendor editor translation pending                                                                              |
| Clear program                         | Implemented and tested: identity/dimensions/media/screens preserved                                           | Exact cloud clear/save behavior pending                                                                             |
| Delete/archive                        | Recoverable local archive and separate screen-removal jobs                                                    | Cloud-library deletion is not commissioned                                                                          |
| Power schedules                       | Validation, timezone/overnight logic, bulk targets and simulated read-back verified                           | Actual form mapping, timezone rules and physical on/off cycle pending                                               |
| Publish/replace/remove                | Frozen snapshots, confirmation, per-target training outcomes, approval and recovery checks                    | Actual upload/publish flow and physical playback pending                                                            |
| Playlists/playback schedules          | Local authoring and training job support                                                                      | Vendor binding, ordering/date semantics pending                                                                     |
| Multi-screen, splicing, H5, LED types | Draft models and multiple-layout editing exist                                                                | Vendor encoding/rendering/synchronization not validated                                                             |
| Advanced widgets                      | Editable draft type/source retained; explicit placeholder preview                                             | Weather, stream, QR, timer, button, document rendering, HDMI and plugin-specific behavior not implemented/validated |
| Brightness/volume/rotation/power      | Validated training controls                                                                                   | Player-specific support/read-back pending                                                                           |
| Restart/screenshot                    | Training restart path; screenshot correctly reports unavailable                                               | Actual reboot proof/screenshot artifact adapter pending                                                             |
| Activity/audit                        | Durable jobs, events, per-target results and owner audit                                                      | Not physical proof-of-play analytics                                                                                |
| Device-program import                 | Generic device/settings reader framework                                                                      | Existing cloud program/media import is not implemented                                                              |
| Local persistence                     | Embedded PostgreSQL, files, accounts and restart recovery tested                                              | External PostgreSQL/hosted restore not yet tested                                                                   |
| Deployment                            | Windows launchers, backup command, container templates                                                        | No public deployment or production host configured                                                                  |

## Verification evidence

Latest local verification: **28 domain/API/recovery/scale tests passed; the end-to-end browser workflow passed; TypeScript and production build passed; dependency audit reported no known vulnerabilities.** The build emits a non-blocking bundle-size advisory. These results apply to this local build, not to the pending real-cloud integration.

- Automated domain/API tests cover setup/auth/CSRF, disconnected writes, explicit training mode, uploads/ranges, stale saves, revisions, duplicate-click idempotency, queued groups, scoped permissions, overnight schedules, partial/offline outcomes, immutable publish snapshots, clearing, restoration and expired leases.
- Browser acceptance uses a real local API, database and separate worker, not mocked network responses. It exercises upload → approve → edit → save → preview → clear → restore → training groups/moves → overnight schedule → simulated publish → unsaved-navigation protection → Thai language switch → activity → reload.
- Screenshots are under `test-results/` after browser tests. This folder is regenerated by subsequent runs.
- Dependency audit initially identified a vulnerable file-serving package. It was upgraded to a patched version; re-run `npm audit` for the current result.
- The 500-screen local training test completed an exact-target bulk operation with 499 verified simulated results and one correctly reported offline exception. This is not a live-cloud throughput benchmark.
- Backup/recovery tests verify a stopped database and uploaded-file restore into a separate directory, while active server ownership blocks backup. The Windows start/stop launcher and local health endpoint were checked. Docker Compose configuration validates, but the container runtime was not started.
- Published screen previews use immutable published versions, not the latest mutable draft. Unknown live program versions do not get a guessed draft thumbnail.

The test suite and build must be re-run after further changes. A green local test does not validate a live selector recipe.

## Remaining release gates

1. Observe and commission the real test-account workflow mappings, without inventing locators.
2. Implement the vendor-specific adapters listed as pending above; preserve the original feature inventory rather than silently dropping features.
3. Connect only the explicitly selected test players, verify their identity/settings, and keep a small allowlist/batch limit.
4. Run each function’s acceptance matrix with cloud evidence and physical-screen evidence.
5. Complete hosted deployment, load/reliability tests, backup restoration, security/access review and operational recovery.
6. Roll out gradually to the production fleet only after the preceding gates pass.

No real Xiaohui mutation or live power-schedule change has been performed by this build.
