import React, { createContext, useContext, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { calculatePayroll, type PayrollInputs, todayKey } from "@/lib/payroll";

export type Role = "employee" | "supervisor" | "manager";
export type AttendanceState = "حاضر" | "متأخر" | "إجازة" | "غياب" | "مأمورية";
export type RequestType = "إجازة" | "إذن" | "مأمورية" | "إجازة مرضية" | "إجازة طارئة";
export type RequestStatus = "قيد المراجعة" | "مقبول" | "مرفوض";

export type Branch = { name: string; address: string; latitude: number; longitude: number; radiusMeters: number };
export type Shift = { name: string; start: string; end: string; days: string; crossesMidnight?: boolean; kind?: "shift" | "weekly_off" };
export type ShiftTemplate = { id: number; name: string; kind: "shift" | "weekly_off"; startTime: string; endTime: string; crossesMidnight: boolean; active: boolean };
export type ScheduleEntry = { id: number; staffAccountId: number; scheduleDate: string; shiftTemplateId: number; note?: string | null; shift: ShiftTemplate | null };
export type AttendanceRecord = { id: string; date: string; checkIn?: string | null; checkOut?: string | null; status: AttendanceState; lateMinutes: number; distanceMeters?: number | null; note?: string | null };
export type LeaveRequest = { id: string; type: RequestType | string; from: string; to: string; reason: string; status: RequestStatus | string; staffAccountId?: number; staffName?: string; source?: "request" | "attendance" | "penalty"; exceptionKind?: "late" | "early" | "absence"; fromDate?: string; adjustmentId?: number; actionable?: boolean; hours?: number | null };
export type Employee = { id: string; name: string; title: string; department: string; baseSalary: number; initials: string; phone?: string; role?: Role; active?: boolean };

export const defaultBranch: Branch = { name: "الفرع الرئيسي", address: "مدينة نصر، القاهرة", latitude: 30.0444, longitude: 31.2357, radiusMeters: 200 };

function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0] ?? "").join(""); }
function mapEmployee(staff: { id: number; name: string; title: string | null; department: string | null; baseSalary: number; phone?: string; role?: Role; active?: boolean }): Employee {
  return { id: String(staff.id), name: staff.name, title: staff.title ?? "موظف", department: staff.department ?? "عام", baseSalary: staff.baseSalary, initials: initials(staff.name), phone: staff.phone, role: staff.role, active: staff.active };
}

export type AppDataContext = {
  role: Role;
  employee: Employee;
  branch: Branch;
  shift: Shift;
  records: AttendanceRecord[];
  requests: LeaveRequest[];
  staffMembers: Employee[];
  payrollInputs: PayrollInputs;
  payroll: ReturnType<typeof calculatePayroll>;
  todayRecord?: AttendanceRecord;
  checkedIn: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  checkIn: (payload: { time: string; distanceMeters: number; status: AttendanceState; lateMinutes: number }) => Promise<void>;
  checkOut: (payload: { time: string; distanceMeters: number }) => Promise<void>;
  submitRequest: (request: Omit<LeaveRequest, "id" | "status">) => Promise<void>;
  approveRequest: (id: string, status: RequestStatus) => Promise<void>;
  createStaffAccount: (input: { phone: string; password: string; name: string; title?: string; department?: string; baseSalary: number; role: Role }) => Promise<void>;
  updateStaffAccount: (input: { id: number; phone?: string; password?: string; name?: string; title?: string; department?: string; baseSalary?: number; role?: Role; shiftStart?: string; shiftEnd?: string; active?: boolean }) => Promise<void>;
  updateBranch: (input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) => Promise<void>;
  shiftTemplates: ShiftTemplate[];
  schedules: ScheduleEntry[];
  teamSchedules: ScheduleEntry[];
  saveSchedule: (input: { staffAccountId: number; scheduleDate: string; shiftTemplateId: number; note?: string }) => Promise<void>;
};

