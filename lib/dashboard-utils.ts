export type DashboardRecord = { date: string; status: string; lateMinutes: number };
export type DashboardEmployee = { name: string; department?: string | null; lateMinutes: number; absentDays: number; presentDays: number; records: DashboardRecord[] };
export type DashboardPayrollRow = { netSalary?: number | null; absenceDeduction?: number | null; overtime?: number | null; status?: string | null };
export type DashboardSummary = { presentDays: number; absentDays: number; lateMinutes: number; pendingRequests: number };

export function calculateAttendanceRate(summary: Pick<DashboardSummary, "presentDays" | "absentDays">) {
  const trackedDays = summary.presentDays + summary.absentDays;
  return trackedDays ? Math.round((summary.presentDays / trackedDays) * 100) : 0;
}

export function buildStatusStats(records: DashboardRecord[]) {
  return [
    { label: "حاضر", count: records.filter((record) => record.status === "حاضر").length, color: "#10B981" },
    { label: "متأخر", count: records.filter((record) => record.status === "متأخر").length, color: "#F59E0B" },
    { label: "مأمورية", count: records.filter((record) => record.status === "مأمورية").length, color: "#3B82F6" },
    { label: "غياب", count: records.filter((record) => record.status === "غياب").length, color: "#EF4444" },
    { label: "إجازة", count: records.filter((record) => record.status === "إجازة").length, color: "#8B5CF6" },
  ];
}

export function buildWeeklyStats(records: DashboardRecord[], weekdayFormatter = (date: string) => new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(`${date}T00:00:00`))) {
  const groups = new Map<string, { total: number; present: number }>();
  records.forEach((record) => {
    const current = groups.get(record.date) ?? { total: 0, present: 0 };
    current.total += 1;
    if (["حاضر", "متأخر", "مأمورية"].includes(record.status)) current.present += 1;
    groups.set(record.date, current);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, value]) => ({
    label: weekdayFormatter(date),
    date,
    value: value.total ? Math.round((value.present / value.total) * 100) : 0,
  }));
}

export function buildDepartmentStats(employees: DashboardEmployee[]) {
  const groups = new Map<string, { present: number; absent: number }>();
  employees.forEach((employee) => {
    const department = employee.department || "عام";
    const current = groups.get(department) ?? { present: 0, absent: 0 };
    current.present += employee.presentDays;
    current.absent += employee.absentDays;
    groups.set(department, current);
  });
  return [...groups.entries()].map(([name, value]) => ({ name, rate: value.present + value.absent ? Math.round((value.present / (value.present + value.absent)) * 100) : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 5);
}

export function summarizePayroll(rows: DashboardPayrollRow[]) {
  return {
    totalPayroll: rows.reduce((sum, row) => sum + Number(row.netSalary ?? 0), 0),
    totalAbsenceDeductions: rows.reduce((sum, row) => sum + Number(row.absenceDeduction ?? 0), 0),
    totalOvertime: rows.reduce((sum, row) => sum + Number(row.overtime ?? 0), 0),
    approvedPayroll: rows.filter((row) => row.status === "approved").length,
    totalPayrollRows: rows.length,
  };
}
