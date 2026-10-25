# Xiaohui Screen Fleet Platform — Planning Baseline

Status: **planning only**  
Requirements updated: **24 October 2026**  
Target fleet: **50–500 screens**  
Languages: **Thai and English**  
Proposed integration fallback: **Playwright browser automation for led-cloud.com**

## 1. What we are building

We want a new, easier control system for a fleet of LED screens managed through Xiaohui / Little Grey Cloud and MagicPlayer.

The new product will provide a clean bilingual interface for operators. It will preserve the useful capabilities of Xiaohui while reorganizing them into workflows that are easier to understand. The highest-priority workflows are:

1. Create and manage device groups.
2. Add and onboard a new MagicPlayer device.
3. Move one or many devices into a group.
4. Create and edit screen programs/content.
5. Upload, place, replace, and sequence images.
6. Upload, place, replace, and sequence videos.
7. Preview, schedule, approve, and publish content to the correct screens.
8. See whether every operation succeeded or failed.
9. Quickly upload/send, reset, and delete programs with clearly defined scope.
10. View and change screen power-on/off schedules for individual screens or selected groups.
11. Hover over a screen icon to inspect its current reported settings without leaving the fleet view.

This is not currently a UI-design project. We are returning to the planning and technical-discovery phase. Previous mockups are not requirements and should not drive implementation decisions.

## 2. What “connected to Xiaohui” should mean

The finished platform must do more than display sample data. A connected system should be able to:

- Sign in to the correct Xiaohui account securely.
- Read real devices, groups, online/offline states, resolutions, and current programs.
- Create, rename, and organize groups.
- Move devices between groups.
- Read programs and media metadata.
- Upload media.
- Create or edit supported programs.
- Clear a program's content to start fresh while keeping the program and its screen dimensions; delete a program within a clearly selected scope, after verifying which operations Xiaohui supports.
- Publish programs or playlists to selected devices/groups.
- Read and update device power-on/off schedules and their timezones.
- Read settings for each screen and expose the latest reported values in its hover card.
- Read the resulting task status and report success or failure.
- Keep an audit record showing who requested each action, which screens were targeted, what changed, and what Xiaohui returned.

An operator pressing a button in our platform should create an internal job. A protected integration worker should carry out that job in Xiaohui and verify the result. The frontend should never claim success merely because it clicked a Xiaohui button.

### Priority workflow: upload, reset, and delete programs

Provide these actions directly on a program row/card and in the selected screen's detail panel. The intended experience is a short path from selecting a program to choosing its targets and seeing the outcome.

| Action | Planned flow | Result to show |
| --- | --- | --- |
| Upload / send program | Choose an existing program, or add media and prepare one → preview → select screen(s)/group → send | Progress and outcome per target, with the submitted program version |
| Reset / clear program | Select a program → choose Clear program → confirm clearing its content | An empty draft that keeps the program name and screen dimensions; publishing remains a separate action |
| Delete program | Select program(s) → show usage and deletion scope → confirm → remove | Whether the library entry or selected device copies were removed, and any remaining references |

**Confirmed meaning of reset:** clear the selected program's content so the operator can start again. Use **Clear program** as the visible action label. The planned behavior removes placed images, videos, text, widgets, regions/layers, and their playback sequences from the draft while preserving the program name, identity, and screen dimensions. Media files remain available in the shared library. Clearing a draft leaves current screen playback and device power schedules unchanged; publishing is a separate action. This definition replaces the earlier open question about reset.

Uploading media, saving a program in the cloud, and delivering it to a screen are separate stages of the same user journey. Label each stage plainly. Native program-file import should only be offered if the supported format and Xiaohui import path are verified; do not assume an arbitrary program file can be imported.

Deletion needs an explicit location: the cloud program library, a selected screen's stored programs, or both if supported. Show affected playlists, schedules, and screens. Verify what happens to content already playing and whether recovery is supported before promising either behavior. Preserve shared media unless the operator also chooses to remove those assets.

Bulk upload/send and deletion should preserve the selected targets and report partial results. Keep routine actions close to the content they affect, with a concise impact confirmation for deletion or live replacement.

### Priority workflow: screen power-on/off schedules

Make **Power schedule** directly accessible from a screen or selected group. Start by displaying its existing settings, then allow the operator to edit them in one panel.

The proposed flow is: select screens → review existing schedule → choose days and on/off times → review the next on/off events → apply → show the result for each screen.

