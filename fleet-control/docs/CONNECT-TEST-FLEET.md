# Connect the test fleet — later, after local review

No real fleet has been connected by this build. Follow this procedure only when the test account/player is available and the owner authorizes test changes.

## 1. Preserve the boundary

- Confirm website automation is permitted for your Xiaohui account. Ask the vendor/reseller about an official API first; no API availability is assumed either way.
- Use one or two disposable test players and a least-privilege dedicated account. Do not start with the production fleet.
- Keep the player powered and network-connected while testing schedule changes; have a recovery route that does not depend on the schedule being tested.
- Stop the training workspace. Copy `.env.example` to `.env`, set `FLEET_DATA_DIR=.data-test-fleet`, and start again. Keep `.data` unchanged so the training workspace is recoverable.
- Create the owner account in the new clean workspace. The database will initially be empty and disconnected.

## 2. Commission a read-only mapping

Copy `config/xiaohui.example.json` to the new data directory as `xiaohui.json`. This example intentionally contains placeholders and disabled commissioning flags. It is **not a working Xiaohui mapping**.

Using the authorized test session, record actual visible DOM locators for:

- One exact account identity field and its expected text.
- Device rows, immutable player IDs, names and the exact total row count.
- Pagination and the visible identity change after moving to the next page.
- Group IDs/names where exposed. The current generic reader imports flat groups; the full nested tree requires a vendor-specific tree reader before hierarchy sync is declared complete.
- Each setting that is genuinely readable: online state, width, height, brightness, volume, rotation, power, timezone, firmware, current program and power schedule.

Never substitute default values for unreadable settings. Unmapped fields remain unknown. A schedule mapping must yield normalized JSON matching `powerScheduleSchema`; if the vendor exposes a form rather than JSON, implement and test a specific form reader instead of pretending the field exists.

The reader requires an exact integer total and rejects incomplete pagination, duplicate player IDs, unknown numeric formats and account mismatch. Use stable IDs/labels, not pixel coordinates or ambiguous row numbers.

Set `fleetRead.commissioned` to true **only after the selectors and full pagination have been tested**. Leave all write workflows disabled at first.

## 3. Save an explicitly authorized login

```powershell
npx playwright install chromium
npm run connect
```

A dedicated visible browser opens. Sign in yourself; do not paste passwords or OTP codes into chat. Press Enter in the local terminal only after the account is correct. The connector checks the exact account field before saving an AES-GCM-encrypted browser state.

If the read mapping is commissioned, the command imports verified device identities into the running workspace. Otherwise it saves the session without enabling live jobs. The connection command is not run automatically by app startup.

Open Settings → Permitted target screens. Initially, **no new imported player is permitted for writes**. Allow only the named test devices and keep the batch limit at 1–2.

## 4. Commission each mutation separately

The generic recipe runner supports navigation, unique-selector clicks, fills, checks, selections, file inputs, text assertions and input-value assertions. It cannot execute arbitrary page JavaScript or shell code. Only validated device external IDs may be substituted into selectors; content goes into fields as data.

For each workflow, record a versioned recipe with:

1. Account verification and exact target-identity verification.
2. Preconditions (target exists, setting is supported, expected version/state).
3. The intended UI interaction.
4. Reopening/reloading the destination, rather than trusting a toast or HTTP 200.
5. Explicit postconditions matching the frozen request.
6. A read-back of the resulting settings or assignment.
7. Observed failure behavior: expired login, CAPTCHA/MFA, changed layout, offline device, timeout before write, timeout after write.

Commission one recipe at a time. A generic selector runner is not equivalent to a fully mapped vendor integration. Complex program upload/editing, multi-screen assignment, playlists, cloud deletion, screenshots, nested group extraction, player-specific power forms and advanced widgets may need dedicated TypeScript adapters. These are still integration work until observed and tested.

Do not mark a workflow commissioned just to make its button work. A timeout after a possible write must remain `result_unknown`, with no blind retry.

## 5. Acceptance checklist

For every item, retain date, operator, player ID, firmware, before/after state and evidence. Record cloud confirmation separately from physical-screen confirmation.

| Function                   | Required evidence                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Read fleet/settings        | Correct account, all pages, exact unique IDs, unknown fields remain unknown                                       |
| Create/rename subgroup     | Exactly one intended group, correct parent, visible after reload                                                  |
| Add player                 | Verified MagicPlayer network/server/account flow; no invented pairing code                                        |
| Move/rename player         | Exact ID moved/renamed; unaffected players unchanged                                                              |
| Image/video upload         | Checksum/file identity, processing status, supported codec, cloud asset ID                                        |
| Program create/edit        | Name, dimensions, every layer, order, media and timing survive save/reopen                                        |
| Clear program              | Layers cleared; same identity/dimensions; original media retained; live playback unchanged until explicit publish |
| Append publish             | Existing assignments preserved and the new assignment appears exactly once                                        |
| Replace publish            | Explicit confirmation; intended assignments replaced only on permitted targets                                    |
| Remove from screens        | Chosen assignment absent; library program and media still present                                                 |
| Power schedule             | Weekdays, timezone, enable/disable, overnight rollover and next events match; observe a real on/off cycle         |
| Mixed/bulk targets         | Per-target result, no silent overwrite of mixed values, offline target reported separately                        |
| Brightness/volume/rotation | Read-back matches requested value; physical output checked                                                        |
| Restart/screenshot         | Actual reboot evidence or returned screenshot artifact, not merely a clicked button                               |
| Playlists/schedules        | Correct ordering/binding/date/time semantics on the player                                                        |
| Interrupt/recovery         | No duplicate publish after connection loss, worker crash or service restart                                       |
| Permissions                | Viewer cannot write; group-scoped operator cannot affect another group; separate approval enforced                |

Only after the single-player matrix passes should you expand to a small test group, then stage a rollout toward 50–500 screens. Do not run a production-wide power or content operation as a smoke test.
