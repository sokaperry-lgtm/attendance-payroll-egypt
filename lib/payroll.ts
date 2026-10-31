export const PAYROLL_RULES = {
  dailyHours: 9,
  workDays: 26,
  paidLeaveDays: 4,
  calendarDays: 30,
  graceMinutes: 14,
  absencePenaltyDays: 3,
  permittedAbsencePenaltyDays: 1,
  lateQuarterDayMinutes: 15,
  lateHalfDayMinutes: 30,
  lateFullDayMinutes: 60,
  // The current approved policy has fixed penalties and no repeat-doubling rule.
  // Keep this threshold effectively unreachable because older payroll service code
  // still checks it when recalculating historical/draft payroll rows.
  repeatPenaltyAfter: Number.MAX_SAFE_INTEGER,
  overtimeMultiplier: 1,
} as const;

export function getAbsencePenaltyDays(hasPermission: boolean) {
  return hasPermission ? PAYROLL_RULES.permittedAbsencePenaltyDays : PAYROLL_RULES.absencePenaltyDays;
}

/**
 * Salary earned so far from recorded work time. Monthly salary is based on
 * the existing payroll convention of 30 calendar days × 9 hours per day.
 * Open shifts are measured by the caller up to the current time.
 */
export function calculateEarnedSalary(baseSalary: number, workedMinutes: number) {
  const monthlySalary = Math.max(0, Number(baseSalary) || 0);
  const minutes = Math.max(0, Number(workedMinutes) || 0);
  const hourlyValue = monthlySalary / PAYROLL_RULES.calendarDays / PAYROLL_RULES.dailyHours;
  return Math.min(Math.round(monthlySalary), Math.round(hourlyValue * minutes / 60));
}

/** Accrue paid work/leave/rest through Cairo today; work on rest earns an extra day. */
export function calculateAttendanceAccrual(
  baseSalary: number,
  month: string,
  attendance: Array<{ date: string; checkIn?: string | null; status: string; note?: string | null }>,
  restDates: string[],
  today = todayKey(),
  paidLeaveDates: string[] = [],
) {
  const eligible = (date: string) => date.startsWith(`${month}-`) && date <= today;
  const worked = new Set(attendance.filter(r => eligible(r.date) && Boolean(r.checkIn) &&
    ["حاضر", "متأخر"].includes(r.status)).map(r => r.date));
  const rest = new Set(restDates.filter(eligible));
  const leave = new Set(paidLeaveDates.filter(eligible));
  const missions = attendance.filter(r => eligible(r.date) && r.status === "مأمورية").map(r => r.date);
  const paid = new Set([...worked, ...rest, ...leave, ...missions]);
  const workedRestDays = [...worked].filter(date => rest.has(date)).length;
  // An absent day's wage is already excluded from accrual. Only the additional
  // two days of the three-day penalty may be deducted from this basis.
  const unpaidAbsence = new Set(attendance.filter(r => eligible(r.date) && r.status === "غياب" &&
    !paid.has(r.date)).map(r => r.date));
  return {
    earnedBaseSalary: Math.round(Math.max(0, Number(baseSalary) || 0) * (Math.min(PAYROLL_RULES.calendarDays, paid.size) + workedRestDays) / PAYROLL_RULES.calendarDays),
    workedDays: worked.size,
    paidRestDays: [...rest].filter(date => !worked.has(date)).length,
    unpaidAbsenceDays: unpaidAbsence.size,
  };
}

export function calculateAttendancePenalties(
  baseSalary: number,
  records: Array<{date: string; status: string; lateMinutes?: number | null; note?: string | null}>,
  unpaidAbsenceDays: number,
  paidRestDates: string[] = [],
) {
  const daily = Math.max(0, baseSalary) / PAYROLL_RULES.calendarDays;
  let absence = 0, late = 0;
  for (const record of records) {
    if (paidRestDates.includes(record.date)) continue;
    const note = record.note || "";
    if (record.status === "غياب") absence += getAbsencePenaltyDays(note.includes("بإذن")) * daily;
    if (note.includes("تم اعتماد التأخير")) {
      const minutes = Math.max(0, Number(record.lateMinutes) || 0);
      late += (minutes >= PAYROLL_RULES.lateFullDayMinutes ? 1 : minutes >= PAYROLL_RULES.lateHalfDayMinutes ? 0.5 : minutes >= PAYROLL_RULES.lateQuarterDayMinutes ? 0.25 : 0) * daily;
    }
  }
  return { absenceDeduction: Math.round(Math.max(0, absence - unpaidAbsenceDays * daily)), lateDeduction: Math.round(late) };
}

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
  const latePenaltyDays =
    lateMinutes >= PAYROLL_RULES.lateFullDayMinutes ? 1 :
    lateMinutes >= PAYROLL_RULES.lateHalfDayMinutes ? 0.5 :
    lateMinutes >= PAYROLL_RULES.lateQuarterDayMinutes ? 0.25 : 0;
  const lateDeduction = latePenaltyDays * dailyValue;
  const overtimeValue = overtimeHours * overtimeRate * PAYROLL_RULES.overtimeMultiplier;
  const gross = inputs.baseSalary + allowances + bonuses + overtimeValue;
  const totalDeductions = absenceDeduction + lateDeduction + deductions + advances;

  return {
    dailyValue,
    hourlyValue,
    absenceDeduction,
    lateDeduction,
    earlyDeduction: 0,
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

/** Only approved leave requests grant paid leave; a bare attendance label does not. */
export function approvedLeaveDates(requests: Array<{type:string;status:string;fromDate:string;toDate:string}>) {
  const dates = new Set<string>();
  for (const request of requests) {
    if (request.status !== "مقبول" || !["إجازة", "إجازة مرضية", "إجازة طارئة"].includes(request.type)) continue;
    const cursor = new Date(`${request.fromDate}T12:00:00Z`);
    for (let i = 0; i < 366 && Number.isFinite(cursor.getTime()); i++) {
      const date = cursor.toISOString().slice(0,10);
      if (date > request.toDate) break;
      dates.add(date);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return [...dates];
}

/** Former employees stay payable in their leaving month and in historical months. */
export function employeePayrollCutoff(employee:{employmentEndedOn?:string|null}, today=todayKey()) {
  return employee.employmentEndedOn && employee.employmentEndedOn < today ? employee.employmentEndedOn : today;
}
export function includeEmployeeInPayroll(employee:{active:boolean;employmentEndedOn?:string|null}, month:string, hasMonthActivity=false) {
  if (employee.employmentEndedOn) return month <= employee.employmentEndedOn.slice(0,7);
  return employee.active || hasMonthActivity;
}