The planned controls are:

- An enabled/disabled switch for automatic power scheduling.
- A simple weekly view with readable time inputs, presets such as every day or weekdays, and copy-to-other-days.
- A clear distinction between disabling a schedule and choosing an always-on setting; the actual supported device behavior must be verified.
- Overnight periods, such as Friday 18:00 to Saturday 02:00, with the ending day shown explicitly.
- The device timezone beside the times. New Thai-site drafts may default to Asia/Bangkok; existing device timezones must be read and shown before applying a change.
- Apply to one screen or a selected group, with an affected-screen count and per-screen outcome.
- A “Mixed schedules” state when selected screens have different settings, followed by an explicit choice to replace them with a common schedule.
- The next expected on/off event and the source of the applied schedule. A group-level editor initially means applying the schedule to a fixed selection; ongoing inheritance and treatment of future group members are separate product decisions.
- Multiple periods, date exceptions, and temporary overrides only where Xiaohui and the player support them; otherwise show the supported limits.

Power scheduling belongs to device settings. Program playback schedules remain in the content workflow. Discover whether Xiaohui's off command blanks the display, puts the player into standby, or shuts down hardware, and whether timed wake-up works in that state. Do not offer a hard shutdown as a routine screen-off action until wake-up behavior has been tested on the relevant player model.

Prefer writing the schedule through Xiaohui's existing timed-power function so the platform/player performs the future events. Establish where the schedule executes and whether it survives a worker outage, network loss, or player restart. If a function instead requires our service to issue timed commands, document that availability dependency before including it.

Track a requested change separately from the latest settings reported by Xiaohui/device readback. A saved cloud setting alone does not establish that an offline player has received it. Show pending, applied/verified, failed, or unconfirmed states using the evidence the platform actually exposes.

### Priority workflow: screen settings on hover

Hovering over a screen's icon in a grid, list, or map should show a compact information card. Keyboard focus and a tap/click must offer the same information. The card should remain reachable while the pointer moves into it and provide **Open details** and **Edit power schedule** actions.

Planned card contents, subject to available readback:

- Screen name, device ID, group/location, and connection status.
- Reported display power state, when available. Connection status and display power are separate fields; an online player may have its display off.
- Current reported program or playlist, distinguished from content merely assigned or awaiting delivery.
- Brightness and volume.
- Resolution and rotation/orientation.
- Power schedule summary, schedule enabled state, timezone, and next expected on/off event.
- Last successful settings refresh, any pending changes, and a refresh/details action.

Use the same underlying settings snapshot in the hover card and the full detail panel. Show the essential values first, and put longer configuration details in the panel. Missing values should say “Unavailable”; offline/stale values should show when they were last reported.

For a 50–500-screen fleet, show the last retrieved snapshot immediately. Background jobs refresh snapshots at a measured, configurable cadence, and an explicit refresh can request a newer reading. Merge repeated requests for the same screen and reuse an in-progress refresh. Moving the pointer across icons should not launch a new Playwright browser job for every hover.

## 3. Integration strategy: API first, Playwright fallback

### Preferred path: supported API

Before committing to browser automation, contact the Xiaohui/Huidu provider and ask for:

- Official public or enterprise API documentation.
- Authentication method and account requirements.
- Device, group, program, media, playlist, publishing, task-status, and reporting endpoints.
- Rate limits and concurrency limits.
- Webhooks or polling guidance.
- Sandbox/test account availability.
- Written confirmation that the intended integration is permitted.

If a supported API covers a workflow, use the API for that workflow. It will generally be more stable, faster, and easier to verify than simulating UI actions.

### Fallback path: Playwright worker

If Xiaohui does not provide a sufficient API, Playwright can automate the website by opening Chromium, locating controls, filling forms, uploading files, clicking actions, and reading the result.

The official Playwright repository describes the library as a browser-automation framework and specifically offers the `playwright` package for automation scripts. Playwright also supplies auto-waiting, user-facing locators, browser-context isolation, saved authentication state, file uploads, and execution traces. These features make it a reasonable tool for a controlled proof of concept.

However, Playwright does not turn the website into a stable API. The automation can break when Xiaohui changes button text, table structure, dialogs, navigation, or authentication. Browser automation must therefore be isolated behind an adapter and treated as a replaceable integration method.

## 4. Recommended system architecture

