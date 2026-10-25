import type {
  Device,
  Group,
  Media,
  PowerSchedule,
  Program,
} from "../shared/domain.ts";
import type { Outcome, Progress, Work } from "./types.ts";

/** A separate deterministic provider for offline acceptance testing, never a live adapter. */
export async function executeTraining(
  work: Work,
  progress: Progress,
): Promise<Outcome> {
  const { job } = work,
    p = job.payload;
  const result: Outcome = {
    state: "succeeded",
    error: null,
    results: [],
    devices: [],
    groups: [],
  };
  await progress(
    "prepare",
    "Training provider only. No Xiaohui browser or real screen is contacted.",
  );
  if (job.command === "sync_fleet") {
    result.devices = structuredClone(work.devices);
    result.groups = structuredClone(work.groups);
  }
  if (job.command === "create_group")
    result.groups = [
      {
        id: p.id as string,
        name: p.name as string,
        parentId: p.parentId as string | null,
        externalId: "TRAIN-GROUP-" + p.id,
        version: 1,
      },
    ];
  if (job.command === "rename_group") {
    const group = work.groups.find((g) => g.id === p.id);
    if (!group || group.version !== p.version)
      return {
        ...result,
        state: "failed",
        error: "Training group changed before the job ran.",
      };
    result.groups = [{ ...group, name: p.name as string }];
  }
  if (job.command === "upload_media")
    result.externalMediaId = "TRAIN-MEDIA-" + (p.media as Media).id;
  if (job.command === "sync_program" || job.command === "publish_program")
    result.externalProgramId = "TRAIN-PROGRAM-" + (p.program as Program).id;
  for (const id of job.targetIds) {
    const original = work.devices.find((d) => d.id === id);
    if (!original) {
      result.results.push({
        id,
        state: "failed",
        message: "Player no longer exists in the training provider.",
      });
      continue;
    }
    if (
      !original.online &&
      !["move_devices", "rename_device"].includes(job.command)
    ) {
      result.results.push({
        id,
        state: "failed",
        message: "Training player is offline. No write was performed.",
      });
      continue;
    }
    const device: Device = structuredClone(original);
    if (job.command === "move_devices")
      device.groupId = p.groupId as string | null;
    if (job.command === "rename_device") device.name = p.name as string;
    if (job.command === "set_power_schedule") {
      device.settings.powerSchedule = p.schedule as PowerSchedule;
      device.desiredSchedule = p.schedule as PowerSchedule;
      device.scheduleStatus = "verified";
    }
    if (job.command === "device_control") {
      if (p.action === "screenshot") {
        result.results.push({
          id,
          state: "failed",
          message:
            "A simulated player has no real screenshot. Use program Preview to inspect the draft.",
        });
        continue;
      }
      if (p.action === "power") device.settings.power = p.value as "on" | "off";
      if (
        p.action === "brightness" ||
        p.action === "volume" ||
        p.action === "rotation"
      )
        device.settings[p.action] = p.value as number;
    }
    if (job.command === "publish_program") {
      const program = p.program as Program,
        assignment = {
          id: program.id,
          name: program.name,
          version: program.version,
        };
      device.assignedPrograms =
        p.mode === "replace"
          ? [assignment]
          : [
              ...(device.assignedPrograms ?? []).filter(
                (p) => p.id !== program.id,
              ),
              assignment,
            ];
    }
    if (job.command === "publish_playlist")
      device.assignedPrograms = (p.programs as Program[]).map((p) => ({
        id: p.id,
        name: p.name,
        version: p.version,
      }));
    if (job.command === "remove_program")
      device.assignedPrograms = (device.assignedPrograms ?? []).filter(
        (assigned) => assigned.id !== p.programId,
      );
    if (
      ["publish_program", "publish_playlist", "remove_program"].includes(
        job.command,
      )
    ) {
      device.settings.programId = device.assignedPrograms?.[0]?.id ?? null;
      device.settings.programName = device.assignedPrograms?.[0]?.name ?? null;
      device.settings.programVersion =
        device.assignedPrograms?.[0]?.version ?? null;
    }
    device.settings.observedAt = new Date().toISOString();
    device.settings.source = "training";
    device.lastSeenAt = device.settings.observedAt;
    // Read back the provider result; a simulation still exposes per-target outcomes.
    result.devices!.push(device);
    result.results.push({
      id,
      state: "succeeded",
      message: "Verified in training provider only.",
      evidence: { source: "training", observedAt: device.settings.observedAt },
    });
  }
  await progress(
    "verifying",
    "Checking the resulting training-provider records.",
  );
  const failures = result.results.filter((r) => r.state !== "succeeded").length;
  if (failures) {
    result.state = failures === result.results.length ? "failed" : "partial";
    result.error = `${failures} training target(s) did not complete.`;
  }
  return result;
}
