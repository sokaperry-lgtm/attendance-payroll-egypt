import { describe, expect, it } from "vitest";
import { calculatePayroll, PAYROLL_RULES } from "../lib/payroll";

describe("قواعد المرتب الداخلية", () => {
  it("تحسب قيمة اليوم والساعة من 26 يوم و9 ساعات", () => {
    const result = calculatePayroll({ baseSalary: 12000 });
    expect(result.dailyValue).toBeCloseTo(12000 / PAYROLL_RULES.workDays);
    expect(result.hourlyValue).toBeCloseTo(12000 / 26 / 9);
  });

  it("تطبق خصم الغياب ثلاثة أيام لكل يوم غياب", () => {
    const result = calculatePayroll({ baseSalary: 12000, absences: 1 });
    expect(result.absenceDeduction).toBeCloseTo((12000 / 26) * 3);
    expect(result.net).toBeCloseTo(12000 - (12000 / 26) * 3);
  });

  it("تجمع الإضافي وتخصم التأخير والخصومات والسلف", () => {
    const result = calculatePayroll({
      baseSalary: 12000,
      allowances: 1500,
      bonuses: 500,
      overtimeHours: 3,
      overtimeRate: 70,
      lateMinutes: 60,
      deductions: 250,
      advances: 1000,
    });
    expect(result.overtimeValue).toBe(210);
    expect(result.totalDeductions).toBeCloseTo(result.lateDeduction + 1250);
    expect(result.net).toBeGreaterThan(0);
  });
});