```text
Operator
   │
   ▼
Thai/English web application
   │ creates a requested change
   ▼
Application API + permissions + validation
   │
   ├── PostgreSQL: users, screens, groups, jobs, audit history
   ├── Object storage: approved images/videos and generated artifacts
   ├── Secret manager: Xiaohui credential/session references
   └── Job queue
          │
          ▼
Integration worker
   ├── Official Xiaohui API adapter, when available
   └── Playwright Xiaohui adapter, when necessary
          │
          ▼
led-cloud.com / Xiaohui
          │
          ▼
Verification + task-status readback + evidence
          │
          ▼
Job result shown to operator
```

### Frontend

Responsibilities:

- Thai/English interface.
- Device/group/program/media workflows.
- Draft editing and previews.
- Clear selection of live targets.
- Permission-aware actions.
- Confirmation for risky operations.
- Job status and failure explanations.

Suggested implementation: React or Next.js with TypeScript. The exact framework is less important than having a typed API contract and a clear separation between drafts and live operations.

### Application API

Responsibilities:

- Authentication and user roles.
- Validate commands before they reach Xiaohui.
- Convert user requests into immutable jobs.
- Issue idempotency keys so a retry cannot accidentally duplicate a live action.
- Store desired state separately from observed Xiaohui state.
- Enforce screen/group allowlists.
- Require approval when policy says it is necessary.

Suggested implementation: TypeScript on Node.js. Using TypeScript for both the application and worker keeps shared job contracts and device/program types consistent.

### Database

Use PostgreSQL for durable operational state. Initial entities:

- `users`
- `roles`
- `permissions`
- `xiaohui_accounts`
- `device_groups`
- `devices`
- `programs`
- `program_versions`
- `media_assets`
- `playlists`
- `schedules`
- `device_settings_snapshots` — reported settings, source, and observation timestamps, including unavailable fields.
- `device_power_schedules` — requested and observed rules, enabled state, timezone, affected devices, and verification state.
- `automation_jobs`
- `automation_attempts`
- `approvals`
- `audit_events`

Local database records should cache Xiaohui information but must include `last_synced_at`, `source`, and `external_id`. The UI must not represent stale cached status as live status.

### Job queue

Use a durable queue such as Redis/BullMQ or a managed queue. Each command becomes a job with a state machine:

```text
draft → validated → awaiting_approval → queued → running
      → verifying → succeeded
                  → failed
                  → needs_human
                  → result_unknown
```

Do not automatically retry a job whose first attempt may already have changed Xiaohui unless the worker can first verify whether the requested final state already exists.

### Playwright worker

Use the Playwright library for runtime automation and Playwright Test for regression testing of the integration adapter.

Initial choices:

- TypeScript.
- Chromium only, because the target is one web application rather than a public cross-browser product.
- One active mutation job per Xiaohui account until concurrency behavior is understood.
- A dedicated Xiaohui automation account with the minimum required permissions.
- Headed mode during discovery; headless mode only after workflows are stable.
- Version-pin Playwright and the browser image. Upgrade intentionally after testing.

The worker should not be deployed inside the frontend web process. A stuck browser, expired session, or changed UI should not take down the main application.

## 5. How one automation job should work

Example: move three devices to the “Siam branch” group.

1. The operator selects three devices and the destination group.
2. The frontend shows the exact target devices and proposed destination.
3. The API verifies that the operator can manage all selected devices.
4. The API creates an immutable job with an idempotency key.
5. The queue assigns the job to the Xiaohui worker.
6. The worker obtains the correct account lock.
7. The worker opens an authenticated browser context.
8. It confirms the account identity and current Xiaohui page.
9. It reads the current group of each device.
10. Devices already in the destination are recorded as no-ops.
11. It performs the Xiaohui UI steps for the remaining devices.
12. It reads the device list again and verifies the final group for every device.
13. It records structured results and before/after evidence.
14. The operator sees `Succeeded`, `Partially succeeded`, `Failed`, or `Needs attention`.

The job is successful only after verification, not after the click.

## 6. Playwright automation design

### Page objects and task modules

Keep Xiaohui-specific selectors inside page objects instead of spreading selectors through the product code.

Proposed modules:

```text
xiaohui/
  auth.ts
  navigation.ts
  device-list.page.ts
  device-details.page.ts
  power-schedule.page.ts
  groups.page.ts
  media-library.page.ts
  program-list.page.ts
  program-editor.page.ts
  playlists.page.ts
  publishing.page.ts
  tasks.page.ts
  locators.ts
  errors.ts
```

