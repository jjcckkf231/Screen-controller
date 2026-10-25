import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Sql } from "./db.ts";
import { fail } from "./db.ts";
import type { User, Role, Device, Group } from "../shared/domain.ts";
import { groupDescendants } from "../shared/domain.ts";

export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function passwordMatches(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export async function createSession(db: Sql, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
    [digest(token), userId],
  );
  return token;
}
export async function currentUser(db: Sql, req: FastifyRequest): Promise<User> {
  const token = req.cookies.fleet_session;
  if (!token) return fail(401, "LOGIN_REQUIRED", "Please sign in.");
  const user = (
    await db.query<User>(
      `SELECT u.id,u.email,u.name,u.role,u.group_ids AS "groupIds" FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.disabled=false`,
      [digest(token)],
    )
  ).rows[0];
  if (!user)
    return fail(401, "LOGIN_REQUIRED", "Your session expired. Please sign in.");
  return user;
}
export function allow(user: User, roles: Role[]) {
  if (!roles.includes(user.role))
    fail(403, "FORBIDDEN", "Your role cannot perform this action.");
}
export function canAccessDevice(user: User, device: Device, groups: Group[]) {
  return (
    user.role === "owner" ||
    user.groupIds.length === 0 ||
    user.groupIds.some((id) =>
      groupDescendants(groups, id).includes(device.groupId ?? ""),
    )
  );
}
export function requireDevices(user: User, devices: Device[], groups: Group[]) {
  if (devices.some((d) => !canAccessDevice(user, d, groups)))
    fail(
      403,
      "FORBIDDEN_TARGET",
      "One or more screens are outside your assigned groups.",
    );
}
