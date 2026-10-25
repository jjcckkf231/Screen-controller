# Screen Controller

A Thai/English workspace for managing screen fleets through the Xiaohui Cloud Platform.

The goal is to preserve Xiaohui's features while making everyday work easier: organize screens, prepare content, publish programs, clear content, and manage power schedules from a compact interface inspired by Figma.

## Project goals

- Support fleets of roughly 50–500 screens.
- Provide Thai and English interfaces.
- Simplify creating groups, adding devices, and moving devices between groups.
- Make image/video uploads and program editing easier.
- Clearly distinguish editing or clearing a draft from changing live playback.
- Simplify publishing, replacing, and removing programs.
- Manage weekly power-on/off schedules for individual screens and groups.
- Show each screen's last reported settings on hover, including when those settings were read.
- Use a local Playwright connector to operate the existing cloud interface.

## Current progress — 25 October 2026

An existing local development build, Fleet Studio, includes the interface, persistent storage, a background worker, and a separate training mode.

Verified against the real cloud platform:

- Saved-session reconnection and fleet synchronization.
- Import of device identities, names, dimensions, and firmware.
- Volume changes on five authorized test screens: 100% to 99%, followed by restoration to 100%.
- Cloud read-back of both changed and restored volume values.

The volume adapter is being integrated into the application's job flow. Full UI-to-worker volume acceptance is still pending. Cloud read-back does not independently verify physical audio or playback.

Still to implement or verify against the real platform:

- Complete group hierarchy and device onboarding flows.
- Detailed settings and current program assignments.
- Image/video upload and cloud asset mapping.
- Program creation, editing, publishing, clearing, and removal.
- Power schedules and physical on/off-cycle verification.
- Remaining controls, advanced widgets, and production deployment.

This is an active development project, not a completed replacement for Xiaohui.

## Architecture of the existing local build

| Area | Technology |
| --- | --- |
| Interface | React, TypeScript, Vite |
| Local server | Fastify |
| Storage | PGlite; optional PostgreSQL |
| Cloud connector | Playwright and a separate Node.js worker |
| Validation | Automated application tests and controlled live-device checks |

Commands use explicit target identities, queued jobs, and read-back verification. Unknown outcomes must not be automatically replayed.

## Repository contents

The application source, tests, operational documentation and planning documents are included:

- `fleet-control/`: React app, API, Playwright worker, tests and launch scripts.
- `planning/`: original requirements and automation plan.

See [application setup](fleet-control/README.md) and [operations](fleet-control/docs/OPERATIONS.md). On Windows, install Node.js 24, open `fleet-control`, run `npm ci`, then use `Start Fleet Studio.cmd`. Browser automation also requires `npx playwright install chromium`.

This is a development checkpoint. Account names and device IDs have been replaced with placeholders. Configure and verify your own connector before attempting live operations. Private runtime data, uploaded media, login sessions, backups and live-test evidence are excluded. Documentation that refers to local test evidence describes the development session; those private artifacts are not included here.

## Development priorities

1. Complete the app-to-worker volume workflow on the authorized test fleet.
2. Map detailed settings and group/device workflows.
3. Implement and verify power scheduling.
4. Implement cloud media and program workflows.
5. Run a per-function acceptance checklist, including restoration and failure recovery.
6. Prepare deployment, backup, and operational documentation.

## Local data and credentials

Do not commit login sessions, passwords, environment secrets, database files, backups, logs, uploaded media, or account-specific test evidence. Keep simulated and real fleet operations clearly distinguished.

## License

No license has been selected yet.