Higher-level commands call these modules:

```text
readFleet()
readDeviceSettings(deviceId)
readPowerSchedule(deviceId)
setPowerSchedule(input)
setPowerScheduleEnabled(input)
createGroup(input)
renameGroup(input)
moveDevices(input)
uploadMedia(input)
createProgram(input)
updateProgram(input)
clearProgramContent(input) # empty the draft; preserve program identity and dimensions
deleteProgram(input)      # explicit library/device scope and target IDs
publishProgram(input)
readTaskResult(input)
```

This adapter becomes the only part of the system that knows how to click Xiaohui’s interface. If a supported API becomes available later, an API adapter can implement the same command contract.

### Locators

Prefer locators based on roles, labels, visible names, and stable product identifiers. Playwright’s guidance recommends user-facing locators and warns that CSS classes and DOM structure are more fragile.

Rules:

- Prefer `getByRole`, `getByLabel`, and stable IDs when present.
- Scope locators to the relevant dialog, table row, or panel.
- Do not use screen coordinates.
- Avoid long CSS paths, generated class names, and XPath.
- Avoid `.nth()` for important actions unless the surrounding row is uniquely identified first.
- Handle English and Chinese/other Xiaohui UI labels through a locator dictionary if the account language can change.
- Assert that a locator matches exactly one intended element before a live mutation.
- Do not force-click through an unexpected overlay; treat it as a changed or blocked state.

### Waiting and verification

Use Playwright’s auto-waiting and web-first assertions. Do not add arbitrary sleeps as the normal synchronization method.

After every meaningful action, verify a user-visible postcondition. Examples:

- After group creation, search/read the group tree and confirm the new group exists once.
- After moving a device, reopen/filter the destination group and verify the device’s group.
- After media upload, confirm the exact filename, file size/type if available, and completed upload status.
- After publishing, capture the Xiaohui task identifier and poll the task page until a terminal state or timeout.
- After a power-schedule change, reopen the setting and compare enabled state, days, periods, and timezone. Record separately whether device acknowledgement is available.
- After a program reset/delete, read back the agreed scope and check that unrelated programs and shared media are unchanged.
- For hover settings, record the value's source and observation time; preserve unknown/unavailable states instead of substituting a default.

### Authentication

Playwright supports saving and reusing authenticated browser state. Its documentation warns that the state file can contain sensitive cookies/headers capable of impersonating the account.

Plan:

- Use a dedicated Xiaohui bot account, not a personal administrator account.
- Have an authorized human complete login/MFA during initial session provisioning.
- Encrypt the resulting browser state at rest.
- Store only a secret reference in the database.
- Never commit browser state, credentials, cookies, or screenshots containing secrets to Git.
- Limit filesystem access for the worker process.
- Detect login expiry and move the job to `needs_human`; do not repeatedly attempt passwords or MFA.
- Rotate sessions and credentials under a documented procedure.

### Media upload

The worker should use Playwright’s supported file upload mechanisms: `locator.setInputFiles()` when a file input exists, or wait for the `filechooser` event when the page creates it dynamically. Files should come from controlled object storage and be scanned/validated before the worker receives a temporary local copy.

Validate before upload:

- Allowed file type.
- Maximum size.
- Image/video dimensions.
- Codec and duration when applicable.
- Filename normalization.
- Organization ownership and approval status.
- Checksum so the job can detect an already-uploaded asset.

### Traces and evidence

Enable Playwright traces for failed attempts and selected staging runs. Traces can include DOM snapshots, screenshots, console events, and network activity, which makes them valuable when Xiaohui changes.

Because traces may also capture sensitive data:

- Encrypt them at rest.
- Restrict access to administrators/support.
- Use a retention limit.
- Redact or omit credentials and private account details.
- Keep a structured audit record even when the visual trace expires.

## 7. Safety model

The automation will eventually control real screens, so we need product-level safety rather than relying on careful code alone.

### Environments

Use three modes:

1. **Local/mock mode** — no Xiaohui connection.
2. **Staging/shadow mode** — reads a real account or uses dedicated test devices; mutations are disabled or limited to disposable test data.
3. **Production mode** — enabled per workflow only after acceptance criteria are met.

### Action risk levels

#### Low risk

- Read fleet inventory.
- Read device status.
- Read program and task metadata.
- Preview planned changes.

May run automatically.

#### Medium risk

