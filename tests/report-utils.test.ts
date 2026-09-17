import { describe, expect, it } from "vitest";
import { summarizeAttendance, summarizeRequests } from "../lib/report-utils";

describe("report summaries", () => {
  it("summarizes attendance statuses, late minutes, and incomplete records", () => {
    expect(summarizeAttendance([
      { status: "حاضر", lateMinutes: 0, checkIn: "08:00", checkOut: "17:00" },
      { status: "متأخر", lateMinutes: 12, checkIn: "08:27", checkOut: "17:00" },
      { status: "غياب", lateMinutes: 0 },
      { status: "إجازة", lateMinutes: 0 },
    ])).toEqual({ presentDays: 2, absentDays: 1, leaveDays: 1, lateMinutes: 12, incompleteDays: 0, attendanceDays: 4 });
  });

  it("counts request states separately", () => {
    expect(summarizeRequests([{ status: "مقبول" }, { status: "مرفوض" }, { status: "قيد المراجعة" }])).toEqual({ totalRequests: 3, approvedRequests: 1, pendingRequests: 1 });
  });
});
