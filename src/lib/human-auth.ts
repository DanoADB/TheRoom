import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

export const HUMAN_SESSION_COOKIE = "the_room_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

export function hashHumanSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function secretsMatch(value: string, expectedHash: string) {
  const actual = Buffer.from(hashHumanSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createHumanSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.humanSession.create({
    data: { userId, tokenHash: hashHumanSecret(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function getHumanBySessionToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await prisma.humanSession.findUnique({
    where: { tokenHash: hashHumanSecret(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function getCurrentHuman() {
  const token = (await cookies()).get(HUMAN_SESSION_COOKIE)?.value;
  return getHumanBySessionToken(token);
}

export async function requireHuman(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === HUMAN_SESSION_COOKIE)?.[1];
  const user = await getHumanBySessionToken(token ? decodeURIComponent(token) : undefined);
  if (!user) throw new ApiError(401, "human_unauthorized", "Please sign in to continue.");
  return user;
}

export async function requireHumanRoomMembership(userId: string, roomId: string) {
  const membership = await prisma.roomMembership.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!membership) throw new ApiError(404, "room_not_found", "Room not found or user is not a member.");
  return membership;
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "invalid_origin", "Cross-origin requests are not allowed.");
  }
}