- Create/rename groups.
- Move devices between groups.
- Upload media.
- Change non-destructive metadata.

Require clear targets and normal operator authorization.

#### High risk

- Publish to live screens.
- Change schedules.
- Power/restart devices.
- Change network/device configuration.
- Replace or synchronize playlists.
- Clear programs or storage.

Require a preview, explicit confirmation, and possibly a second approver. Destructive sync/full-update actions should not exist in the first production release.

### Kill switch and circuit breaker

Provide:

- A global switch that stops new mutation jobs.
- A per-account switch.
- Automatic pause after repeated selector failures, authentication failures, or unexpected pages.
- Maximum target count per job during early rollout.
- A maintenance mode when Xiaohui changes its UI.

When the worker encounters an unknown dialog, duplicate match, or unexpected account/page, it should stop and request human review rather than guessing.

## 8. Observability and support

Every automation attempt should record:

- Job ID and idempotency key.
- Requesting user and approving user.
- Xiaohui account used.
- Exact target device/program/group IDs.
- Requested action and normalized inputs.
- Starting state when observable.
- Each named workflow step and its duration.
- Xiaohui task/result ID where available.
- Final verified state.
- Error category.
- Trace/screenshot reference according to retention policy.
- Playwright, Chromium, worker, and adapter versions.

Useful error categories:

- `AUTH_EXPIRED`
- `ACCOUNT_MISMATCH`
- `TARGET_NOT_FOUND`
- `AMBIGUOUS_TARGET`
- `UNSUPPORTED_DEVICE`
- `XIAOHUI_UI_CHANGED`
- `UPLOAD_REJECTED`
- `PUBLISH_REJECTED`
- `VERIFICATION_FAILED`
- `RESULT_UNKNOWN`
- `NETWORK_FAILURE`

## 9. Product requirements before UI design resumes

We need answers to these questions:

### Business and users

- Who will use the platform first?
- How many operators and approvers?
- Are screens split by customer, brand, branch, or legal entity?
- Which actions require approval?
- Is there one Xiaohui account or several?

### Fleet

- Exact device/player models and firmware versions.
- Screen resolutions and orientations.
- Network reliability at each site.
- Whether devices are already registered in Xiaohui.
- Which hardware-specific features are actually used.
- What power on/off means for each player model, which timed-power rules it supports, and whether wake-up works offline or after restarting.
- Which current settings are readable through Xiaohui and whether each value comes from device readback or a cloud configuration record.

### Content

- Common image/video formats and maximum file sizes.
- Typical program templates.
- Whether the same program is reused at many resolutions.
- Scheduling rules and emergency-content needs.
- Content review/moderation requirements.
- Verify how Xiaohui supports clearing all program content while preserving the program and its dimensions, including whether it can save an empty draft. The product meaning of reset is confirmed as clearing content.
- Whether program deletion should target the cloud library, selected devices, or both, and which usage/recovery information Xiaohui exposes.

### Xiaohui integration

- Official API availability.
- Permission to automate the website.
- Bot/service account availability.
- MFA and session-expiration behavior.
- Account UI language.
- Rate/concurrency restrictions.
- Test devices and disposable programs/groups available for proof-of-concept work.

### Hosting and operations

- Cloud provider or on-premises preference.
- Who can access secrets and traces.
- Backup and recovery requirements.
- Required uptime and support hours.
- Data-retention and audit requirements.

## 10. Phased delivery plan

### Phase 0 — Discovery and permission

Deliverables:

- Feature inventory from the Xiaohui manual and current account.
- List of workflows actually used by the business.
- Vendor/API findings.
- Written automation permission/terms assessment.
- Test-account and test-device plan.
- Risk register.

Exit criteria:

- We know whether API, Playwright, or a hybrid is required.
- We have a safe test target.
- We know how authentication/MFA will work.

### Phase 1 — Playwright feasibility spike

Build a small standalone worker, not the new UI.

Automate only:

1. Human-provisioned login session.
2. Open the device page.
3. Read group names.
4. Read device names, external IDs, online state, resolution, and current group.
5. Store/print normalized JSON.
6. Capture a trace when parsing fails.

On the reserved test device, also establish which settings and timed-power rules can be read without changing them. Record unavailable values and their sources. This determines the hover-card fields and power-schedule editor's supported controls.

Then add one disposable mutation on test data:

7. Create a clearly named test group.
8. Verify it exists.
9. Rename it.
10. Verify the rename.
11. Delete it only if deletion is recoverable or explicitly approved for the disposable test.

