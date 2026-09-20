export const PAYROLL_RULES = {
  dailyHours: 9,
  workDays: 26,
  paidLeaveDays: 4,
  calendarDays: 30,
  graceMinutes: 15,
  absencePenaltyDays: 3,
} as const;

export type PayrollInputs = {
  baseSalary: number;
  allowances?: number;
  bonuses?: number;
  overtimeHours?: number;
  overtimeRate?: number;
  absences?: number;
  lateMinutes?: number;
  deductions?: number;
  advances?: number;
};

export function calculatePayroll(inputs: PayrollInputs) {
  const allowances = inputs.allowances ?? 0;
  const bonuses = inputs.bonuses ?? 0;
  const overtimeHours = inputs.overtimeHours ?? 0;
  const overtimeRate = inputs.overtimeRate ?? inputs.baseSalary / PAYROLL_RULES.calendarDays / PAYROLL_RULES.dailyHours;
  const absences = inputs.absences ?? 0;
  const lateMinutes = Math.max(0, inputs.lateMinutes ?? 0);
  const deductions = inputs.deductions ?? 0;
  const advances = inputs.advances ?? 0;

  const dailyValue = inputs.baseSalary / PAYROLL_RULES.calendarDays;
  const hourlyValue = dailyValue / PAYROLL_RULES.dailyHours;
  const absenceDeduction = absences * PAYROLL_RULES.absencePenaltyDays * dailyValue;
  const lateDeduction = (lateMinutes / 60) * hourlyValue;
  const overtimeValue = overtimeHours * overtimeRate;
  const gross = inputs.baseSalary + allowances + bonuses + overtimeValue;
  const totalDeductions = absenceDeduction + lateDeduction + deductions + advances;

  return {
    dailyValue,
    hourlyValue,
    absenceDeduction,
    lateDeduction,
    overtimeValue,
    gross,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
  };
}

export function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString("ar-EG")} ج.م`;
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function todayKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
