# LED Fleet Control Platform — Project Brief

Status: **planning only**. Updated **24 October 2026**. Previous mockups are design exploration and are not the implementation baseline.

## The goal

Build a modern control platform for a growing fleet of LED screens. The platform should retain the useful capabilities already available in Xiaohui / Little Grey Cloud, while making everyday work much faster, clearer, and less error-prone.

This is not intended to be a reduced “campaign dashboard” that throws away Xiaohui features. It is a redesign of the existing type of system: a more approachable control center for managing screens, content, programs, schedules, media, and operators.

The expected fleet size is approximately **50–500 screens**. The product therefore needs to work well for both a small team managing a few locations and a larger operation with multiple branches, groups, and operators.

## The problem today

Xiaohui has many relevant features, but its navigation and day-to-day flows are difficult to use. Important actions are spread across tables, menus, hidden toolbars, and separate dialogs. The screen program editor is also hard to understand because editing, adding media, layer ordering, and properties are disconnected from one another.

The hardest workflows are currently:

1. Creating a device group or subgroup.
2. Adding or onboarding a new device/player.
3. Assigning existing devices to groups.
4. Editing a program or screen layout.
5. Adding, replacing, and organizing images.
6. Adding, replacing, and organizing videos.
7. Uploading/sending, resetting, and deleting programs with minimal navigation.
8. Editing screen power-on/off schedules for one screen or a group.
9. Checking a screen's current settings by hovering over its icon.

The new platform should make these actions obvious, guided, and safe without removing the advanced capabilities operators may need later.

## Product direction

The experience should borrow the clarity of a Figma-style workspace:

- A clear navigation area for selecting the current part of the system.
- A central workspace for the main task: managing a device list, creating a program, or reviewing media.
- A contextual right-side panel for properties and settings of the selected item.
- Compact toolbars with the most-used actions always visible.
- Advanced controls available when needed, rather than mixed into basic workflows.
- Clear drafts, previews, publish states, and confirmations for actions that affect real screens.

The visual style should be clean, dense but readable, calm, and professional. It should avoid oversized dashboard cards and unnecessary decoration. It should support both English and Thai throughout the actual product, including navigation, guidance, forms, error messages, and screen-management terms.

## Core users

### Fleet administrator

Creates device groups, adds users, manages permissions, checks device health, sets operational standards, and manages large-scale screen settings.

### Content operator

Creates programs, uploads media, edits layouts, schedules content, previews changes, and publishes to a selected group of screens.

### Branch or location manager

May control only their assigned locations. They need a simple view of which screens are online, what is playing, and whether a requested content change has succeeded.

### Reviewer or approver

Checks content before it is published, especially when content policies or multiple teams are involved.

## Main areas of the product

### 1. Devices and fleet operations

This area should be the operational home for every screen/player.

It should retain the important Xiaohui capabilities:

- Device list, device map, and soft-splicing equipment.
- Online/offline state, current program, screen resolution, orientation, storage, firmware, and device history.
- Device actions such as brightness, volume, screen power, screenshots, watermarks, time correction, timezone, restart, scheduled restart, rotation, network settings, and firmware updates.
- Bulk actions and reusable configuration profiles for supported devices.
- Device-group access control and manager assignment.
- Device-specific hardware controls where supported, such as GPS, relays, or face-recognition hardware.

Hovering over a screen icon should open a compact settings card showing its name/group, online status, reported display power state, current reported program, brightness, volume, resolution/orientation, power schedule, timezone, and next expected on/off event where available. Show the last refresh time and any pending changes. Keyboard focus and a tap/click should expose the same card, with quick access to details and power-schedule editing.

The card should display the latest retrieved settings immediately and refresh through the background synchronization service. Unsupported values should be marked unavailable, and old/offline readings should be timestamped. Connection status, actual display power, assigned content, and reported playback are distinct values.

Power schedules should have an easy weekly editor: choose days, set on/off times, copy times to other days, enable/disable a schedule, and apply it to one screen or a selected group. Show existing settings first, mixed values for groups, the device timezone, overnight day boundaries, the next expected events, and results per screen. Confirm Xiaohui/player support before offering multiple time periods or date exceptions. Establish how scheduled wake-up and offline execution behave on the actual hardware.

The redesign should make fleet actions safe. A user should always understand:

- Which devices are selected.
- Whether an action changes live screens.
- Whether an action is reversible.
- Whether the selected devices support the proposed action.

### 2. Groups and locations