Exit criteria:

- Read results are repeatable across at least 20 runs.
- Selectors do not depend on screen coordinates.
- Authentication can be refreshed safely.
- Test mutation is verified, logged, and idempotent.
- A changed or unexpected page fails closed.

### Phase 2 — Read-only fleet service

Build:

- Application API.
- Database and synchronization jobs.
- Read-only fleet interface.
- Device/group search and status.
- Screen-icon hover cards, keyboard/touch access, and timestamped settings snapshots.
- Read-only power-schedule summaries with timezone and next expected events.
- Thai/English framework and terminology glossary.
- Observability and audit log.

Exit criteria:

- Operators can compare the new interface against Xiaohui and find matching devices/groups.
- Stale information is visibly marked.
- Hover cards and device details agree on the same settings snapshot; unavailable fields are labeled and hovering does not flood the browser-worker queue.
- No live mutation is possible.

### Phase 3 — Safe device/group mutations

Add:

- Create/rename groups.
- Move selected devices to a group.
- Rename devices if required.
- Job queue, account locking, idempotency, confirmations, and postcondition verification.
- Maximum target limits and kill switch.

Rollout:

- Test account.
- A small pilot group.
- A few production devices.
- Broader fleet only after measured success.

### Phase 3B — Power-schedule management

Deliver this as a core fleet workflow after device/group mutations, without waiting for the full content editor.

Add the weekly schedule panel, enable/disable control, copy-to-days, single/group targets, mixed-setting display, timezone-aware preview, and per-device result. Implement the discovered Xiaohui timed-power workflow through the adapter and read it back after applying it.

Exit criteria: verify a complete scheduled off/on cycle on a reserved player, plus an overnight period, schedule disabling behavior, device timezone handling, and offline/reconnect behavior. Document whether the player/platform continues executing its schedule when our worker is unavailable.

### Phase 4 — Media library and uploads

Add:

- Controlled image/video uploads.
- Validation, object storage, checksums, and moderation/approval state.
- Xiaohui upload automation and duplicate detection.
- Verification that the uploaded asset appears in the correct account/group.

### Phase 5 — Program editing

Program editing is the hardest area and should not be the first automation target.

Start with constrained templates:

- Known portrait and landscape resolutions.
- Fixed regions with editable media/text.
- Known image/video sequence controls.
- Preview generated by our application.
- Translation from our program model into Xiaohui editor actions.
- A Clear program workflow that empties the draft while preserving program identity, dimensions, and shared media, with publishing handled separately.
- Direct upload/send/reset/delete entry points on programs, with the exact supported deletion scope established during discovery.

Only expand to freeform region editing, multi-screen, soft-splicing, and H5 after the template path is reliable.

### Phase 6 — Publishing and schedules

Add:

- Target selection.
- Impact summary.
- Approval policy.
- Append/update publishing first.
- Task-status readback.
- Partial-failure handling.
- Scheduling and republishing workflow.
- A short upload/send journey from selecting a program to seeing delivery outcomes for each screen.
- Verified program removal from the chosen library/device scope, including behavior for current playback and playlist references.

Keep full replacement/sync disabled until recovery behavior is tested and documented.

### Phase 7 — Advanced capabilities

Add based on actual demand:

- Playlists.
- Multi-screen and soft-splicing.
- H5 programs.
- Device configuration profiles.
- Screenshots and remote operational controls.
- Statistics and reports.
- Hardware-specific features.

## 11. Testing strategy

### Adapter tests

- Page-object locator tests.
- English/other account-language variants.
- Empty lists, pagination, filters, duplicate names, long names, and offline devices.
- Session expiry and unexpected login page.
- Upload success, rejection, timeout, and duplicate asset.
- Xiaohui task success, failure, partial completion, and no result.
- Program clearing removes all placed content while preserving the program, dimensions, shared media, current screen playback, and power schedules; program deletion covers shared media, playlist references, and selected-device scope.
- Power-schedule edits with mixed device settings, different timezones, overnight periods, disabled rules, and unsupported features.
- Cloud-saved versus device-applied settings, including offline devices and interrupted delivery.
- Hover-card freshness, missing values, keyboard/touch behavior, and repeated-hover request coalescing.

### Contract tests

Every adapter must return the same normalized types whether it uses an API or Playwright.

### Staging end-to-end tests

