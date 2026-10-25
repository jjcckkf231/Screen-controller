# Automatic online status

Sync now discovers the complete device list and reads the online/offline status of every device, including later pages. `detailDeviceIds` in older configuration files no longer limits reading. The configured `expectedAccount` and `accountSelector` are used for device details; no account name needs editing in TypeScript.

An unreadable device remains Unknown, and its settings observation timestamp is cleared. An unreadable optional volume field does not hide a readable status. Account mismatch stops the sync. Online means the status reported by Xiaohui at the time of the read; it does not prove physical display power or video output.

Read access and write permission are separate. This change does not alter permitted targets, batch limits, commissioned commands, or the explicit device list for tested volume writes.

## Update another Windows installation

1. Stop Fleet Studio with `Stop Fleet Studio.cmd`.
2. From the repository directory, run `git pull --ff-only`.
3. Enter `fleet-control` and run `npm ci` and `npx playwright install chromium`.
4. Start `Start Fleet Studio.cmd` and click **Sync**.

Keep your existing `.data` directory and `.data/xiaohui.json`. Your account name must match `expectedAccount` in that file. There is no need to copy real device IDs into the code, rerun live write tests, or use `--enable-tested-volume` to read status. If the login has expired, run `npm run connect` and sign in again.

New installations use the normal observed-example configuration, connect, and import procedure. Reading details is sequential and may take longer for large fleets; Activity shows progress. Failed status reads are reported there. A cloud UI/language change may require an updated mapping.

Validation uses a synthetic browser fixture with six devices over three pages, mixed online/offline states, a missing volume, an unreadable status, and an account mismatch. No live screens were changed for this update.