const AppData = createContext<AppDataContext | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const attendanceQuery = trpc.attendance.list.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const requestsQuery = trpc.requests.list.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const staffQuery = trpc.staff.list.useQuery(undefined, { enabled: meQuery.data?.role === "manager" || meQuery.data?.role === "supervisor", retry: false });
  const checkInMutation = trpc.attendance.checkIn.useMutation();
  const checkOutMutation = trpc.attendance.checkOut.useMutation();
  const requestMutation = trpc.requests.create.useMutation();
  const reviewMutation = trpc.requests.review.useMutation();
  const createStaffMutation = trpc.staff.create.useMutation();
  const updateStaffMutation = trpc.staff.update.useMutation();
  const companyQuery = trpc.company.settings.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const updateCompanyMutation = trpc.company.updateSettings.useMutation();
  const shiftTemplatesQuery = trpc.schedule.templates.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const mineScheduleQuery = trpc.schedule.mine.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const teamScheduleQuery = trpc.schedule.all.useQuery(undefined, { enabled: meQuery.data?.role === "manager" || meQuery.data?.role === "supervisor", retry: false });
  const saveScheduleMutation = trpc.schedule.save.useMutation();

  const employee = meQuery.data ? mapEmployee(meQuery.data) : { id: "", name: "", title: "", department: "", baseSalary: 0, initials: "" };
  const branch: Branch = companyQuery.data ? { name: companyQuery.data.name, address: companyQuery.data.address, latitude: Number(companyQuery.data.latitude), longitude: Number(companyQuery.data.longitude), radiusMeters: companyQuery.data.radiusMeters } : defaultBranch;
  const records: AttendanceRecord[] = (attendanceQuery.data ?? []).map((record) => ({ id: String(record.id), date: record.date, checkIn: record.checkIn, checkOut: record.checkOut, status: record.status as AttendanceState, lateMinutes: record.lateMinutes, distanceMeters: record.distanceMeters, note: record.note }));
  const requests: LeaveRequest[] = (requestsQuery.data ?? []).map((request: any) => ({ id: String(request.id), type: request.type as RequestType | string, from: request.fromDate, to: request.toDate, reason: request.reason, status: request.status as RequestStatus | string, staffAccountId: request.staffAccountId, staffName: request.staffName, source: request.source, exceptionKind: request.exceptionKind, fromDate: request.fromDate, adjustmentId: request.adjustmentId, actionable: request.actionable, hours: request.hours != null ? Number(request.hours) : null }));
  const staffMembers: Employee[] = (staffQuery.data ?? []).map((staff) => mapEmployee(staff));
  const shiftTemplates: ShiftTemplate[] = (shiftTemplatesQuery.data ?? []).map((item) => ({ id: item.id, name: item.name, kind: item.kind as "shift" | "weekly_off", startTime: item.startTime, endTime: item.endTime, crossesMidnight: item.crossesMidnight, active: item.active }));
  const schedules: ScheduleEntry[] = (mineScheduleQuery.data ?? []) as ScheduleEntry[];
  const teamSchedules: ScheduleEntry[] = (teamScheduleQuery.data ?? []) as ScheduleEntry[];
  const todayRecord = records.find((record) => record.date === todayKey());
  const todaySchedule = schedules.find((item) => item.scheduleDate === todayKey());
  const activeShift = todaySchedule?.shift;
  const currentMonth = todayKey().slice(0, 7);
  const approvedOvertimeHours = requests.filter((request) => request.type === "أوفر تايم" && request.status === "مقبول" && request.from.startsWith(currentMonth)).reduce((sum, request) => sum + (request.hours ?? 0), 0);
  const payrollInputs: PayrollInputs = useMemo(() => ({ baseSalary: employee.baseSalary, allowances: 0, bonuses: 0, overtimeHours: approvedOvertimeHours, absences: records.filter((record) => record.status === "غياب").length, lateMinutes: records.reduce((sum, record) => sum + record.lateMinutes, 0), deductions: 0, advances: 0 }), [employee.baseSalary, records, approvedOvertimeHours]);
  const payroll = useMemo(() => calculatePayroll(payrollInputs), [payrollInputs]);
  const role: Role = meQuery.data?.role === "manager" ? "manager" : meQuery.data?.role === "supervisor" ? "supervisor" : "employee";

  const invalidateAll = () => queryClient.invalidateQueries();
  const value = useMemo<AppDataContext>(() => ({
    role, employee, branch, shift: { name: activeShift?.name ?? "الوردية الأساسية", start: activeShift?.startTime ?? meQuery.data?.shiftStart ?? "09:00", end: activeShift?.endTime ?? meQuery.data?.shiftEnd ?? "18:00", days: "حسب جدول الأسبوع", crossesMidnight: activeShift?.crossesMidnight, kind: activeShift?.kind as "shift" | "weekly_off" | undefined }, records, requests, staffMembers, payrollInputs, payroll, todayRecord, checkedIn: Boolean(todayRecord?.checkIn && !todayRecord?.checkOut), loading: meQuery.isLoading || attendanceQuery.isLoading, refresh: invalidateAll, shiftTemplates, schedules, teamSchedules,
    checkIn: async (payload) => { await checkInMutation.mutateAsync({ date: todayKey(), time: payload.time, status: payload.status, lateMinutes: payload.lateMinutes, distanceMeters: payload.distanceMeters }); await invalidateAll(); },
    checkOut: async (payload) => { await checkOutMutation.mutateAsync({ date: todayKey(), time: payload.time, distanceMeters: payload.distanceMeters }); await invalidateAll(); },
    submitRequest: async (request) => { await requestMutation.mutateAsync({ type: request.type, fromDate: request.from, toDate: request.to, reason: request.reason, hours: request.hours ?? undefined }); await invalidateAll(); },
    approveRequest: async (id, status) => { await reviewMutation.mutateAsync({ id: Number(id), status: status as "مقبول" | "مرفوض" }); await invalidateAll(); },
    createStaffAccount: async (input) => { await createStaffMutation.mutateAsync({ ...input, shiftStart: "09:00", shiftEnd: "18:00" }); await invalidateAll(); },
    updateStaffAccount: async (input) => { await updateStaffMutation.mutateAsync(input); await invalidateAll(); },
    updateBranch: async (input) => { await updateCompanyMutation.mutateAsync(input); await invalidateAll(); },
    saveSchedule: async (input) => { await saveScheduleMutation.mutateAsync(input); await invalidateAll(); },
  }), [role, employee, branch, meQuery.data?.shiftStart, meQuery.data?.shiftEnd, records, requests, staffMembers, payrollInputs, payroll, todayRecord, meQuery.isLoading, attendanceQuery.isLoading, shiftTemplates, schedules, teamSchedules, activeShift, checkInMutation, checkOutMutation, requestMutation, reviewMutation, createStaffMutation, updateStaffMutation, updateCompanyMutation, saveScheduleMutation]);
  return <AppData.Provider value={value}>{children}</AppData.Provider>;
}

export function useAppData() {
  const value = useContext(AppData);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
