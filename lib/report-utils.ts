export function summarizeAttendance(records: Array<{ status: string; lateMinutes: number; checkIn?: string | null; checkOut?: string | null }>) {
  return {
    presentDays: records.filter((record) => ["حاضر", "متأخر", "مأمورية"].includes(record.status)).length,
    absentDays: records.filter((record) => record.status === "غياب").length,
    leaveDays: records.filter((record) => record.status === "إجازة").length,
    lateMinutes: records.reduce((sum, record) => sum + record.lateMinutes, 0),
    incompleteDays: records.filter((record) => record.checkIn && !record.checkOut).length,
    attendanceDays: records.length,
  };
}

export function summarizeRequests(requests: Array<{ status: string }>) {
  return {
    totalRequests: requests.length,
    approvedRequests: requests.filter((request) => request.status === "مقبول").length,
    pendingRequests: requests.filter((request) => request.status === "قيد المراجعة").length,
  };
}
