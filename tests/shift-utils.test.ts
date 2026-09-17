import { describe, expect, it } from "vitest";
import { calculateLateMinutes, formatShiftRange } from "../lib/shift-utils";

describe("shift utilities", () => {
  it("uses the configured shift start and grace period", () => {
    expect(calculateLateMinutes(new Date("2026-09-16T08:20:00"), "08:00", 15)).toBe(5);
    expect(calculateLateMinutes(new Date("2026-09-16T08:10:00"), "08:00", 15)).toBe(0);
  });

  it("supports the evening shift ending after midnight", () => {
    expect(formatShiftRange("16:00", "01:00", true)).toBe("16:00 — 01:00 · يوم جديد");
  });
});