Groups should be a first-class part of the interface, not a buried menu.

The interface should support:

- Nested groups and location hierarchy, such as `Thailand → Bangkok → Siam branch`.
- A visible **New group** action.
- Clear naming and parent-group selection.
- Device counts that include devices in child groups when useful.
- Dragging a device to a group as a quick action.
- A keyboard-friendly alternative: select devices, choose a destination group, and move them together.
- Easy rename, reorder, manager assignment, and permissions.

The workflow should feel like organizing folders, while still making it clear that moving a device changes its operational grouping and possibly its access rules or publishing targets.

### 3. Add and onboard a device

Adding a device should be a guided process, not an assumption that a user already understands MagicPlayer settings.

The intended real-world flow is:

1. Open MagicPlayer settings on the physical player.
2. Connect the player to Wi-Fi or Ethernet.
3. Set the player to networked mode.
4. Enter the correct regional server address supplied for the Xiaohui account and the account username.
5. Let the platform identify the player after it connects.
6. Give the device a useful name.
7. Assign it to a group/location immediately.
8. Confirm the resolution, orientation, and basic health before content is sent to it.

The redesigned product should avoid inventing a pairing-code flow unless the actual Xiaohui/MagicPlayer integration supports one. It should clearly distinguish a real discovered device from a demo or simulated device.

### 4. Program editor

The program editor should be the heart of the product. It should make a non-technical operator confident that they are designing the correct thing for the correct screen.

The editor should include:

- A central screen canvas, automatically fitted to the available workspace.
- A visible representation of the physical screen size, resolution, and orientation.
- A left **Layers** panel showing regions and media in a clear, intuitive order.
- A right **Properties** panel for the selected layer or region.
- Direct editing of position, width, height, media fit, timing, volume, text, fonts, colors, and other relevant settings.
- Drag-to-position interaction on the canvas plus exact numeric controls for precision.
- Clear layer selection, visibility, duplication, deletion, and ordering.
- Preview before publishing.
- Draft saving that is separate from publishing to live screens.

Program rows/cards and screen detail panels should provide direct upload/send, reset, and delete actions. The upload/send flow should let the operator choose or prepare a program, preview it, select targets, and see delivery progress without navigating through unrelated sections. Media upload, cloud saving, and delivery to a screen should have clear states within that journey.

**Reset program means clearing its content to start fresh.** Label this action **Clear program**. The planned behavior removes placed images, videos, text, widgets, regions/layers, and playback sequences from the draft while keeping the program name, identity, and screen dimensions. Keep media files in the shared library. Current screen playback and device power schedules stay as they are; publishing the updated content is a separate action.

Deletion must identify whether it removes the cloud library entry, the copy on selected screens, or both where supported. Show affected screens, playlists, and schedules, preserve shared media unless separately selected for deletion, and report the outcome. Verify what happens to current playback and whether recovery is available before promising either behavior.

The editor must preserve Xiaohui’s rich program types and capabilities, including ordinary programs, multi-screen programs, soft-splicing, H5, full-color and single-color programs, recovery/insert programs, templates, program tags, program history, and device-derived screen dimensions.

The layer model should feel natural: the topmost layer in the layer list should visually appear in front. If Xiaohui’s underlying order works differently, the integration layer should translate it rather than forcing users to learn an unintuitive rule.

### 5. Images, videos, and the media library

Media should not require an operator to leave the editor, enter a separate tool, upload a file, return to the editor, find it again, and then insert it.

The desired flow is:

1. Choose **Add image** or **Add video** from the editor toolbar, or select an existing media region.
2. Upload a file from the computer or choose from the reusable media library.
3. Decide clearly whether to:
   - Create a new media region;
   - Replace the selected item; or
   - Add the item to the selected region’s playback sequence.
4. See the result on the canvas immediately.
5. Set fit mode, duration, transition/effect, and video volume in the right panel.
6. Reorder playback items in a simple visible sequence.

The media library should retain Xiaohui functions such as media upload, grouping, search, preview, reuse, documents, music, and content moderation/review states. It should also support images, videos, text, mixed media, clocks, date/time, weather, streaming media, timers, QR codes, buttons, HTML/web content, documents, HDMI input, and supported plugins.

### 6. Publishing, schedules, and playlists

Publishing must be much clearer because it affects real devices.

The product should support:

- Publishing a program to selected devices or groups.
- Previewing the program and targets before release.
- Showing task progress, success, failure, retry state, and publishing history.
- Approval flows when an organization requires them.
- Playback date range, time window, weekday selection, and duration settings.
- Playlists with program ordering, device binding, publish, and sync behavior.

The interface must clearly separate safe update behavior from destructive behavior:

- **Append / update** should be the normal, safe default.
- **Full replacement / sync** should explain that it may clear other content from the target devices and require an explicit confirmation.
- Schedule changes should make it obvious that the updated program needs to be published again.

### 7. Operations, reporting, and administration

The product should keep the operational and administrative features that make a fleet manageable over time:

- Playback count and duration statistics.
- Device and program statistics.
- Task logs, operation history, publishing history, and failure investigation.
- User accounts, roles, two-factor authentication, permissions, storage quotas, and device-group access.
- Separate roles for administrators, editors, device managers, and reviewers.

These features can live behind an **Operations** or **Settings** area, rather than cluttering the primary tasks of content creation and device organization.

## Bilingual product requirement

Thai and English are product requirements, not a future translation task.

The system should:

- Switch language without losing a user’s current work.
- Use consistent terminology across devices, groups, programs, schedules, and publishing.
- Support Thai text correctly in program content and UI labels.
- Avoid awkward literal translations where a familiar Thai operational term is clearer.
- Let teams choose a default language while allowing individual users to change their own preference.

## Integration requirement

The eventual goal is not a standalone mockup. The new platform should connect to the real Xiaohui / MagicPlayer environment so that actions performed in the new interface can affect actual screens.

The integration should only be built after confirming the available, supported mechanism. Possible paths include an official Xiaohui API, a supported enterprise integration, or a controlled browser/service automation layer. It must not depend on brittle hidden-button clicking as the primary long-term architecture if a proper API or supported integration is available.

Before the platform is allowed to send live changes, it should be able to:

- Read devices, groups, and device status.
- Read programs and media metadata.
- Create or update groups.
- Assign devices to groups.
- Create, update, and publish programs.
- Upload or reference media safely.
- Read publishing task outcomes.
- Respect the permissions of the connected Xiaohui account.

The product should always show whether it is connected to Xiaohui, whether it is in draft/demo mode, and whether a pending action will change live screens.

## Success criteria

The project is successful when a typical operator can:

1. Add a new screen and put it in the correct branch group without requiring a technical support person.
2. Find a device, understand whether it is online, and perform appropriate device actions quickly.
3. Create a clean portrait or landscape program without fighting zoom, hidden tools, or disconnected dialogs.
4. Upload an image or video and see exactly how it will look on the selected screen.
5. Build a media sequence and control its order, duration, and fit in one place.
6. Publish to the right group with a clear preview of impact and a visible success/failure result.
7. Use the product comfortably in Thai or English.
8. Access advanced Xiaohui features when needed, without making the core workflow feel complicated.
9. Upload/send, reset, or delete a program directly from its row/card or screen details, with the intended scope and outcome clear.
10. Change a weekly screen power schedule, reuse it across selected screens, and see when the next on/off events will occur.
11. Hover over a screen icon to see its latest reported settings and refresh time, with equivalent access on keyboard and touch devices.

## Current scope and next stages

### Current work: planning and integration discovery

Plan the requirements, workflows, data model, and integration approach. Previous prototypes are discarded design exploration; no current design has been accepted as the build baseline. The detailed delivery sequence lives in `xiaohui-browser-automation-plan.md`.

### Next stage: validate the required workflows

Validate the original six workflows plus program upload/clear/delete, screen power schedules, and settings hover cards. Use the confirmed definition of reset as clearing program content, and establish Xiaohui's empty-draft support and settings/schedule behavior before returning to detailed interface design.

### Integration discovery stage

Confirm how Xiaohui can be connected safely and reliably. Determine whether an official API or supported service is available and document the permissions, endpoints, account setup, and constraints.

### Production build stage

Build the real bilingual platform, connect it to Xiaohui, introduce user access controls, and roll out gradually—starting with read-only device and program visibility before enabling live updates and publishing.

## Important boundaries

- Do not remove Xiaohui functionality just to make the interface look simpler.
- Do not claim that a prototype is connected to real screens when it is not.
- Do not send destructive fleet actions without clear device targets, impact explanation, and confirmation.
- Do not assume a MagicPlayer pairing mechanism that has not been verified in the real platform.
- Keep the platform useful for a fleet of 50–500 screens, not only a single campaign or a few demo devices.
