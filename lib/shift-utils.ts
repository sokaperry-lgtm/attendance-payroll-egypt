export function calculateLateMinutes(now: Date, startTime: string, graceMinutes = 15) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(hours || 0, minutes || 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - shiftStart.getTime()) / 60000) - graceMinutes);
}

export function formatShiftRange(startTime: string, endTime: string, crossesMidnight = false) {
  return `${startTime} — ${endTime}${crossesMidnight ? " · يوم جديد" : ""}`;
}
