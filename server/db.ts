import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  attendanceRecords,
  companySettings,
  shiftTemplates,
  type AttendanceRecord,
  type InsertUser,
  staffAccounts,
  staffRequests,
  staffSessions,
  weeklySchedules,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { summarizeAttendance, summarizeRequests } from "../lib/report-utils";
import { companyMembers } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function countStaffAccounts() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: staffAccounts.id }).from(staffAccounts).limit(1);
  return result.length;
}

export async function createStaffAccount(input: {
  phone: string;
  password: string;
  name: string;
  title?: string;
  department?: string;
  role: "manager" | "supervisor" | "employee";
  baseSalary?: number;
  shiftStart?: string;
  shiftEnd?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(staffAccounts).values({
    phone: input.phone.trim(),
    passwordHash: hashPassword(input.password),
    name: input.name.trim(),
    title: input.title?.trim() || null,
    department: input.department?.trim() || null,
    role: input.role,
    baseSalary: input.baseSalary ?? 0,
    shiftStart: input.shiftStart ?? "09:00",
    shiftEnd: input.shiftEnd ?? "18:00",
  });
  return getStaffAccountById(Number(result[0].insertId));
}

export async function getStaffAccountById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(staffAccounts).where(eq(staffAccounts.id, id)).limit(1);
  return result[0];
}

export async function listStaffAccounts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: staffAccounts.id,
    phone: staffAccounts.phone,
    name: staffAccounts.name,
    title: staffAccounts.title,
    department: staffAccounts.department,
    role: staffAccounts.role,
    baseSalary: staffAccounts.baseSalary,
    shiftStart: staffAccounts.shiftStart,
    shiftEnd: staffAccounts.shiftEnd,
    active: staffAccounts.active,
    createdAt: staffAccounts.createdAt,
  }).from(staffAccounts).orderBy(desc(staffAccounts.createdAt));
}

export async function updateStaffAccount(id: number, input: { phone?: string; name?: string; title?: string; department?: string; baseSalary?: number; shiftStart?: string; shiftEnd?: string; active?: boolean; password?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: Record<string, unknown> = {};
  if (input.phone !== undefined) values.phone = input.phone.trim();
  if (input.name !== undefined) values.name = input.name.trim();
  if (input.title !== undefined) values.title = input.title.trim() || null;
  if (input.department !== undefined) values.department = input.department.trim() || null;
  if (input.baseSalary !== undefined) values.baseSalary = input.baseSalary;
  if (input.shiftStart !== undefined) values.shiftStart = input.shiftStart;
  if (input.shiftEnd !== undefined) values.shiftEnd = input.shiftEnd;
  if (input.active !== undefined) values.active = input.active;
  if (input.password) values.passwordHash = hashPassword(input.password);
  if (Object.keys(values).length) await db.update(staffAccounts).set({ ...values, updatedAt: new Date() }).where(eq(staffAccounts.id, id));
  return getStaffAccountById(id);
}

export async function getCompanySettings() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companySettings).limit(1);
  return result[0];
}

export async function updateCompanySettings(input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const current = await getCompanySettings();
  if (current) await db.update(companySettings).set({ ...input, updatedAt: new Date() }).where(eq(companySettings.id, current.id));
  else await db.insert(companySettings).values(input);
  return getCompanySettings();
}

export async function listShiftTemplates() {
  const db = await getDb();
  if (!db) return [];
  const existing = await db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
  const seed = [];
  if (!existing.some((item) => item.kind === "shift" && item.name === "الشيفت الصباحي")) seed.push({ name: "الشيفت الصباحي", kind: "shift", startTime: "08:00", endTime: "17:00", crossesMidnight: false, active: true });
  if (!existing.some((item) => item.kind === "shift" && item.name === "الشيفت المسائي")) seed.push({ name: "الشيفت المسائي", kind: "shift", startTime: "16:00", endTime: "01:00", crossesMidnight: true, active: true });
  if (!existing.some((item) => item.kind === "weekly_off")) seed.push({ name: "إجازة أسبوعية", kind: "weekly_off", startTime: "00:00", endTime: "00:00", crossesMidnight: false, active: true });
  if (seed.length) await db.insert(shiftTemplates).values(seed);
  return db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
}

export async function listSchedules(staffAccountId?: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = staffAccountId === undefined
    ? await db.select().from(weeklySchedules).orderBy(weeklySchedules.scheduleDate)
    : await db.select().from(weeklySchedules).where(eq(weeklySchedules.staffAccountId, staffAccountId)).orderBy(weeklySchedules.scheduleDate);
  const shifts = await listShiftTemplates();
  return rows.map((row) => ({ ...row, shift: shifts.find((item) => item.id === row.shiftTemplateId) ?? null }));
}

