import { describe, expect, it } from "vitest";
import { calculatePayroll, calculateEarnedSalary, PAYROLL_RULES, capMonthlyDisciplinaryDeduction, calculateLatePenaltyDays } from "../lib/payroll";

describe("قواعد المرتب الداخلية", () => {
  it("تحسب قيمة اليوم والساعة من 30 يوم و9 ساعات مع 26 يوم عمل و4 إجازة مدفوعة", () => {
    const result = calculatePayroll({ baseSalary: 12000 });
    expect(PAYROLL_RULES.workDays + PAYROLL_RULES.paidLeaveDays).toBe(PAYROLL_RULES.calendarDays);
    expect(result.dailyValue).toBeCloseTo(12000 / PAYROLL_RULES.calendarDays);
    expect(result.hourlyValue).toBeCloseTo(12000 / 30 / 9);
  });

  it("تخصم أجر يوم الغياب الفعلي فقط ولا تضاعف الجزاء تلقائيًا", () => {
    const result = calculatePayroll({ baseSalary: 12000, absences: 1 });
    expect(result.absenceDeduction).toBeCloseTo(12000 / 30);
    expect(result.net).toBeCloseTo(12000 - 12000 / 30);
  });

  it("تطبق شرائح جزاء التأخير بعد سماح 15 دقيقة فقط وبعد اعتماد المدير", () => {
    expect(PAYROLL_RULES.graceMinutes).toBe(15);
    expect(calculateLatePenaltyDays(0)).toBe(0);
    expect(calculateLatePenaltyDays(1)).toBe(0.25); // 16-29 دقيقة تأخير إجمالي
    expect(calculateLatePenaltyDays(14)).toBe(0.25);
    expect(calculateLatePenaltyDays(15)).toBe(0.5); // 30-59 دقيقة إجمالي
    expect(calculateLatePenaltyDays(44)).toBe(0.5);
    expect(calculateLatePenaltyDays(45)).toBe(1); // ساعة أو أكثر إجمالي
    expect(PAYROLL_RULES.absencePenaltyDays).toBe(3);
  });

  it("لا تسمح بتجاوز خصم الجزاءات التأديبية خمسة أيام من الأجر الأساسي في الشهر", () => {
    expect(capMonthlyDisciplinaryDeduction(9000, 400)).toBe(2000);
    expect(capMonthlyDisciplinaryDeduction(1200, 400)).toBe(1200);
    expect(capMonthlyDisciplinaryDeduction(-500, 400)).toBe(0);
  });

  it("تعتمد سماح 15 دقيقة وتخصم التأخير الفعلي المسجل بعدها بسعر الساعة", () => {
    expect(PAYROLL_RULES.graceMinutes).toBe(15);
    const result = calculatePayroll({ baseSalary: 12000, lateMinutes: 10 });
    expect(result.lateDeduction).toBeCloseTo((12000 / 30 / 9) * 10 / 60);
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
