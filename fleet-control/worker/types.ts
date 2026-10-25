import type {
  Connection,
  Device,
  Group,
  Job,
  TargetResult,
} from "../shared/domain.ts";
export interface Work {
  job: Job;
  connection: Connection;
  devices: Device[];
  groups: Group[];
}
export interface Outcome {
  state: "succeeded" | "partial" | "failed" | "needs_human" | "result_unknown";
  error: string | null;
  results: TargetResult[];
  devices?: Device[];
  groups?: Group[];
  externalProgramId?: string;
  externalMediaId?: string;
}
export type Progress = (step: string, detail: string) => Promise<void>;
