import React, { createContext, useContext, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { calculatePayroll, type PayrollInputs, todayKey } from "@/lib/payroll";

export type Role = "employee" | "manager";
export type AttendanceState = "حاضر" | "متأخر" | "إجازة" | "غياب" | "مأمورية";
export type RequestType = "إجازة" | "إذن" | "مأمورية";
export type RequestStatus = "قيد المراجعة" | "مقبول" | "مرفوض";

export type Branch = { name: string; address: string; latitude: number; longitude: number; radiusMeters: number };
export type Shift = { name: string; start: string; end: string; days: string };
export type AttendanceRecord = { id: string; date: string; checkIn?: string | null; checkOut?: string | null; status: AttendanceState; lateMinutes: number; distanceMeters?: number | null; note?: string | null };
export type LeaveRequest = { id: string; type: RequestType; from: string; to: string; reason: string; status: RequestStatus; staffAccountId?: number };
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
  refresh: () => void;
  checkIn: (payload: { time: string; distanceMeters: number; status: AttendanceState; lateMinutes: number }) => Promise<void>;
  checkOut: (time: string) => Promise<void>;
  submitRequest: (request: Omit<LeaveRequest, "id" | "status">) => Promise<void>;
  approveRequest: (id: string, status: RequestStatus) => Promise<void>;
  createStaffAccount: (input: { phone: string; password: string; name: string; title?: string; department?: string; baseSalary: number }) => Promise<void>;
  updateStaffAccount: (input: { id: number; phone?: string; password?: string; name?: string; title?: string; department?: string; baseSalary?: number; shiftStart?: string; shiftEnd?: string; active?: boolean }) => Promise<void>;
  updateBranch: (input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) => Promise<void>;
};

const AppData = createContext<AppDataContext | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const attendanceQuery = trpc.attendance.list.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const requestsQuery = trpc.requests.list.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const staffQuery = trpc.staff.list.useQuery(undefined, { enabled: meQuery.data?.role === "manager", retry: false });
  const checkInMutation = trpc.attendance.checkIn.useMutation();
  const checkOutMutation = trpc.attendance.checkOut.useMutation();
  const requestMutation = trpc.requests.create.useMutation();
  const reviewMutation = trpc.requests.review.useMutation();
  const createStaffMutation = trpc.staff.create.useMutation();
  const updateStaffMutation = trpc.staff.update.useMutation();
  const companyQuery = trpc.company.settings.useQuery(undefined, { enabled: Boolean(meQuery.data), retry: false });
  const updateCompanyMutation = trpc.company.updateSettings.useMutation();

  const employee = meQuery.data ? mapEmployee(meQuery.data) : { id: "", name: "", title: "", department: "", baseSalary: 0, initials: "" };
  const branch: Branch = companyQuery.data ? { name: companyQuery.data.name, address: companyQuery.data.address, latitude: Number(companyQuery.data.latitude), longitude: Number(companyQuery.data.longitude), radiusMeters: companyQuery.data.radiusMeters } : defaultBranch;
  const records: AttendanceRecord[] = (attendanceQuery.data ?? []).map((record) => ({ id: String(record.id), date: record.date, checkIn: record.checkIn, checkOut: record.checkOut, status: record.status as AttendanceState, lateMinutes: record.lateMinutes, distanceMeters: record.distanceMeters, note: record.note }));
  const requests: LeaveRequest[] = (requestsQuery.data ?? []).map((request) => ({ id: String(request.id), type: request.type as RequestType, from: request.fromDate, to: request.toDate, reason: request.reason, status: request.status as RequestStatus, staffAccountId: request.staffAccountId }));
  const staffMembers: Employee[] = (staffQuery.data ?? []).map((staff) => mapEmployee(staff));
  const todayRecord = records.find((record) => record.date === todayKey());
  const payrollInputs: PayrollInputs = useMemo(() => ({ baseSalary: employee.baseSalary, allowances: 0, bonuses: 0, overtimeHours: 0, absences: records.filter((record) => record.status === "غياب").length, lateMinutes: records.reduce((sum, record) => sum + record.lateMinutes, 0), deductions: 0, advances: 0 }), [employee.baseSalary, records]);
  const payroll = useMemo(() => calculatePayroll(payrollInputs), [payrollInputs]);
  const role: Role = meQuery.data?.role === "manager" ? "manager" : "employee";

  const invalidateAll = () => { void queryClient.invalidateQueries(); };
  const value = useMemo<AppDataContext>(() => ({
    role, employee, branch, shift: { name: "وردية صباحية", start: meQuery.data?.shiftStart ?? "09:00", end: meQuery.data?.shiftEnd ?? "18:00", days: "السبت — الخميس" }, records, requests, staffMembers, payrollInputs, payroll, todayRecord, checkedIn: Boolean(todayRecord?.checkIn && !todayRecord?.checkOut), loading: meQuery.isLoading || attendanceQuery.isLoading, refresh: invalidateAll,
    checkIn: async (payload) => { await checkInMutation.mutateAsync({ date: todayKey(), time: payload.time, status: payload.status, lateMinutes: payload.lateMinutes, distanceMeters: payload.distanceMeters }); invalidateAll(); },
    checkOut: async (time) => { await checkOutMutation.mutateAsync({ date: todayKey(), time }); invalidateAll(); },
    submitRequest: async (request) => { await requestMutation.mutateAsync({ type: request.type, fromDate: request.from, toDate: request.to, reason: request.reason }); invalidateAll(); },
    approveRequest: async (id, status) => { await reviewMutation.mutateAsync({ id: Number(id), status: status as "مقبول" | "مرفوض" }); invalidateAll(); },
    createStaffAccount: async (input) => { await createStaffMutation.mutateAsync({ ...input, shiftStart: "09:00", shiftEnd: "18:00" }); invalidateAll(); },
    updateStaffAccount: async (input) => { await updateStaffMutation.mutateAsync(input); invalidateAll(); },
    updateBranch: async (input) => { await updateCompanyMutation.mutateAsync(input); invalidateAll(); },
  }), [role, employee, branch, meQuery.data?.shiftStart, meQuery.data?.shiftEnd, records, requests, staffMembers, payrollInputs, payroll, todayRecord, meQuery.isLoading, attendanceQuery.isLoading, checkInMutation, checkOutMutation, requestMutation, reviewMutation, createStaffMutation, updateStaffMutation, updateCompanyMutation]);
  return <AppData.Provider value={value}>{children}</AppData.Provider>;
}

export function useAppData() {
  const value = useContext(AppData);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
