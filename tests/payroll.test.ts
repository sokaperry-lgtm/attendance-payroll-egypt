import { describe, expect, it } from "vitest";
import { calculatePayroll, calculateEarnedSalary, getAbsencePenaltyDays, PAYROLL_RULES } from "../lib/payroll";

describe("قواعد المرتب الداخلية", () => {
  it("تحسب قيمة اليوم والساعة من 30 يوم و9 ساعات مع 26 يوم عمل و4 إجازة مدفوعة", () => {
    const result = calculatePayroll({ baseSalary: 12000 });
    expect(PAYROLL_RULES.workDays + PAYROLL_RULES.paidLeaveDays).toBe(PAYROLL_RULES.calendarDays);
    expect(result.dailyValue).toBeCloseTo(12000 / PAYROLL_RULES.calendarDays);
    expect(result.hourlyValue).toBeCloseTo(12000 / 30 / 9);
  });

  it("تطبق خصم الغياب ثلاثة أيام لكل يوم غياب", () => {
    const result = calculatePayroll({ baseSalary: 12000, absences: 1 });
    expect(result.absenceDeduction).toBeCloseTo((12000 / 30) * 3);
    expect(result.net).toBeCloseTo(12000 - (12000 / 30) * 3);
  });

  it("تطبق شرائح التأخير عند حدود الدقائق المطلوبة", () => {
    const daily = 12000 / 30;
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 14 }).lateDeduction).toBe(0);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 15 }).lateDeduction).toBeCloseTo(daily * 0.25);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 29 }).lateDeduction).toBeCloseTo(daily * 0.25);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 30 }).lateDeduction).toBeCloseTo(daily * 0.5);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 59 }).lateDeduction).toBeCloseTo(daily * 0.5);
    expect(calculatePayroll({ baseSalary: 12000, lateMinutes: 60 }).lateDeduction).toBeCloseTo(daily);
  });

  it("تحدد خصم الغياب حسب وجود الإذن", () => {
    expect(getAbsencePenaltyDays(false)).toBe(3);
    expect(getAbsencePenaltyDays(true)).toBe(1);
  });

  it("تحسب الأوفر تايم بسعر الساعة العادي دون مضاعفة", () => {
    const result = calculatePayroll({ baseSalary: 12000, overtimeHours: 2, overtimeRate: 50 });
    expect(PAYROLL_RULES.overtimeMultiplier).toBe(1);
    expect(result.overtimeValue).toBe(100);
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

  it("لا تسمح أن يصبح صافي الراتب سالبًا", () => {
    const result = calculatePayroll({ baseSalary: 3000, absences: 20, deductions: 10000, advances: 10000 });
    expect(result.net).toBe(0);
  });

  it("تتجاهل دقائق التأخير السالبة وتستخدم سعر الأوفر تايم المخصص", () => {
    const result = calculatePayroll({ baseSalary: 9000, lateMinutes: -30, overtimeHours: 2, overtimeRate: 125 });
    expect(result.lateDeduction).toBe(0);
    expect(result.overtimeValue).toBe(250);
    expect(result.gross).toBe(9250);
  });
});

describe("الراتب المستحق حسب ساعات الحضور الفعلية", () => {
  it("لا يصرف الراتب الشهري كاملًا عند عدم وجود ساعات عمل", () => {
    expect(calculateEarnedSalary(9000, 0)).toBe(0);
  });

  it("يحسب فقط وقت العمل المسجل حتى الآن", () => {
    // 9,000 ÷ 30 يوم ÷ 9 ساعات = 33.33 جنيه تقريبًا في الساعة.
    expect(calculateEarnedSalary(9000, 9 * 60)).toBe(300);
    expect(calculateEarnedSalary(9000, 9 * 60 * 10)).toBe(3000);
  });

  it("لا يسمح بأن يتجاوز المستحق الأساسي قيمة المرتب الشهري", () => {
    expect(calculateEarnedSalary(9000, 60 * 60 * 40)).toBe(9000);
  });

  it("يتجاهل دقائق العمل السالبة", () => {
    expect(calculateEarnedSalary(9000, -120)).toBe(0);
  });
});
