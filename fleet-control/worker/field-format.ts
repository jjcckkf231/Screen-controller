export function totalCount(value: string, format: "integer" | "xiaohui_english") {
  const text = value.trim().replaceAll(",", "").replace(/\s+/g, " ");
  const match = format === "integer" ? /^(\d+)$/.exec(text) : /^Total (\d+) Items?$/.exec(text);
  if (!match) throw new Error(`Unrecognized fleet total ${JSON.stringify(text.slice(0, 100))}. Import stopped.`);
  return Number(match[1]);
}

export function fieldValue(value: string | null, format: "text" | "resolution_width" | "resolution_height") {
  if (value === null || format === "text") return value;
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new Error("Unrecognized screen resolution. Import stopped.");
  return match[format === "resolution_width" ? 1 : 2];
}