export async function saveSchedule(input: { staffAccountId: number; scheduleDate: string; shiftTemplateId: number; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(weeklySchedules).where(and(eq(weeklySchedules.staffAccountId, input.staffAccountId), eq(weeklySchedules.scheduleDate, input.scheduleDate))).limit(1);
  if (existing[0]) await db.update(weeklySchedules).set({ shiftTemplateId: input.shiftTemplateId, note: input.note ?? null, updatedAt: new Date() }).where(eq(weeklySchedules.id, existing[0].id));
  else await db.insert(weeklySchedules).values({ ...input, note: input.note ?? null });
  return listSchedules(input.staffAccountId);
}

export async function authenticateStaff(phone: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(staffAccounts).where(and(eq(staffAccounts.phone, phone.trim()), eq(staffAccounts.active, true))).limit(1);
  const staff = result[0];
  if (!staff || !verifyPassword(password, staff.passwordHash)) return null;
  return staff;
}

export async function createStaffSession(staffAccountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const token = randomBytes(32).toString("hex");
  await db.insert(staffSessions).values({
    staffAccountId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
  });
  return token;
}

export async function getStaffBySessionToken(token: string | null | undefined) {
  const db = await getDb();
  if (!db || !token) return undefined;
  const sessions = await db.select().from(staffSessions).where(and(eq(staffSessions.tokenHash, hashSessionToken(token)), gt(staffSessions.expiresAt, new Date()))).limit(1);
  const session = sessions[0];
  if (!session) return undefined;
  return getStaffAccountById(session.staffAccountId);
}

export async function deleteStaffSession(token: string | null | undefined) {
  const db = await getDb();
  if (!db || !token) return;
  await db.delete(staffSessions).where(eq(staffSessions.tokenHash, hashSessionToken(token)));
}

export async function listAttendance(staffAccountId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(attendanceRecords).where(eq(attendanceRecords.staffAccountId, staffAccountId)).orderBy(desc(attendanceRecords.date));
}

export async function upsertAttendance(input: Omit<AttendanceRecord, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.staffAccountId, input.staffAccountId), eq(attendanceRecords.date, input.date))).limit(1);
  if (existing[0]) {
    await db.update(attendanceRecords).set({ ...input, updatedAt: new Date() }).where(eq(attendanceRecords.id, existing[0].id));
    return getAttendanceById(existing[0].id);
  }
  const result = await db.insert(attendanceRecords).values(input);
  return getAttendanceById(Number(result[0].insertId));
}

export async function getAttendanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1);
  return result[0];
}

export async function updateAttendanceByManager(input: { staffAccountId: number; date: string; checkIn?: string | null; checkOut?: string | null; status: string; lateMinutes: number; distanceMeters?: number | null; note?: string | null }) {
  return upsertAttendance({
    staffAccountId: input.staffAccountId,
    date: input.date,
    checkIn: input.checkIn ?? null,
    checkOut: input.checkOut ?? null,
    status: input.status,
    lateMinutes: input.lateMinutes,
    distanceMeters: input.distanceMeters ?? null,
    note: input.note ?? null,
  });
}

export async function listRequests(staffAccountId?: number) {
  const db = await getDb();
  if (!db) return [];
  return staffAccountId === undefined
    ? db.select().from(staffRequests).orderBy(desc(staffRequests.createdAt))
    : db.select().from(staffRequests).where(eq(staffRequests.staffAccountId, staffAccountId)).orderBy(desc(staffRequests.createdAt));
}

export async function createRequest(input: { staffAccountId: number; type: string; fromDate: string; toDate: string; reason: string; hours?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(staffRequests).values(input);
  return getRequestById(Number(result[0].insertId));
}

export async function approveRequest(id: number, managerId: number, status: "مقبول" | "مرفوض") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(staffRequests).set({ status, reviewedBy: managerId, reviewedAt: new Date() }).where(eq(staffRequests.id, id));
  return getRequestById(id);
}

export async function getMonthlyStaffReports(month: string, companyId?: number) {
  const db = await getDb();
  if (!db) return { month, employees: [], summary: { staffCount: 0, presentDays: 0, absentDays: 0, lateMinutes: 0, pendingRequests: 0 } };
  const [staff, attendance, requests] = await Promise.all([
    listStaffAccounts(),
    db.select().from(attendanceRecords),
    db.select().from(staffRequests),
  ]);
  let companyStaffIds: Set<number> | null = null;
  if (companyId !== undefined) {
    const members = await db.select({ staffAccountId: companyMembers.staffAccountId }).from(companyMembers).where(eq(companyMembers.companyId, companyId));
    companyStaffIds = new Set(members.map(member => member.staffAccountId));
  }
  const employees = staff.filter((member) => member.role === "employee" && (companyStaffIds === null || companyStaffIds.has(member.id))).map((member) => {
    const records = attendance.filter((record) => record.staffAccountId === member.id && record.date.startsWith(month));
    const memberRequests = requests.filter((request) => request.staffAccountId === member.id && (request.fromDate.startsWith(month) || request.toDate.startsWith(month)));
    const attendanceSummary = summarizeAttendance(records);
    const requestSummary = summarizeRequests(memberRequests);
    return {
      id: member.id,
      name: member.name,
      phone: member.phone,
      title: member.title,
      department: member.department,
      baseSalary: member.baseSalary,
      active: member.active,
      ...attendanceSummary,
      ...requestSummary,
      records: records.map((record) => ({ id: record.id, date: record.date, checkIn: record.checkIn, checkOut: record.checkOut, status: record.status, lateMinutes: record.lateMinutes })),
    };
  });
  return {
    month,
    employees,
    summary: {
      staffCount: employees.length,
      presentDays: employees.reduce((sum, member) => sum + member.presentDays, 0),
      absentDays: employees.reduce((sum, member) => sum + member.absentDays, 0),
      lateMinutes: employees.reduce((sum, member) => sum + member.lateMinutes, 0),
      pendingRequests: employees.reduce((sum, member) => sum + member.pendingRequests, 0),
    },
  };
}

async function getRequestById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(staffRequests).where(eq(staffRequests.id, id)).limit(1);
  return result[0];
}
