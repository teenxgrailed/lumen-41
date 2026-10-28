import { NextResponse } from "next/server";

import type { SandboxKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { type SandboxCapability, sandboxLockedBody } from "./policy";

export * from "./policy";

/**
 * The central sandbox guard (docs/sandbox-accounts.md). Every refusal goes
 * through here or through the middleware's route table in `./policy`, so a
 * sandbox account gets the same 403 and the same words wherever it knocks:
 * a cookie-session route, a bearer route behind MCP, or a service.
 *
 * Normal accounts pay one indexed read of a nullable column and are otherwise
 * untouched.
 */

/** The account's sandbox kind, or null for every real person. */
export async function getSandboxKind(
  userId: string
): Promise<SandboxKind | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sandboxKind: true },
  });
  return user?.sandboxKind ?? null;
}

export async function isSandboxUser(userId: string): Promise<boolean> {
  return (await getSandboxKind(userId)) !== null;
}

/** The 403 a sandbox account gets for a refused capability. */
export function sandboxLockedResponse(capability: SandboxCapability) {
  return NextResponse.json(sandboxLockedBody(capability), { status: 403 });
}

/**
 * Null when the account may go on; the 403 to return when it is a sandbox.
 * For route handlers: `const locked = await refuseSandbox(userId, "billing");
 * if (locked) return locked;`.
 */
export async function refuseSandbox(
  userId: string,
  capability: SandboxCapability
): Promise<NextResponse | null> {
  return (await isSandboxUser(userId))
    ? sandboxLockedResponse(capability)
    : null;
}

/** Thrown by services; a route turns it into `sandboxLockedResponse`. */
export class SandboxLockedError extends Error {
  readonly status = 403;
  constructor(readonly capability: SandboxCapability) {
    super(sandboxLockedBody(capability).error);
    this.name = "SandboxLockedError";
  }
}

export async function assertNotSandbox(
  userId: string,
  capability: SandboxCapability
): Promise<void> {
  if (await isSandboxUser(userId)) throw new SandboxLockedError(capability);
}