Run against controlled Xiaohui test data. Do not run mutation suites in parallel on one shared account. Playwright’s own authentication guidance notes that shared authentication is unsuitable when parallel work changes server-side state.

### Change detection

Run a scheduled read-only canary that opens key pages and confirms required controls still exist. If the canary fails, pause mutation jobs and alert the operator.

### Manual acceptance tests

Before enabling each production workflow, an operator should verify:

- Thai and English labels.
- Exact targets and impact preview.
- Xiaohui result matches the new app.
- Failure messages are understandable.
- Recovery instructions work.
- Program upload/send/reset/delete is reachable directly from the relevant program or screen, and its resulting state matches the selected scope.
- Operators can edit and reuse weekly power schedules, understand overnight times, and see the next expected event.
- Hovering a screen shows the latest reported settings and refresh time; the same information is available with keyboard focus and touch.

## 12. Suggested repository structure

```text
apps/
  web/                   # Thai/English operator interface
  api/                   # application API and permissions
  worker-xiaohui/        # queue consumer and integration execution
packages/
  domain/                # shared types and rules
  database/              # schema and migrations
  job-contracts/         # versioned job inputs/results
  xiaohui-adapter/       # adapter interface
  xiaohui-playwright/    # page objects and browser implementation
  xiaohui-api/           # future official API implementation
  i18n/                  # English/Thai glossary and translations
tests/
  fixtures/
  adapter/
  staging/
infra/
  containers/
  deployment/
docs/
  decisions/
  runbooks/
  workflows/
```

## 13. Team and approximate effort

For a production MVP, a practical small team is:

- 1 product owner/domain expert.
- 1 product designer with Thai-language support.
- 1 frontend engineer.
- 1 backend/automation engineer.
- Part-time QA and infrastructure/security support.

With an API, delivery may be significantly faster. With Playwright as the main integration and a complex program editor, the work should be treated as a multi-month product, not a weekend script. A narrow read-only feasibility spike can be completed first and used to make a better estimate.

## 14. Immediate next actions

Do these in order:

1. Ask Xiaohui/Huidu or the reseller for API access and automation permission.
2. Create a dedicated Xiaohui test account or least-privilege automation account.
3. Reserve one or two test players/screens and disposable groups/programs.
4. Document the original six workflows plus program upload/clear/delete, power scheduling, and screen-settings hover cards, using the confirmed definition of reset as clearing program content and specifying expected visible results.
5. Build the Phase 1 Playwright feasibility spike in TypeScript.
6. Measure reliability over repeated read-only runs.
7. Test one reversible group mutation with verification and audit evidence.
8. Decide API, Playwright, or hybrid based on evidence.
9. Define the normalized data model and job contracts.
10. Only then return to product flows and interface design.

## 15. Go/no-go decision for the Playwright bot

Proceed beyond the feasibility spike only if:

- The website automation is permitted.
- A dedicated account and test environment exist.
- Authentication can be maintained without unsafe credential handling.
- Critical elements can be located reliably without screen coordinates.
- Each mutation has a readable postcondition.
- Duplicate execution can be prevented or detected.
- Failures stop safely.
- Operations staff accept the maintenance burden when Xiaohui changes its UI.

If those conditions are not met, keep the new application read-only and continue pursuing an official integration.

## References

### Implementation update — 25 October 2026

The user subsequently chose **build the application first, then connect the test fleet and test each function**. A new runnable local acceptance build now exists in `outputs/fleet-control`; the discarded visualization was not reused as the product implementation. It includes durable storage, a bilingual editor/workspace, real local uploads, revisions, a separate job worker, training-provider workflows and a fail-closed Playwright connector framework.

This changes the immediate sequencing above, not the live-integration safety gates. Live account/selector commissioning, exact vendor feature parity, physical-screen tests and production deployment remain pending. See `fleet-control/docs/STATUS.md` for implemented versus pending functionality and `fleet-control/docs/CONNECT-TEST-FLEET.md` for the connection/acceptance procedure. No real fleet action was performed during the local build.

- [Microsoft Playwright repository](https://github.com/microsoft/playwright)
- [Playwright authentication](https://playwright.dev/docs/auth)
- [Playwright locators](https://playwright.dev/docs/locators)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright actions and file uploads](https://playwright.dev/docs/input)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Playwright Docker guidance](https://playwright.dev/docs/docker)
- [Playwright CI guidance](https://playwright.dev/docs/ci)

