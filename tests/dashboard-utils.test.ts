import { describe, expect, it, vi } from "vitest";
import { todayKey } from "../lib/payroll";
import {
  buildLastSevenDaysAttendance,
  buildDepartmentStats,
  buildStatusStats,
  buildWeeklyStats,
  calculateAttendanceRate,
  summarizePayroll,
} from "../lib/dashboard-utils";

const records = [
  { date: "2026-09-01", status: "حاضر", lateMinutes: 0 },
  { date: "2026-09-01", status: "متأخر", lateMinutes: 12 },
  { date: "2026-09-02", status: "مأمورية", lateMinutes: 0 },
  { date: "2026-09-02", status: "غياب", lateMinutes: 0 },
  { date: "2026-09-03", status: "إجازة", lateMinutes: 0 },
];

describe("مؤشرات Dashboard", () => {
  it("تحسب نسبة الحضور من الحضور والغياب فقط", () => {
    expect(calculateAttendanceRate({ presentDays: 8, absentDays: 2 })).toBe(80);
    expect(calculateAttendanceRate({ presentDays: 0, absentDays: 0 })).toBe(0);
  });

  it("توزع كل حالات الحضور بما فيها المأمورية", () => {
    expect(buildStatusStats(records).map(({ label, count }) => ({ label, count }))).toEqual([
      { label: "حاضر", count: 1 },
      { label: "متأخر", count: 1 },
      { label: "مأمورية", count: 1 },
      { label: "غياب", count: 1 },
      { label: "إجازة", count: 1 },
    ]);
  });

  it("تحسب معدل كل يوم وتحتفظ بآخر سبعة أيام فقط", () => {
    const manyDays = Array.from({ length: 8 }, (_, index) => ({ date: `2026-09-${String(index + 1).padStart(2, "0")}`, status: index % 2 ? "غياب" : "حاضر", lateMinutes: 0 }));
    const result = buildWeeklyStats(manyDays, (date) => date);
    expect(result).toHaveLength(7);
    expect(result[0]).toMatchObject({ date: "2026-09-02", value: 0 });
    expect(result[6]).toMatchObject({ date: "2026-09-08", value: 0 });
  });

  it("تجمع الحضور حسب القسم وترتب الأقسام وتحدها بخمسة", () => {
    const employees = [
      { name: "أ", department: "المبيعات", presentDays: 9, absentDays: 1, lateMinutes: 0, records: [] },
      { name: "ب", department: "المبيعات", presentDays: 8, absentDays: 2, lateMinutes: 0, records: [] },
      { name: "ج", department: "المالية", presentDays: 5, absentDays: 5, lateMinutes: 0, records: [] },
    ];
    expect(buildDepartmentStats(employees)).toEqual([
      { name: "المبيعات", rate: 85 },
      { name: "المالية", rate: 50 },
    ]);
  });

  it("تلخص صافي الرواتب والخصومات والأوفر تايم والاعتماد", () => {
    expect(summarizePayroll([
      { netSalary: 10000, absenceDeduction: 300, overtime: 500, status: "approved" },
      { netSalary: 8000, absenceDeduction: 0, overtime: 250, status: "draft" },
      { netSalary: null, absenceDeduction: null, overtime: null, status: "approved" },
    ])).toEqual({ totalPayroll: 18000, totalAbsenceDeductions: 300, totalOvertime: 750, approvedPayroll: 2, totalPayrollRows: 3 });
  });
});

it("shows seven actual calendar days, with missing data blank and real absence at zero", () => {
  const result=buildLastSevenDaysAttendance([
    {date:"2026-10-30",status:"حاضر",lateMinutes:0},
    {date:"2026-10-30",status:"غياب",lateMinutes:0},
    {date:"2026-10-31",status:"غياب",lateMinutes:0},
  ],"2026-10-31");
  expect(result).toHaveLength(7);
  expect(result[0]).toMatchObject({date:"2026-10-25",value:null});
  expect(result[5].value).toBe(50);
  expect(result[6].value).toBe(0);
});


it("builds a new employee dashboard when the browser formats en-CA dates with slashes", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  const original = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, "format")!;
  Object.defineProperty(Intl.DateTimeFormat.prototype, "format", { configurable: true, get: function (this: Intl.DateTimeFormat) {
    if (this.resolvedOptions().locale === "en-CA") return () => "11/05/2026";
    return original.get!.call(this);
  }});
  try {
    const today = todayKey();
    expect(today).toBe("2026-11-05");
    expect(today.slice(0, 7)).toBe("2026-11");
    const result = buildLastSevenDaysAttendance([{ date: today, status: "حاضر", lateMinutes: 0 }], today);
    expect(result).toHaveLength(7);
    expect(result[6]).toMatchObject({ date: today, value: 100 });
    expect(result.slice(0, 6).every(day => day.value === null)).toBe(true);
    expect(buildLastSevenDaysAttendance([], today)).toHaveLength(7);
  } finally {
    Object.defineProperty(Intl.DateTimeFormat.prototype, "format", original);
    vi.useRealTimers();
  }
});
