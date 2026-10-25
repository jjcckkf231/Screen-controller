import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import type { FleetState } from "../shared/domain";
export type Language = "en" | "th";
export type Translate = (english: string, thai: string) => string;
export async function api<T = unknown>(
  route: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + route, {
    method,
    credentials: "same-origin",
    headers: {
      ...(method !== "GET" ? { "X-Fleet-Request": "1" } : {}),
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response
      .json()
      .catch(() => ({ error: `Request failed (${response.status})` }));
    throw new Error(result.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}
interface Context {
  state: FleetState;
  t: Translate;
  lang: Language;
  refresh: () => Promise<void>;
  run: <T>(
    operation: () => Promise<T>,
    message?: string,
  ) => Promise<T | undefined>;
  notify: (message: string) => void;
  navigate: (page: string) => void;
}
export const FleetContext = createContext<Context | null>(null);
export function useFleet() {
  const context = useContext(FleetContext);
  if (!context) throw new Error("Missing fleet context");
  return context;
}
export function formatDate(
  value: string | null | undefined,
  lang: Language = "en",
) {
  return value
    ? new Date(value).toLocaleString(
        lang === "th" ? "th-TH-u-ca-gregory" : "en-GB",
        { dateStyle: "medium", timeStyle: "short" },
      )
    : "—";
}
export function bytes(size: number) {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}
export function canEdit(state: FleetState) {
  return ["owner", "editor"].includes(state.user.role);
}
export function canOperate(state: FleetState) {
  return ["owner", "operator"].includes(state.user.role);
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          "aria-labelledby"?: string;
          "aria-describedby"?: string;
        }>,
        {
          "aria-labelledby": id,
          "aria-describedby": hint ? id + "-hint" : undefined,
        },
      )
    : children;
  return (
    <label className="field">
      <span id={id}>{label}</span>
      {control}
      {hint && <small id={id + "-hint"}>{hint}</small>}
    </label>
  );
}
