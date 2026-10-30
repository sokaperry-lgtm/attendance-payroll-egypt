import { describe, expect, it } from "vitest";
import { calculateLateMinutes, formatShiftRange } from "../lib/shift-utils";

describe("shift utilities", () => {
  it("records raw lateness; penalty bands handle the first fourteen minutes", () => {
    for (const minutes of [1,14,15,29,30,59,60]) {
      const now = new Date(2026,8,16,8,minutes);
      expect(calculateLateMinutes(now,"08:00")).toBe(minutes);
    }
    expect(calculateLateMinutes(new Date(2026,8,16,7,55),"08:00")).toBe(0);
  });

  it("supports the evening shift ending after midnight", () => {
    expect(formatShiftRange("16:00", "01:00", true)).toBe("16:00 — 01:00 · يوم جديد");
  });
});
