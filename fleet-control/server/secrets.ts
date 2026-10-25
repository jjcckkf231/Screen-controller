import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function localSecret(dataDir: string, name: string, length = 32) {
  await mkdir(path.join(dataDir, "secrets"), { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, "secrets", name);
  try {
    return await readFile(file, "utf8");
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const value = randomBytes(length).toString("base64");
  try {
    await writeFile(file, value, { mode: 0o600, flag: "wx" });
    return value;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    return readFile(file, "utf8");
  }
}
export function encryptJson(data: unknown, key: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data)),
    cipher.final(),
  ]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  });
}
export function decryptJson<T>(sealed: string, key: string): T {
  const value = JSON.parse(sealed);
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    Buffer.from(value.iv, "base64"),
  );
  cipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(value.data, "base64")),
      cipher.final(),
    ]).toString(),
  );
}
