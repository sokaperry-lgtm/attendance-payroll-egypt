import React, { createContext, useContext, useMemo, useState } from "react";
import { calculatePayroll, todayKey, type PayrollInputs } from "@/lib/payroll";

export type Role = "employee" | "manager";
export type AttendanceState = "حاضر" | "متأخر" | "إجازة" | "غياب" | "مأمورية";
export type RequestType = "إجازة" | "إذن" | "مأمورية";
export type RequestStatus = "قيد المراجعة" | "مقبول" | "مرفوض";

export type Branch = {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
};

export type Shift = {
  name: string;
  start: string;
  end: string;
  days: string;
};

export type AttendanceRecord = {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: AttendanceState;
  lateMinutes: number;
  distanceMeters?: number;
  note?: string;
};

export type LeaveRequest = {
  id: string;
  type: RequestType;
  from: string;
  to: string;
  reason: string;
  status: RequestStatus;
};

export type Employee = {
  id: string;
  name: string;
  title: string;
  department: string;
  baseSalary: number;
  initials: string;
};

export const demoEmployee: Employee = {
  id: "emp-001",
  name: "أحمد محمد",
  title: "مسؤول مبيعات",
  department: "المبيعات",
  baseSalary: 12000,
  initials: "أم",
};

const initialRecords: AttendanceRecord[] = [
  { id: "att-1", date: "2026-09-14", checkIn: "09:03", checkOut: "18:02", status: "حاضر", lateMinutes: 0 },
  { id: "att-2", date: "2026-09-13", checkIn: "09:27", checkOut: "18:00", status: "متأخر", lateMinutes: 12 },
  { id: "att-3", date: "2026-09-12", checkIn: "08:56", checkOut: "18:05", status: "حاضر", lateMinutes: 0 },
  { id: "att-4", date: "2026-09-11", status: "إجازة", lateMinutes: 0, note: "إجازة أسبوعية" },
  { id: "att-5", date: "2026-09-10", checkIn: "09:00", checkOut: "18:01", status: "حاضر", lateMinutes: 0 },
];

const initialRequests: LeaveRequest[] = [
  { id: "req-1", type: "إذن", from: "2026-09-16", to: "2026-09-16", reason: "موعد طبي لمدة ساعتين", status: "قيد المراجعة" },
  { id: "req-2", type: "إجازة", from: "2026-09-22", to: "2026-09-23", reason: "ظرف عائلي", status: "مقبول" },
];

type AppDataContext = {
  role: Role;
  setRole: (role: Role) => void;
  employee: Employee;
  branch: Branch;
  shift: Shift;
  records: AttendanceRecord[];
  requests: LeaveRequest[];
  payrollInputs: PayrollInputs;
  payroll: ReturnType<typeof calculatePayroll>;
  todayRecord?: AttendanceRecord;
  checkedIn: boolean;
  checkIn: (payload: { time: string; distanceMeters: number; status: AttendanceState; lateMinutes: number }) => void;
  checkOut: (time: string) => void;
  submitRequest: (request: Omit<LeaveRequest, "id" | "status">) => void;
  approveRequest: (id: string, status: RequestStatus) => void;
  updateBranchRadius: (radiusMeters: number) => void;
};

const AppData = createContext<AppDataContext | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("employee");
  const [branch, setBranch] = useState<Branch>({
    name: "الفرع الرئيسي",
    address: "مدينة نصر، القاهرة",
    latitude: 30.0444,
    longitude: 31.2357,
    radiusMeters: 200,
  });
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests);

  const todayRecord = records.find((record) => record.date === todayKey());
  const payrollInputs: PayrollInputs = useMemo(() => ({
    baseSalary: demoEmployee.baseSalary,
    allowances: 1500,
    bonuses: 500,
    overtimeHours: 3,
    overtimeRate: 70,
    absences: records.filter((record) => record.status === "غياب").length,
    lateMinutes: records.reduce((total, record) => total + record.lateMinutes, 0),
    deductions: 0,
    advances: 1000,
  }), [records]);
  const payroll = useMemo(() => calculatePayroll(payrollInputs), [payrollInputs]);

  const value = useMemo<AppDataContext>(() => ({
    role,
    setRole,
    employee: demoEmployee,
    branch,
    shift: { name: "وردية صباحية", start: "09:00", end: "18:00", days: "السبت — الخميس" },
    records,
    requests,
    payrollInputs,
    payroll,
    todayRecord,
    checkedIn: Boolean(todayRecord?.checkIn && !todayRecord?.checkOut),
    checkIn: ({ time, distanceMeters, status, lateMinutes }) => {
      const date = todayKey();
      setRecords((current) => {
        const withoutToday = current.filter((record) => record.date !== date);
        return [{ id: `att-${Date.now()}`, date, checkIn: time, status, lateMinutes, distanceMeters }, ...withoutToday];
      });
    },
    checkOut: (time) => {
      setRecords((current) => current.map((record) => record.date === todayKey() ? { ...record, checkOut: time } : record));
    },
    submitRequest: (request) => {
      setRequests((current) => [{ ...request, id: `req-${Date.now()}`, status: "قيد المراجعة" }, ...current]);
    },
    approveRequest: (id, status) => {
      setRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
    },
    updateBranchRadius: (radiusMeters) => setBranch((current) => ({ ...current, radiusMeters })),
  }), [branch, payroll, payrollInputs, records, requests, role, todayRecord]);

  return <AppData.Provider value={value}>{children}</AppData.Provider>;
}

export function useAppData() {
  const value = useContext(AppData);
  if (!value) throw new Error("useAppData must be used inside AppDataProvider");
  return value;
}
