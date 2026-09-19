import { describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import { INTERNAL_SESSION_COOKIE } from "../shared/const";
import type { TrpcContext } from "../server/_core/context";
import * as db from "../server/db";

describe("auth.logout", () => {
  it("clears the internal staff session cookie", async () => {
    const clearedCookies: Array<{ name: string; options: Record<string, unknown> }> = [];
    const ctx: TrpcContext = {
      user: null,
      staffUser: {
        id: 1,
        phone: "01000000000",
        passwordHash: "test",
        name: "Test Manager",
        title: "Manager",
        department: null,
        role: "manager",
        baseSalary: 0,
        shiftStart: "09:00",
        shiftEnd: "18:00",
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      req: {
        protocol: "https",
        hostname: "example.com",
        headers: { cookie: INTERNAL_SESSION_COOKIE + "=test-token" },
      } as TrpcContext["req"],
      res: {
        clearCookie: (name: string, options: Record<string, unknown>) => {
          clearedCookies.push({ name, options });
        },
      } as TrpcContext["res"],
    };

    const deleteSessionSpy = vi.spyOn(db, "deleteStaffSession").mockResolvedValue();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(deleteSessionSpy).toHaveBeenCalledWith("test-token");
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(INTERNAL_SESSION_COOKIE);
    expect(clearedCookies[0]?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});
