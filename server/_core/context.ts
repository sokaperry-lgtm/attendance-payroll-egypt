import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import type { StaffAccount, User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { INTERNAL_SESSION_COOKIE } from "../../shared/const";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  staffUser?: StaffAccount | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: User | null = null;
  let staffUser: StaffAccount | null = null;

  const authHeader = opts.req.headers.authorization || opts.req.headers.Authorization;
  const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  const internalToken = bearer || cookies[INTERNAL_SESSION_COOKIE];

  if (internalToken) {
    try {
      staffUser = (await db.getStaffBySessionToken(internalToken)) ?? null;
    } catch (error) {
      console.warn("[InternalAuth] Failed to load staff session", error);
    }
  }

  if (!staffUser) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }

  return { req: opts.req, res: opts.res, user, staffUser };
}
