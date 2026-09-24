import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, getStaffAccountById } from "./db";
import * as dbQueries from "./db";
import { calculateEgyptPayroll } from "./egypt-payroll";
import { PAYROLL_RULES } from "../lib/payroll";
import {
  companies, branches, companyMembers, leaveBalances,
  payrollRecords, notifications, subscriptions, auditLogs, staffAccounts,
  attendanceRecords, staffRequests, weeklySchedules, shiftTemplates, salaryAdjustments, salaryAdvances, employeeDocuments
} from "../drizzle/schema";

export type CompanyRole = "owner" | "hr" | "manager" | "supervisor" | "accountant" | "employee";

export async function getMembership(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(companyMembers).where(eq(companyMembers.staffAccountId, staffAccountId)).limit(1);
  const membership = rows[0];
  if (!membership) return undefined;

  // Membership is the source of truth for company permissions.
  // The legacy staff role is kept only for backwards compatibility and must
  // never promote every manager into an owner.
  return membership;
}

export async function ensureCompanyForStaff(staffAccountId: number, companyName = "الشركة الرئيسية") {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const existing = await getMembership(staffAccountId);
  if (existing) return existing;
  // Never attach an unassigned staff account to an arbitrary existing company.
  // A missing membership means this account needs its own initial tenant.
  let company: typeof companies.$inferSelect | undefined = (await db.select().from(companies).limit(1))[0];
  if (company) {
    const hasMembers = (await db.select({ id: companyMembers.id }).from(companyMembers).where(eq(companyMembers.companyId, company.id)).limit(1)).length > 0;
    if (hasMembers) company = undefined;
  }
  if (!company) {
    const result = await db.insert(companies).values({ name: companyName, currency: "EGP", timezone: "Africa/Cairo" });
    company = (await db.select().from(companies).where(eq(companies.id, Number(result[0].insertId))).limit(1))[0];
  }
  if (!company) throw new Error("Company could not be created");
  let branch = (await db.select().from(branches).where(eq(branches.companyId, company.id)).limit(1))[0];
  if (!branch) {
    const result = await db.insert(branches).values({ companyId: company.id, name: "الفرع الرئيسي", address: "القاهرة", latitude: "30.0444", longitude: "31.2357", radiusMeters: 200 });
    branch = (await db.select().from(branches).where(eq(branches.id, Number(result[0].insertId))).limit(1))[0];
  }
  const staff = (await db.select().from(staffAccounts).where(eq(staffAccounts.id, staffAccountId)).limit(1))[0];
  const role: CompanyRole = staff?.role === "manager" ? "owner" : staff?.role === "supervisor" ? "supervisor" : "employee";
  const result = await db.insert(companyMembers).values({ companyId: company.id, branchId: branch?.id ?? null, staffAccountId, role });
  return (await db.select().from(companyMembers).where(eq(companyMembers.id, Number(result[0].insertId))).limit(1))[0];
}

export async function assertStaffInCompany(actorStaffAccountId: number, targetStaffAccountId: number) {
  const actor = await getCompanyForStaff(actorStaffAccountId);
  if (!actor) throw new Error("Company not found");
  const target = await getMembership(targetStaffAccountId);
  if (!target || target.companyId !== actor.companyId || !target.active) throw new Error("الموظف غير موجود في الشركة");
  return { actor, target };
}

export async function listCompanyAttendance(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  const members = await db.select({ staffAccountId: companyMembers.staffAccountId }).from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const ids = members.map(x => x.staffAccountId);
  if (!ids.length) return [];
  return db.select().from(attendanceRecords).where(inArray(attendanceRecords.staffAccountId, ids)).orderBy(desc(attendanceRecords.date));
}

export async function listCompanyStaff(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const ids = new Set(members.map(x => x.staffAccountId));
  const rows = await db.select({
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
  return rows.filter(row => ids.has(row.id));
}

export async function getCompanyForStaff(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const membership = await getMembership(staffAccountId);
  if (!membership) return ensureCompanyForStaff(staffAccountId);
  return membership;
}

export async function getBranchForStaff(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const m = await getCompanyForStaff(staffAccountId);
  if (!m?.branchId) return undefined;
  return (await db.select().from(branches).where(eq(branches.id, m.branchId)).limit(1))[0];
}

export async function getCompanyAdminOverview(staffAccountId: number) {
  const db = await getDb(); if (!db) return null;
  const m = await getCompanyForStaff(staffAccountId); if (!m) return null;
  const company = (await db.select().from(companies).where(eq(companies.id, m.companyId)).limit(1))[0];
  if (!company) return null;
  const branchRows = await db.select().from(branches).where(eq(branches.companyId, m.companyId)).orderBy(desc(branches.createdAt));
  const members = await db.select().from(companyMembers).where(and(eq(companyMembers.companyId, m.companyId), eq(companyMembers.active, true)));
  return {
    company,
    branchCount: branchRows.length,
    activeBranchCount: branchRows.filter(b => b.active).length,
    employeeCount: members.length,
  };
}

export async function listCompanyBranches(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  const rows = await db.select().from(branches).where(eq(branches.companyId, m.companyId)).orderBy(desc(branches.createdAt));
  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const staff = await db.select({ id: staffAccounts.id, name: staffAccounts.name }).from(staffAccounts);
  return rows.map(branch => {
    const branchMembers = members.filter(member => member.branchId === branch.id && member.active);
    const manager = branchMembers.find(member => member.role === "manager" || member.role === "owner");
    return {
      ...branch,
      employeeCount: branchMembers.length,
      managerName: manager ? (staff.find(s => s.id === manager.staffAccountId)?.name ?? null) : null,
    };
  });
}

export async function listCompanyMembers(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  const members = await db.select().from(companyMembers).where(and(eq(companyMembers.companyId, m.companyId), eq(companyMembers.active, true)));
  const staff = await db.select({
    id: staffAccounts.id, name: staffAccounts.name, phone: staffAccounts.phone,
    title: staffAccounts.title, department: staffAccounts.department, role: staffAccounts.role, active: staffAccounts.active,
  }).from(staffAccounts);
  const branchRows = await db.select({ id: branches.id, name: branches.name, active: branches.active })
    .from(branches).where(eq(branches.companyId, m.companyId));
  return members.map(member => {
    const person = staff.find(s => s.id === member.staffAccountId);
    const branch = branchRows.find(b => b.id === member.branchId);
    return person ? { ...person, membershipRole: member.role, branchId: member.branchId, branchName: branch?.name ?? null } : null;
  }).filter(Boolean);
}

export async function createBranch(staffAccountId: number, input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name || !address) throw new Error("اسم الفرع والعنوان مطلوبان");
  const result = await db.insert(branches).values({ ...input, name, address, companyId: m.companyId });
  const branch = (await db.select().from(branches).where(eq(branches.id, Number(result[0].insertId))).limit(1))[0];
  await writeAudit(staffAccountId, m.companyId, "branch.created", "branch", String(branch?.id ?? result[0].insertId), input);
  return branch;
}

export async function updateBranch(staffAccountId: number, branchId: number, input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const branch = (await db.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.companyId, m.companyId))).limit(1))[0];
  if (!branch) throw new Error("الفرع غير موجود");
  await db.update(branches).set({ ...input, name: input.name.trim(), address: input.address.trim(), updatedAt: new Date() }).where(eq(branches.id, branchId));
  await writeAudit(staffAccountId, m.companyId, "branch.updated", "branch", String(branchId), input);
  return (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
}

export async function toggleBranch(staffAccountId: number, branchId: number, active: boolean) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const branch = (await db.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.companyId, m.companyId))).limit(1))[0];
  if (!branch) throw new Error("الفرع غير موجود");
  if (!active) {
    const activeBranches = await db.select({ id: branches.id }).from(branches).where(and(eq(branches.companyId, m.companyId), eq(branches.active, true)));
    if (activeBranches.length <= 1) throw new Error("لا يمكن إيقاف الفرع الوحيد النشط.");
  }
  await db.update(branches).set({ active, updatedAt: new Date() }).where(eq(branches.id, branchId));
  await writeAudit(staffAccountId, m.companyId, active ? "branch.activated" : "branch.deactivated", "branch", String(branchId));
  return (await db.select().from(branches).where(eq(branches.id, branchId)).limit(1))[0];
}

export async function assignMemberToBranch(actorId: number, staffAccountId: number, branchId: number | null) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(actorId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const target = await getMembership(staffAccountId);
  if (!target || target.companyId !== m.companyId || !target.active) throw new Error("الموظف غير موجود في الشركة");
  if (branchId !== null) {
    const branch = (await db.select().from(branches).where(and(eq(branches.id, branchId), eq(branches.companyId, m.companyId), eq(branches.active, true))).limit(1))[0];
    if (!branch) throw new Error("الفرع غير موجود أو موقوف");
  }
  await db.update(companyMembers).set({ branchId, updatedAt: new Date() })
    .where(and(eq(companyMembers.id, target.id), eq(companyMembers.companyId, m.companyId)));
  await writeAudit(actorId, m.companyId, "member.branch_updated", "staff", String(staffAccountId), { branchId });
  return getMembership(staffAccountId);
}

export async function updateCompanyProfile(staffAccountId: number, input: { name: string; legalName?: string; email?: string; phone?: string }) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const name = input.name.trim();
  if (!name) throw new Error("اسم الشركة مطلوب");
  await db.update(companies).set({
    name,
    legalName: input.legalName?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    updatedAt: new Date(),
  }).where(eq(companies.id, m.companyId));
  await writeAudit(staffAccountId, m.companyId, "company.updated", "company", String(m.companyId), input);
  return (await db.select().from(companies).where(eq(companies.id, m.companyId)).limit(1))[0];
}

export async function listCompanySchedules(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  const members = await db.select({ staffAccountId: companyMembers.staffAccountId }).from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const ids = new Set(members.map(row => row.staffAccountId));
  const rows = await db.select().from(weeklySchedules).orderBy(desc(weeklySchedules.scheduleDate));
  const shifts = await db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
  return rows.filter(row => ids.has(row.staffAccountId)).map(row => ({ ...row, shift: shifts.find(item => item.id === row.shiftTemplateId) ?? null }));
}

export async function setMemberRole(actorId: number, staffAccountId: number, role: CompanyRole) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const actor = await getCompanyForStaff(actorId);
  if (!actor || !["owner","manager"].includes(actor.role)) throw new Error("غير مصرح");

  // The owner is the tenant root account and can only be changed by the owner.
  // Managers may manage ordinary members, but cannot demote or replace the owner.
  const target = await getMembership(staffAccountId);
  if (!target || target.companyId !== actor.companyId || !target.active) {
    throw new Error("الموظف غير موجود في الشركة");
  }
  if (target.role === "owner") {
    throw new Error("لا يمكن تغيير صلاحيات حساب المالك.");
  }
  if (role === "owner") throw new Error("لا يمكن تعيين دور المالك من شاشة الموظفين.");
  if (!target || target.companyId !== actor.companyId || !target.active) {
    throw new Error("الموظف غير موجود في الشركة");
  }
  if (staffAccountId === actorId) {
    throw new Error("لا يمكن تغيير دور حسابك من هذه الشاشة.");
  }

  // Keep the legacy staff role aligned with the company role. Only the
  // manager/supervisor/employee roles grant staff-level middleware access.
  // HR/accountant remain company roles without accidentally becoming a
  // global manager and bypassing supervisor-only boundaries.
  const staffRole: "manager" | "supervisor" | "employee" =
    role === "manager" ? "manager" :
    role === "supervisor" ? "supervisor" :
    "employee";

  await db.update(companyMembers)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(companyMembers.staffAccountId, staffAccountId), eq(companyMembers.companyId, actor.companyId)));

  await db.update(staffAccounts)
    .set({ role: staffRole, updatedAt: new Date() })
    .where(eq(staffAccounts.id, staffAccountId));

  await writeAudit(actorId, actor.companyId, "role.updated", "staff", String(staffAccountId), { role });
  return getMembership(staffAccountId);
}

export async function ensureLeaveBalance(staffAccountId: number, year: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m) throw new Error("Company not found");
  const existing = (await db.select().from(leaveBalances).where(and(eq(leaveBalances.staffAccountId, staffAccountId), eq(leaveBalances.companyId, m.companyId), eq(leaveBalances.year, year))).limit(1))[0];
  if (existing) return existing;
  const result = await db.insert(leaveBalances).values({ companyId: m.companyId, staffAccountId, year });
  return (await db.select().from(leaveBalances).where(eq(leaveBalances.id, Number(result[0].insertId))).limit(1))[0];
}

export async function getLeaveBalance(staffAccountId: number, year: number) {
  return ensureLeaveBalance(staffAccountId, year);
}

export async function listNotifications(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.staffAccountId, staffAccountId)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function createNotification(staffAccountId: number, type: string, title: string, body: string) {
  const db = await getDb(); if (!db) return undefined;
  const membership = await getMembership(staffAccountId);
  if (!membership || !membership.active) return undefined;
  const result = await db.insert(notifications).values({ staffAccountId, type, title, body });
  return (await db.select().from(notifications).where(eq(notifications.id, Number(result[0].insertId))).limit(1))[0];
}

export async function notifyCompanyRoles(actorId: number, roles: CompanyRole[], type: string, title: string, body: string) {
  const db = await getDb(); if (!db) return 0;
  const actor = await getCompanyForStaff(actorId);
  if (!actor) return 0;
  const members = await db.select({ staffAccountId: companyMembers.staffAccountId, role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, actor.companyId), eq(companyMembers.active, true)));
  let sent = 0;
  for (const member of members) {
    if (member.staffAccountId === actorId || !roles.includes(member.role as CompanyRole)) continue;
    const created = await createNotification(member.staffAccountId, type, title, body);
    if (created) sent += 1;
  }
  return sent;
}

export async function getUnreadNotificationCount(staffAccountId: number) {
  const db = await getDb(); if (!db) return 0;
  const rows = await db.select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.staffAccountId, staffAccountId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markNotificationRead(staffAccountId: number, id: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.staffAccountId, staffAccountId)));
  return { success: true };
}

export async function getSubscription(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const m = await getCompanyForStaff(staffAccountId); if (!m) return undefined;
  let sub = (await db.select().from(subscriptions).where(eq(subscriptions.companyId, m.companyId)).limit(1))[0];
  if (!sub) {
    const result = await db.insert(subscriptions).values({ companyId: m.companyId, plan: "trial", status: "trialing", seats: 10, monthlyPrice: 0, trialEndsAt: new Date(Date.now()+14*86400000) });
    sub = (await db.select().from(subscriptions).where(eq(subscriptions.id, Number(result[0].insertId))).limit(1))[0];
  }
  return sub;
}

export async function updateSubscription(staffAccountId: number, plan: string) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const plans: Record<string,{seats:number;price:number}> = { trial:{seats:10,price:0}, starter:{seats:25,price:999}, growth:{seats:75,price:2499}, scale:{seats:250,price:5999} };
  const p=plans[plan]; if (!p) throw new Error("الباقة غير صحيحة");
  const current = await getSubscription(staffAccountId);
  if (!current) throw new Error("Subscription unavailable");
  await db.update(subscriptions).set({ plan, status:"active", seats:p.seats, monthlyPrice:p.price, currentPeriodStart:new Date(), currentPeriodEnd:new Date(Date.now()+30*86400000), updatedAt:new Date() }).where(eq(subscriptions.id,current.id));
  await writeAudit(staffAccountId,m.companyId,"subscription.updated","subscription",String(current.id),{plan});
  return getSubscription(staffAccountId);
}

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function shiftMinutes(start: string, end: string, crossesMidnight = false) {
  const a = minutesOf(start);
  let b = minutesOf(end);
  if (crossesMidnight || b < a) b += 24 * 60;
  return Math.max(0, b - a);
}

export function overtimeAfterShiftEndMinutes(
  checkIn: string,
  checkOut: string,
  shiftStart: string,
  shiftEnd: string,
  crossesMidnight = false,
) {
  const startMinutes = minutesOf(shiftStart);
  const inferredCrossesMidnight = crossesMidnight || minutesOf(shiftEnd) < startMinutes;
  const scheduledEnd = minutesOf(shiftEnd) + (inferredCrossesMidnight ? 24 * 60 : 0);
  let actualCheckout = minutesOf(checkOut);
  const actualCheckIn = minutesOf(checkIn);

  // Treat an end time earlier than the start time as an overnight shift even
  // when older data was saved without the explicit crossesMidnight flag.
  if (actualCheckout < actualCheckIn) {
    if (!inferredCrossesMidnight) return 0;
    actualCheckout += 24 * 60;
  }

  return Math.max(0, actualCheckout - scheduledEnd);
}

function dateRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function isApprovedLeave(requests: Array<typeof staffRequests.$inferSelect>, staffAccountId: number, date: string) {
  return requests.some(request =>
    request.staffAccountId === staffAccountId &&
    request.status === "مقبول" &&
    request.fromDate <= date &&
    request.toDate >= date &&
    (request.type.includes("إجاز") || request.type.includes("اجاز") || request.type.includes("مرض"))
  );
}

export async function syncMonthlyAttendance(staffAccountId: number, month: string) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m) throw new Error("Company not found");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("صيغة الشهر غير صحيحة. استخدم YYYY-MM.");

  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const ids = new Set(members.map(x => x.staffAccountId));
  const staff = (await db.select().from(staffAccounts).where(eq(staffAccounts.active, true))).filter(x => ids.has(x.id));
  const schedules = await db.select().from(weeklySchedules);
  const shifts = await db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
  const requests = await db.select().from(staffRequests);
  const existing = await db.select().from(attendanceRecords);
  // A closed payroll month is immutable: do not auto-create or rewrite attendance
  // for employees whose payroll is already approved.
  const approvedPayrollRows = await db.select({
    staffAccountId: payrollRecords.staffAccountId,
  }).from(payrollRecords).where(and(
    eq(payrollRecords.companyId, m.companyId),
    eq(payrollRecords.month, month),
    eq(payrollRecords.status, "approved"),
  ));
  const closedStaffIds = new Set(approvedPayrollRows.map(row => row.staffAccountId));

  let createdAbsences = 0;
  let markedLeaves = 0;

  for (const employee of staff) {
    if (closedStaffIds.has(employee.id)) continue;
    for (const date of dateRange(month)) {
      const todayParts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const todayValues = Object.fromEntries(todayParts.map(part => [part.type, part.value]));
      const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
      if (date > today) continue;

      const scheduled = schedules.find(x => x.staffAccountId === employee.id && x.scheduleDate === date);
      const shift = scheduled ? shifts.find(x => x.id === scheduled.shiftTemplateId) : undefined;

      // An explicit weekly-off schedule always wins.
      if (shift?.kind === "weekly_off") continue;

      const day = new Date(`${date}T12:00:00`).getDay();
      // If no explicit schedule exists, use the employee's normal Mon-Fri work week.
      const isWorkday = scheduled ? true : day !== 5 && day !== 6;
      if (!isWorkday) continue;

      const record = existing.find(x => x.staffAccountId === employee.id && x.date === date);
      const onLeave = isApprovedLeave(requests, employee.id, date);

      if (onLeave) {
        // Never overwrite a manager's attendance decision while syncing approved leave.
        const hasReviewedException = Boolean(record?.note && (
          record.note.includes("تم اعتماد التأخير") ||
          record.note.includes("تم اعتماد الانصراف المبكر") ||
          record.note.includes("تم اعتماد الغياب") ||
          record.note.includes("تم إلغاء التأخير") ||
          record.note.includes("تم إلغاء الانصراف المبكر") ||
          record.note.includes("تم إلغاء الغياب")
        ));
        if (hasReviewedException) continue;
        if (!record) {
          await dbQueries.upsertAttendance({
            staffAccountId: employee.id,
            date,
            checkIn: null,
            checkOut: null,
            status: "إجازة",
            lateMinutes: 0,
            distanceMeters: null,
            note: "إجازة معتمدة",
          });
          markedLeaves++;
        } else if (record.status === "غياب" && !record.checkIn && !record.checkOut) {
          await dbQueries.upsertAttendance({ ...record, status: "إجازة", note: "إجازة معتمدة", updatedAt: new Date() });
          markedLeaves++;
        }
        continue;
      }

      if (!record) {
        // Do not mark today absent before the employee's scheduled shift has ended.
        // For overnight shifts, the shift ends on the following calendar day.
        const todayParts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Africa/Cairo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(new Date());
        const todayValues = Object.fromEntries(todayParts.map(part => [part.type, part.value]));
        const today = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
        if (date === today) {
          const shiftStart = minutesOf(shift?.startTime ?? employee.shiftStart);
          const shiftEnd = minutesOf(shift?.endTime ?? employee.shiftEnd);
          // Legacy schedules may omit the explicit overnight flag. Infer it
          // safely from an end time earlier than the start time.
          const crossesMidnight = (shift?.crossesMidnight ?? false) || shiftEnd < shiftStart;

          const nowTimeParts = new Intl.DateTimeFormat("en-GB", {
            timeZone: "Africa/Cairo",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).formatToParts(new Date());
          const nowValues = Object.fromEntries(nowTimeParts.map(part => [part.type, part.value]));
          const nowMinutes = Number(nowValues.hour) * 60 + Number(nowValues.minute);

          // For an overnight shift, today's row represents the shift that
          // starts today and ends tomorrow. It must never become absent today.
          // Tomorrow's sync will evaluate the previous date after the real
          // shift end has passed.
          if (crossesMidnight) continue;

          // For a normal same-day shift, wait until the scheduled end before
          // auto-creating an absence.
          if (nowMinutes < shiftEnd) continue;

          // Avoid creating an absence before the employee's shift starts.
          if (nowMinutes < shiftStart) continue;
        }
        await dbQueries.upsertAttendance({
          staffAccountId: employee.id,
          date,
          checkIn: null,
          checkOut: null,
          status: "غياب",
          lateMinutes: 0,
          distanceMeters: null,
          note: "غياب تلقائي — لا يوجد تسجيل حضور",
        });
        createdAbsences++;
      }
    }
  }

  if (createdAbsences || markedLeaves) {
    await writeAudit(staffAccountId, m.companyId, "attendance.auto_sync", "attendance", month, { createdAbsences, markedLeaves });
  }

  return { month, createdAbsences, markedLeaves };
}

export async function getAttendanceWorkSummary(staffAccountId: number, month: string) {
  const db = await getDb(); if (!db) return { employees: [], totalWorkMinutes: 0, totalOvertimeMinutes: 0 };
  const m = await getCompanyForStaff(staffAccountId); if (!m) return { employees: [], totalWorkMinutes: 0, totalOvertimeMinutes: 0 };

  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId, m.companyId));
  const ids = new Set(members.map(x => x.staffAccountId));
  const staff = (await db.select().from(staffAccounts).where(eq(staffAccounts.active, true))).filter(x => ids.has(x.id));
  const attendance = (await db.select().from(attendanceRecords)).filter(x => x.date.startsWith(month) && ids.has(x.staffAccountId));
  const schedules = await db.select().from(weeklySchedules);
  const shifts = await db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
  const approvedOvertime = await db.select().from(staffRequests).where(and(
    eq(staffRequests.type, "أوفر تايم"),
    eq(staffRequests.status, "مقبول")
  ));

  const employees = staff.map(employee => {
    const rows = attendance.filter(x => x.staffAccountId === employee.id && x.checkIn && x.checkOut);
    let workMinutes = 0;
    let approvedOvertimeMinutes = 0;

    for (const row of rows) {
      const schedule = schedules.find(x => x.staffAccountId === employee.id && x.scheduleDate === row.date);
      const shift = schedule ? shifts.find(x => x.id === schedule.shiftTemplateId) : undefined;
      const actual = shiftMinutes(row.checkIn!, row.checkOut!, shift?.crossesMidnight ?? false);
      workMinutes += actual;
    }

    for (const request of approvedOvertime) {
      if (request.staffAccountId !== employee.id || !request.fromDate.startsWith(month)) continue;
      approvedOvertimeMinutes += Math.round(Number(request.hours ?? 0) * 60);
    }

    return {
      staffAccountId: employee.id,
      name: employee.name,
      workMinutes,
      workHours: Number((workMinutes / 60).toFixed(2)),
      overtimeMinutes: approvedOvertimeMinutes,
      overtimeHours: Number((approvedOvertimeMinutes / 60).toFixed(2)),
    };
  });

  return {
    employees,
    totalWorkMinutes: employees.reduce((sum, x) => sum + x.workMinutes, 0),
    totalOvertimeMinutes: employees.reduce((sum, x) => sum + x.overtimeMinutes, 0),
  };
}

export async function generatePayroll(staffAccountId: number, month: string) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("صيغة الشهر غير صحيحة. استخدم YYYY-MM.");
  const m = await getCompanyForStaff(staffAccountId);
  // Keep the service-layer payroll permission aligned with the router.
  // Supervisors must never gain payroll generation access through an internal call path.
  if (!m || !["owner","hr","accountant","manager"].includes(m.role)) throw new Error("غير مصرح");
  await syncMonthlyAttendance(staffAccountId, month);
  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId,m.companyId));
  const ids = new Set(members.map(x=>x.staffAccountId));
  const staff = await db.select().from(staffAccounts).where(eq(staffAccounts.active,true));
  const attendance = await db.select().from(attendanceRecords);
  const schedules = await db.select().from(weeklySchedules);
  const shifts = await db.select().from(shiftTemplates).where(eq(shiftTemplates.active, true));
  const approvedOvertime = await db.select().from(staffRequests).where(and(eq(staffRequests.type,"أوفر تايم"),eq(staffRequests.status,"مقبول")));
  const result=[];
  let skippedApproved=0;
  for(const s of staff.filter(x=>ids.has(x.id))) {
    const existing=(await db.select().from(payrollRecords).where(and(
      eq(payrollRecords.companyId,m.companyId),
      eq(payrollRecords.staffAccountId,s.id),
      eq(payrollRecords.month,month)
    )).limit(1))[0];
    if(existing && existing.status==="approved") { result.push(existing); skippedApproved++; continue; }
    const records=attendance.filter(x=>x.staffAccountId===s.id && x.date.startsWith(month));
    // Auto-detected absences are not deducted until explicitly approved.
    const absences=records.filter(x=>x.status==="غياب" && (x.note || "").includes("تم اعتماد الغياب")).length;
    // Late deductions are only chargeable after explicit manager approval.
    const lateMinutes=records.reduce((total, record) => {
      if (!(record.note || "").includes("تم اعتماد التأخير")) return total;
      return total + Math.max(0, Number(record.lateMinutes || 0));
    }, 0);
    const lateDeduction=Math.round((s.baseSalary/PAYROLL_RULES.calendarDays/PAYROLL_RULES.dailyHours/60)*lateMinutes);
    const earlyMinutes=records.reduce((total, record) => {
      // Early departure is a payroll deduction only after the manager explicitly approves it.
      if (!record.checkOut || !(record.note || "").includes("تم اعتماد الانصراف المبكر")) return total;
      const schedule = schedules.find(item => item.staffAccountId === s.id && item.scheduleDate === record.date);
      const shift = schedule ? shifts.find(item => item.id === schedule.shiftTemplateId) : undefined;
      const shiftStart = shift?.startTime ?? s.shiftStart;
      const shiftEnd = shift?.endTime ?? s.shiftEnd;
      // Support legacy shifts whose overnight flag was not persisted.
      const crossesMidnight = (shift?.crossesMidnight ?? false) || minutesOf(shiftEnd) < minutesOf(shiftStart);
      const scheduledEnd = minutesOf(shiftEnd) + (crossesMidnight ? 24 * 60 : 0);
      let actualCheckout = minutesOf(record.checkOut);
      if (crossesMidnight && actualCheckout < minutesOf(shiftStart)) actualCheckout += 24 * 60;
      return total + Math.max(0, scheduledEnd - actualCheckout);
    }, 0);
    const earlyDeduction=Math.round((s.baseSalary/PAYROLL_RULES.calendarDays/PAYROLL_RULES.dailyHours/60)*earlyMinutes);
    const absenceDeduction=Math.round((s.baseSalary/PAYROLL_RULES.calendarDays)*PAYROLL_RULES.absencePenaltyDays*absences);
    const approvedOvertimeHours=approvedOvertime
      .filter(r=>r.staffAccountId===s.id && r.fromDate.startsWith(month))
      .reduce((sum,r)=>sum+Math.max(0, Number(r.hours ?? 0)),0);
    // Overtime is payable only through an approved overtime request.
    // Staying longer on site is not automatically treated as payable overtime.
    const overtimeHours=approvedOvertimeHours;
    const overtimeRate=s.baseSalary/PAYROLL_RULES.calendarDays/PAYROLL_RULES.dailyHours;
    const overtimeValue=Math.round(overtimeHours*overtimeRate);
    const adjustments=await db.select().from(salaryAdjustments).where(and(
      eq(salaryAdjustments.companyId,m.companyId),
      eq(salaryAdjustments.staffAccountId,s.id),
      eq(salaryAdjustments.month,month)
    ));
    const allowances=adjustments.filter(a=>a.type==="allowance").reduce((sum,a)=>sum+a.amount,0);
    const bonuses=adjustments.filter(a=>a.type==="bonus"||a.type==="incentive").reduce((sum,a)=>sum+a.amount,0);
    const extraDeductions=adjustments.filter(a=>a.type==="penalty"||a.type==="deduction").reduce((sum,a)=>sum+a.amount,0);
    const activeAdvances=await db.select().from(salaryAdvances).where(and(
      eq(salaryAdvances.companyId,m.companyId),
      eq(salaryAdvances.staffAccountId,s.id),
      eq(salaryAdvances.status,"active")
    ));
    const advanceInstallment=activeAdvances.filter(a=>a.startMonth<=month && a.remainingAmount>0).reduce((sum,a)=>sum+Math.min(a.installmentAmount,a.remainingAmount),0);
    const gross=s.baseSalary+allowances+overtimeValue+bonuses;
    const egypt = calculateEgyptPayroll({
      monthlyGross: gross,
      insuranceWage: s.baseSalary,
      monthlyOtherDeductions: 0,
    });
    const net=Math.max(0, egypt.net-absenceDeduction-lateDeduction-earlyDeduction-extraDeductions-advanceInstallment);
    const values={companyId:m.companyId,staffAccountId:s.id,month,baseSalary:s.baseSalary,allowances,bonuses,overtime:overtimeValue,absenceDeduction,lateDeduction,earlyDeduction,otherDeductions:extraDeductions,advances:advanceInstallment,employeeSocialInsurance:egypt.employeeSocialInsurance,employeeIncomeTax:egypt.employeeIncomeTax,grossSalary:gross,netSalary:net,status:"draft"};
    if(existing) await db.update(payrollRecords).set({...values,updatedAt:new Date()}).where(eq(payrollRecords.id,existing.id));
    else await db.insert(payrollRecords).values(values);
    result.push(values);
  }
  await writeAudit(staffAccountId,m.companyId,"payroll.generated","payroll",month,{count:result.length,skippedApproved});
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function approvePayroll(staffAccountId:number, id:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  // Payroll approval is a payroll-admin action. Final unapproval remains
  // restricted to owner/manager so reopening a closed payroll is more sensitive.
  const m=await getCompanyForStaff(staffAccountId); if(!m || !["owner","manager","hr","accountant"].includes(m.role)) throw new Error("غير مصرح");
  const current=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId))).limit(1))[0];
  if(!current) throw new Error("مسير الرواتب غير موجود.");
  if(current.status==="approved") return current;

  // Always regenerate the draft before approval so the final payroll reflects
  // the latest reviewed attendance, approved adjustments, and active advances.
  await generatePayroll(staffAccountId, current.month);
  const refreshed=(await db.select().from(payrollRecords).where(and(
    eq(payrollRecords.id,id),
    eq(payrollRecords.companyId,m.companyId)
  )).limit(1))[0];
  if(!refreshed) throw new Error("تعذر تحديث مسير الرواتب.");

  // A payroll cannot be closed while any attendance exception for the month
  // is still waiting for a manager decision.
  const members=await db.select({staffAccountId:companyMembers.staffAccountId})
    .from(companyMembers).where(eq(companyMembers.companyId,m.companyId));
  const monthAttendance=await db.select().from(attendanceRecords);
  const pending=monthAttendance.filter(r=>{
    if(r.staffAccountId !== current.staffAccountId || !r.date.startsWith(current.month)) return false;
    const note=r.note||"";
    const latePending=Number(r.lateMinutes||0)>0 && !note.includes("تم اعتماد التأخير") && !note.includes("تم إلغاء التأخير");
    const earlyPending=note.includes("انصراف مبكر:") && !note.includes("تم اعتماد الانصراف المبكر") && !note.includes("تم إلغاء الانصراف المبكر");
    const absencePending=r.status==="غياب" && !note.includes("تم اعتماد الغياب") && !note.includes("تم إلغاء الغياب");
    return latePending || earlyPending || absencePending;
  });
  if(pending.length){
    throw new Error("لا يمكن اعتماد مسير الشهر قبل مراجعة كل مخالفات الحضور المعلقة.");
  }

  await db.update(payrollRecords).set({status:"approved",approvedAt:new Date(),updatedAt:new Date()}).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId)));
  const advances=await db.select().from(salaryAdvances)
    .where(and(eq(salaryAdvances.staffAccountId,current.staffAccountId),eq(salaryAdvances.companyId,m.companyId),eq(salaryAdvances.status,"active")))
    .orderBy(salaryAdvances.id);
  const paidAdvanceAllocations:{id:number;amount:number}[]=[];
  for(const advance of advances){
    if(advance.startMonth<=current.month && advance.remainingAmount>0){
      const paid=Math.min(advance.installmentAmount,advance.remainingAmount);
      const remaining=advance.remainingAmount-paid;
      paidAdvanceAllocations.push({id:advance.id,amount:paid});
      await db.update(salaryAdvances).set({remainingAmount:remaining,status:remaining===0?"completed":"active",updatedAt:new Date()}).where(eq(salaryAdvances.id,advance.id));
    }
  }
  const row=(await db.select().from(payrollRecords).where(eq(payrollRecords.id,id)).limit(1))[0];
  if(row){
    await createNotification(row.staffAccountId,"payroll","تم اعتماد راتبك",`تم اعتماد راتب شهر ${row.month} بقيمة ${row.netSalary.toLocaleString()} جنيه.`);
    await writeAudit(staffAccountId,m.companyId,"payroll.approved","payroll",String(id),{month:row.month,netSalary:row.netSalary,advanceAllocations:paidAdvanceAllocations});
  }
  return row;
}

export async function getPayrollPayslip(staffAccountId:number, payrollId:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m) throw new Error("Company not found");
  const payroll=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.id,payrollId),eq(payrollRecords.companyId,m.companyId))).limit(1))[0];
  if(!payroll) throw new Error("قسيمة الراتب غير موجودة");
  if(m.role==="employee" && payroll.staffAccountId!==staffAccountId) throw new Error("غير مصرح بالوصول إلى قسيمة موظف آخر");
  const staff=(await db.select().from(staffAccounts).where(eq(staffAccounts.id,payroll.staffAccountId)).limit(1))[0];
  if(!staff) throw new Error("الموظف غير موجود");
  const company=(await db.select().from(companies).where(eq(companies.id,m.companyId)).limit(1))[0];
  const branch=m.branchId ? (await db.select().from(branches).where(eq(branches.id,m.branchId)).limit(1))[0] : undefined;
  return { payroll, staff, company, branch, employeeId: staff.id, issuedAt: payroll.approvedAt ?? payroll.updatedAt ?? payroll.createdAt };
}


export async function unapprovePayroll(staffAccountId:number, id:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId);
  if(!m || !["owner","manager","hr","accountant"].includes(m.role)) throw new Error("غير مصرح");
  const current=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId))).limit(1))[0];
  if(!current) throw new Error("مسير الرواتب غير موجود.");
  if(current.status!=="approved") return current;
  if(Number(current.advances||0)>0){
    const approvalAudit=(await db.select({metadata:auditLogs.metadata})
      .from(auditLogs)
      .where(and(
        eq(auditLogs.companyId,m.companyId),
        eq(auditLogs.action,"payroll.approved"),
        eq(auditLogs.entity,"payroll"),
        eq(auditLogs.entityId,String(id))
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1))[0];
    let allocations:{id:number;amount:number}[]=[];
    try {
      const parsed=approvalAudit?.metadata ? JSON.parse(approvalAudit.metadata) : null;
      allocations=Array.isArray(parsed?.advanceAllocations) ? parsed.advanceAllocations.filter((x:any)=>Number.isInteger(x?.id)&&Number(x?.amount)>0).map((x:any)=>({id:Number(x.id),amount:Number(x.amount)})) : [];
    } catch {}
    if(allocations.length){
      for(const allocation of allocations){
        const advance=(await db.select().from(salaryAdvances).where(and(
          eq(salaryAdvances.id,allocation.id),
          eq(salaryAdvances.staffAccountId,current.staffAccountId),
          eq(salaryAdvances.companyId,m.companyId)
        )).limit(1))[0];
        if(!advance) continue;
        const remaining=Number(advance.remainingAmount)+allocation.amount;
        await db.update(salaryAdvances).set({remainingAmount:remaining,status:"active",updatedAt:new Date()}).where(eq(salaryAdvances.id,advance.id));
      }
    } else {
      // Legacy approvals created before allocation tracking: keep the old
      // aggregate fallback so unapprove remains backward compatible.
      const advances=await db.select().from(salaryAdvances).where(and(
        eq(salaryAdvances.staffAccountId,current.staffAccountId),
        eq(salaryAdvances.companyId,m.companyId)
      )).orderBy(salaryAdvances.id);
      let restore=Number(current.advances||0);
      for(const advance of advances){
        if(restore<=0) break;
        const amount=Math.min(Number(advance.installmentAmount),restore);
        await db.update(salaryAdvances).set({
          remainingAmount:Number(advance.remainingAmount)+amount,
          status:"active",
          updatedAt:new Date()
        }).where(eq(salaryAdvances.id,advance.id));
        restore-=amount;
      }
    }
  }
  await db.update(payrollRecords).set({status:"draft",approvedAt:null,updatedAt:new Date()}).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId)));
  await writeAudit(staffAccountId,m.companyId,"payroll.unapproved","payroll",String(id),{month:current.month});
  await createNotification(current.staffAccountId,"payroll","تم إلغاء اعتماد راتبك","تم فتح مسير راتب شهر "+current.month+" للمراجعة والتعديل.");
  return (await db.select().from(payrollRecords).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId))).limit(1))[0];
}

export async function waiveAttendanceException(actorId:number,input:{staffAccountId:number;date:string;kind:"late"|"early"}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId);
  if(!m || !["owner","manager","hr","supervisor"].includes(m.role)) throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  await assertPayrollEditable(actorId,input.date.slice(0,7),input.staffAccountId);
  const row=(await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.staffAccountId,input.staffAccountId),eq(attendanceRecords.date,input.date))).limit(1))[0];
  if(!row) throw new Error("سجل الحضور غير موجود.");
  if(input.kind==="late" && Number(row.lateMinutes||0)<=0) throw new Error("لا يوجد تأخير على هذا اليوم.");
  if(input.kind==="early" && !(row.note||"").includes("انصراف مبكر")) throw new Error("لا يوجد انصراف مبكر مسجل على هذا اليوم.");
  const cleanedNote=(row.note||"").replace(/\\s*·\\s*انصراف مبكر:\\s*\\d+\\s*دقيقة/g,"").replace(/\\s*انصراف مبكر:\\s*\\d+\\s*دقيقة/g,"").trim();
  await db.update(attendanceRecords).set({
    lateMinutes: input.kind==="late" ? 0 : row.lateMinutes,
    note: cleanedNote ? cleanedNote+" · تم إلغاء "+(input.kind==="late"?"التأخير":"الانصراف المبكر") : "تم إلغاء "+(input.kind==="late"?"التأخير":"الانصراف المبكر"),
    updatedAt:new Date()
  }).where(eq(attendanceRecords.id,row.id));
  await writeAudit(actorId,m.companyId,"attendance.exception.waived","attendance",String(row.id),input);
  await createNotification(input.staffAccountId,"attendance","تم إلغاء الخصم","تم إلغاء احتساب "+(input.kind==="late"?"التأخير":"الانصراف المبكر")+" ليوم "+input.date+".");
  return (await db.select().from(attendanceRecords).where(eq(attendanceRecords.id,row.id)).limit(1))[0];
}

export async function cancelSalaryAdjustment(actorId:number,id:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId);
  if(!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  const row=(await db.select().from(salaryAdjustments).where(and(eq(salaryAdjustments.id,id),eq(salaryAdjustments.companyId,m.companyId))).limit(1))[0];
  if(!row) throw new Error("الجزاء غير موجود.");
  await assertPayrollEditable(actorId,row.month,row.staffAccountId);
  await db.delete(salaryAdjustments).where(and(eq(salaryAdjustments.id,id),eq(salaryAdjustments.companyId,m.companyId)));
  await writeAudit(actorId,m.companyId,"salary_adjustment.cancelled","salary_adjustment",String(id),{staffAccountId:row.staffAccountId,month:row.month,title:row.title,amount:row.amount});
  await createNotification(row.staffAccountId,"payroll","تم إلغاء الجزاء","تم إلغاء الجزاء \""+row.title+"\" بقيمة "+row.amount.toLocaleString()+" جنيه.");
  return {success:true};
}

export async function getPayroll(staffAccountId:number, month:string) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function assertPayrollEditable(staffAccountId:number, month:string, targetStaffAccountId?:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m) throw new Error("Company not found");
  const approved=(await db.select({id:payrollRecords.id}).from(payrollRecords).where(and(
    eq(payrollRecords.companyId,m.companyId),
    eq(payrollRecords.month,month),
    eq(payrollRecords.status,"approved"),
    ...(targetStaffAccountId ? [eq(payrollRecords.staffAccountId,targetStaffAccountId)] : [])
  )).limit(1))[0];
  if(approved) throw new Error("مسير هذا الشهر تم اعتماده ولا يمكن تعديل الحضور بعد الإغلاق.");
  return true;
}

export async function syncCompanyMemberRole(actorId:number,targetId:number,role:"manager"|"supervisor"|"employee") {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const access=await assertStaffInCompany(actorId,targetId);
  if(!["owner","manager"].includes(access.actor.role)) throw new Error("غير مصرح");
  if(access.target.role === "owner" && access.actor.role !== "owner") {
    throw new Error("لا يمكن لمدير الشركة تغيير صلاحيات المالك.");
  }

  // This helper is only for legacy staff-role changes. Keep both role sources
  // synchronized and never allow it to demote an owner.
  await db.update(companyMembers).set({role,updatedAt:new Date()}).where(and(
    eq(companyMembers.id,access.target.id),
    eq(companyMembers.companyId,access.actor.companyId)
  ));
  await db.update(staffAccounts).set({
    role,
    updatedAt:new Date(),
  }).where(eq(staffAccounts.id,targetId));

  return getMembership(targetId);
}

export async function writeAudit(staffAccountId:number, companyId:number, action:string, entity?:string, entityId?:string, metadata?:unknown) {
  const db=await getDb(); if(!db) return;
  await db.insert(auditLogs).values({staffAccountId,companyId,action,entity:entity??null,entityId:entityId??null,metadata:metadata?JSON.stringify(metadata):null});
}

export async function getMonthlyStaffReports(staffAccountId: number, month: string) {
  const m = await getCompanyForStaff(staffAccountId);
  if (!m) throw new Error("Company not found");
  return dbQueries.getMonthlyStaffReports(month, m.companyId);
}

export async function getSecuritySummary(staffAccountId:number) {
  const m=await getCompanyForStaff(staffAccountId); if(!m) return null;
  return { sessionPolicy:"30 days", passwordHash:"scrypt", tenantIsolation:"company membership", auditLog:true, roleBasedAccess:true };
}

function leaveDays(fromDate:string,toDate:string) {
  const from=new Date(fromDate+"T00:00:00");
  const to=new Date(toDate+"T00:00:00");
  return Math.floor((to.getTime()-from.getTime())/86400000)+1;
}

function leaveKind(type:"إجازة"|"إجازة مرضية"|"إجازة طارئة") {
  return type==="إجازة" ? "annual" : type==="إجازة مرضية" ? "sick" : "emergency";
}

export async function validateLeaveRequest(
  staffAccountId:number,
  fromDate:string,
  toDate:string,
  type:"إجازة"|"إجازة مرضية"|"إجازة طارئة"
) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(fromDate) || !/^\\d{4}-\\d{2}-\\d{2}$/.test(toDate)) throw new Error("صيغة تاريخ الإجازة غير صحيحة.");
  if(fromDate>toDate) throw new Error("تاريخ بداية الإجازة يجب أن يكون قبل أو مساويًا لتاريخ النهاية.");
  if(fromDate.slice(0,4)!==toDate.slice(0,4)) throw new Error("لا يمكن أن تمتد الإجازة بين سنتين. قدم طلبين منفصلين.");
  const days=leaveDays(fromDate,toDate);
  if(days<1 || days>366) throw new Error("مدة الإجازة غير صحيحة.");
  const actor=await getCompanyForStaff(staffAccountId); if(!actor) throw new Error("Company not found");
  await assertPayrollEditable(staffAccountId,fromDate.slice(0,7));
  if(toDate.slice(0,7)!==fromDate.slice(0,7)) await assertPayrollEditable(staffAccountId,toDate.slice(0,7));

  const existing=await db.select().from(staffRequests).where(eq(staffRequests.staffAccountId,staffAccountId));
  const overlap=existing.find(r =>
    ["إجازة","إجازة مرضية","إجازة طارئة"].includes(r.type) &&
    r.status!=="مرفوض" &&
    r.fromDate<=toDate &&
    r.toDate>=fromDate
  );
  if(overlap) throw new Error("يوجد طلب إجازة آخر متداخل مع هذه الفترة.");

  const balance=await ensureLeaveBalance(staffAccountId,Number(fromDate.slice(0,4)));
  if(!balance) throw new Error("تعذر قراءة رصيد الإجازات.");
  const kind=leaveKind(type);
  const available=kind==="annual" ? balance.annualDays-balance.annualUsed : kind==="sick" ? balance.sickDays-balance.sickUsed : balance.emergencyDays-balance.emergencyUsed;
  if(available<days) throw new Error("رصيد الإجازة غير كافٍ لهذه المدة.");
  return {days,available,kind};
}

export async function consumeLeaveBalance(staffAccountId:number, fromDate:string, toDate:string, kind:"annual"|"sick"|"emergency") {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const days=leaveDays(fromDate,toDate);
  if(days<1) throw new Error("مدة الإجازة غير صحيحة.");
  const year=Number(fromDate.slice(0,4));
  const balance=await ensureLeaveBalance(staffAccountId,year);
  if(!balance) throw new Error("تعذر قراءة رصيد الإجازات.");
  const now=new Date();
  if(kind==="annual"){
    if(balance.annualDays-balance.annualUsed<days) throw new Error("رصيد الإجازات السنوية غير كافٍ.");
    const changed=await db.update(leaveBalances).set({annualUsed:balance.annualUsed+days,updatedAt:now}).where(and(eq(leaveBalances.id,balance.id),eq(leaveBalances.annualUsed,balance.annualUsed)));
    if(!changed[0]?.affectedRows) throw new Error("تم تحديث رصيد الإجازات بالفعل. حاول مرة أخرى.");
  } else if(kind==="sick") {
    if(balance.sickDays-balance.sickUsed<days) throw new Error("رصيد الإجازات المرضية غير كافٍ.");
    const changed=await db.update(leaveBalances).set({sickUsed:balance.sickUsed+days,updatedAt:now}).where(and(eq(leaveBalances.id,balance.id),eq(leaveBalances.sickUsed,balance.sickUsed)));
    if(!changed[0]?.affectedRows) throw new Error("تم تحديث رصيد الإجازات بالفعل. حاول مرة أخرى.");
  } else {
    if(balance.emergencyDays-balance.emergencyUsed<days) throw new Error("رصيد الإجازات الطارئة غير كافٍ.");
    const changed=await db.update(leaveBalances).set({emergencyUsed:balance.emergencyUsed+days,updatedAt:now}).where(and(eq(leaveBalances.id,balance.id),eq(leaveBalances.emergencyUsed,balance.emergencyUsed)));
    if(!changed[0]?.affectedRows) throw new Error("تم تحديث رصيد الإجازات بالفعل. حاول مرة أخرى.");
  }
}

export async function reviewLeaveRequest(actorId:number,id:number,status:"مقبول"|"مرفوض") {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const requests=await listCompanyRequests(actorId);
  const existing=requests.find((r:any)=>r.id===id);
  if(!existing || existing.source!=="request") throw new Error("طلب الإجازة غير موجود.");
  if(existing.status!=="قيد المراجعة") throw new Error("هذا الطلب تمت معالجته بالفعل.");
  if(!["إجازة","إجازة مرضية","إجازة طارئة"].includes(existing.type)) throw new Error("نوع الطلب ليس إجازة.");
  await assertStaffInCompany(actorId,existing.staffAccountId);
  await assertPayrollEditable(actorId,existing.fromDate.slice(0,7),existing.staffAccountId);
  if(existing.toDate.slice(0,7)!==existing.fromDate.slice(0,7)) await assertPayrollEditable(actorId,existing.toDate.slice(0,7),existing.staffAccountId);

  const kind=leaveKind(existing.type as "إجازة"|"إجازة مرضية"|"إجازة طارئة");
  let consumed=false;
  if(status==="مقبول"){
    await validateLeaveRequest(existing.staffAccountId,existing.fromDate,existing.toDate,existing.type as "إجازة"|"إجازة مرضية"|"إجازة طارئة");
    await consumeLeaveBalance(existing.staffAccountId,existing.fromDate,existing.toDate,kind);
    consumed=true;
  }
  try {
    const row=await db.approveRequest(id,actorId,status);
    if(!row) throw new Error("تعذر تحديث طلب الإجازة.");
    if(status==="مقبول") {
      await syncMonthlyAttendance(actorId,existing.fromDate.slice(0,7));
      if(existing.toDate.slice(0,7)!==existing.fromDate.slice(0,7)) await syncMonthlyAttendance(actorId,existing.toDate.slice(0,7));
    }
    const m=await getCompanyForStaff(actorId);
    if(m) await writeAudit(actorId,m.companyId,"leave.request."+status,"request",String(id),{staffAccountId:existing.staffAccountId,type:existing.type,fromDate:existing.fromDate,toDate:existing.toDate,days:leaveDays(existing.fromDate,existing.toDate)});
    await createNotification(existing.staffAccountId,"request","تم تحديث طلب الإجازة","حالة طلب الإجازة أصبحت: "+status);
    return row;
  } catch(error) {
    if(consumed) {
      const balance=await ensureLeaveBalance(existing.staffAccountId,Number(existing.fromDate.slice(0,4)));
      if(kind==="annual") await db.update(leaveBalances).set({annualUsed:Math.max(0,balance.annualUsed-leaveDays(existing.fromDate,existing.toDate)),updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
      if(kind==="sick") await db.update(leaveBalances).set({sickUsed:Math.max(0,balance.sickUsed-leaveDays(existing.fromDate,existing.toDate)),updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
      if(kind==="emergency") await db.update(leaveBalances).set({emergencyUsed:Math.max(0,balance.emergencyUsed-leaveDays(existing.fromDate,existing.toDate)),updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
    }
    throw error;
  }
}

export async function consumeAnnualLeave(staffAccountId:number, fromDate:string, toDate:string) {
  return consumeLeaveBalance(staffAccountId, fromDate, toDate, "annual");
}

export async function updateBranchForStaff(staffAccountId:number,input:{name:string;address:string;latitude:string;longitude:string;radiusMeters:number}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m || !["owner","hr","manager","supervisor"].includes(m.role)) throw new Error("غير مصرح");
  if(!m.branchId) throw new Error("الفرع غير مرتبط بالحساب");
  await db.update(branches).set({...input,updatedAt:new Date()}).where(and(eq(branches.id,m.branchId),eq(branches.companyId,m.companyId)));
  return getBranchForStaff(staffAccountId);
}

export async function listCompanyRequests(staffAccountId:number) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  const members=await db.select({staffAccountId:companyMembers.staffAccountId}).from(companyMembers).where(eq(companyMembers.companyId,m.companyId));
  const ids=members.map(x=>x.staffAccountId);
  if(!ids.length) return [];
  const staff=await db.select({id:staffAccounts.id,name:staffAccounts.name}).from(staffAccounts);
  const rows=await db.select().from(staffRequests).orderBy(desc(staffRequests.createdAt));
  const penalties=await db.select().from(salaryAdjustments).where(and(eq(salaryAdjustments.companyId,m.companyId),eq(salaryAdjustments.type,"penalty"))).orderBy(desc(salaryAdjustments.createdAt));
  const attendance=await db.select().from(attendanceRecords).orderBy(desc(attendanceRecords.date));
  const regular=rows.filter(r=>ids.includes(r.staffAccountId)).map(r=>({...r,source:"request",staffName:staff.find(s=>s.id===r.staffAccountId)?.name ?? "موظف",actionable:r.status==="قيد المراجعة"}));
  const exceptions:any[]=[];
  for(const r of attendance.filter(a=>ids.includes(a.staffAccountId))){
    const name=staff.find(s=>s.id===r.staffAccountId)?.name ?? "موظف";
    if(Number(r.lateMinutes||0)>0 || (r.note||"").includes("تم إلغاء التأخير")) {
      const status = (r.note||"").includes("تم اعتماد التأخير") ? "مقبول" : (r.note||"").includes("تم إلغاء التأخير") ? "مرفوض" : "قيد المراجعة";
      exceptions.push({id:-1000000-r.id,source:"attendance",exceptionKind:"late",staffAccountId:r.staffAccountId,staffName:name,type:"تأخير",fromDate:r.date,toDate:r.date,reason:"تأخير "+r.lateMinutes+" دقيقة",status,createdAt:r.createdAt,attendanceId:r.id,actionable:status==="قيد المراجعة"});
    }
    if((r.note||"").includes("انصراف مبكر:") || (r.note||"").includes("تم إلغاء الانصراف المبكر")) {
      const status = (r.note||"").includes("تم اعتماد الانصراف المبكر") ? "مقبول" : (r.note||"").includes("تم إلغاء الانصراف المبكر") ? "مرفوض" : "قيد المراجعة";
      exceptions.push({id:-2000000-r.id,source:"attendance",exceptionKind:"early",staffAccountId:r.staffAccountId,staffName:name,type:"انصراف مبكر",fromDate:r.date,toDate:r.date,reason:((r.note||"").match(/انصراف مبكر:\s*[^·]+/)||[])[0] ?? "انصراف مبكر",status,createdAt:r.createdAt,attendanceId:r.id,actionable:status==="قيد المراجعة"});
    }
    if(r.status==="غياب" || (r.note||"").includes("تم إلغاء الغياب") || (r.note||"").includes("تم اعتماد الغياب")) {
      const status = (r.note||"").includes("تم اعتماد الغياب") ? "مقبول" : (r.note||"").includes("تم إلغاء الغياب") ? "مرفوض" : "قيد المراجعة";
      exceptions.push({id:-4000000-r.id,source:"attendance",exceptionKind:"absence",staffAccountId:r.staffAccountId,staffName:name,type:"غياب",fromDate:r.date,toDate:r.date,reason:"غياب — لا يوجد تسجيل حضور",status,createdAt:r.createdAt,attendanceId:r.id,actionable:status==="قيد المراجعة"});
    }
  }
  const penaltyRows=penalties.filter(p=>ids.includes(p.staffAccountId)).map(p=>({...p,id:-3000000-p.id,source:"penalty",adjustmentId:p.id,staffName:staff.find(s=>s.id===p.staffAccountId)?.name ?? "موظف",fromDate:p.month+"-01",toDate:p.month+"-01",type:"جزاء",reason:p.title+(p.note?" · "+p.note:"")+" · "+p.amount.toLocaleString()+" جنيه",status:"مخصوم",actionable:true}));
  return [...regular,...exceptions,...penaltyRows].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
}

export async function reviewAttendanceException(actorId:number,input:{staffAccountId:number;date:string;kind:"late"|"early"|"absence";action:"approve"|"cancel"}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId);
  if(!m || !["owner","manager","hr","supervisor"].includes(m.role)) throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  await assertPayrollEditable(actorId,input.date.slice(0,7),input.staffAccountId);
  const row=(await db.select().from(attendanceRecords).where(and(eq(attendanceRecords.staffAccountId,input.staffAccountId),eq(attendanceRecords.date,input.date))).limit(1))[0];
  if(!row) throw new Error("سجل الحضور غير موجود.");
  if(input.kind==="late" && Number(row.lateMinutes||0)<=0) throw new Error("لا يوجد تأخير على هذا اليوم.");
  if(input.kind==="early" && !(row.note||"").includes("انصراف مبكر:")) throw new Error("لا يوجد انصراف مبكر مسجل على هذا اليوم.");
  if(input.kind==="absence" && row.status!=="غياب") throw new Error("لا يوجد غياب على هذا اليوم.");
  const approvedMarker = "تم اعتماد "+(input.kind==="late"?"التأخير":input.kind==="early"?"الانصراف المبكر":"الغياب");
  const cancelledMarker = "تم إلغاء "+(input.kind==="late"?"التأخير":input.kind==="early"?"الانصراف المبكر":"الغياب");
  const noteText = row.note || "";
  if(input.action==="approve" && noteText.includes(approvedMarker)) throw new Error("تم اعتماد هذه المخالفة بالفعل.");
  if(input.action==="cancel" && noteText.includes(cancelledMarker)) throw new Error("تم إلغاء هذه المخالفة بالفعل.");
  if(input.action==="approve" && noteText.includes(cancelledMarker)) throw new Error("تم إلغاء هذه المخالفة بالفعل ولا يمكن اعتمادها مرة أخرى.");
  if(input.action==="cancel" && noteText.includes(approvedMarker)) throw new Error("تم اعتماد هذه المخالفة بالفعل ولا يمكن إلغاء الخصم بعد الاعتماد.");
  let nextNote=noteText.replace(/\s*·\s*(?:تم اعتماد|تم إلغاء )?(?:التأخير|الانصراف المبكر|الغياب)/g,"").trim();
  if(input.action==="cancel"){
    if(input.kind==="late") row.lateMinutes=0;
    if(input.kind==="absence") row.status="مستثنى";
    if(input.kind==="early") nextNote=nextNote.replace(/انصراف مبكر:\s*\d+\s*دقيقة/g,"").trim();
    nextNote=(nextNote?nextNote+" · ":"")+"تم إلغاء "+(input.kind==="late"?"التأخير":input.kind==="early"?"الانصراف المبكر":"الغياب");
  }
  if(input.action==="approve"){
    nextNote=(nextNote?nextNote+" · ":"")+"تم اعتماد "+(input.kind==="late"?"التأخير":input.kind==="early"?"الانصراف المبكر":"الغياب");
  }
  await db.update(attendanceRecords).set({lateMinutes:row.lateMinutes,status:row.status,note:nextNote,updatedAt:new Date()}).where(eq(attendanceRecords.id,row.id));
  await writeAudit(actorId,m.companyId,"attendance.exception."+input.action,"attendance",String(row.id),input);
  await createNotification(input.staffAccountId,"attendance",input.action==="approve"?"تم اعتماد مخالفة الحضور":"تم إلغاء مخالفة الحضور","تم "+(input.action==="approve"?"اعتماد":"إلغاء")+" "+(input.kind==="late"?"التأخير":input.kind==="early"?"الانصراف المبكر":"الغياب")+" ليوم "+input.date+".");
  return (await db.select().from(attendanceRecords).where(eq(attendanceRecords.id,row.id)).limit(1))[0];
}

export async function listAuditLogs(staffAccountId:number, limit=100) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  // Return the actor name with each event so the audit center is useful to
  // managers without exposing unrelated company records.
  return db.select({
    id: auditLogs.id,
    companyId: auditLogs.companyId,
    staffAccountId: auditLogs.staffAccountId,
    staffName: staffAccounts.name,
    action: auditLogs.action,
    entity: auditLogs.entity,
    entityId: auditLogs.entityId,
    metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt,
  })
    .from(auditLogs)
    .leftJoin(staffAccounts, eq(auditLogs.staffAccountId, staffAccounts.id))
    .where(eq(auditLogs.companyId,m.companyId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(Math.max(limit,1),250));
}

export async function getEmployeeSelfService(staffAccountId:number, month:string) {
  const db=await getDb(); if(!db) return null;
  const m=await getCompanyForStaff(staffAccountId); if(!m) return null;
  const membership=await getMembership(staffAccountId); if(!membership || membership.companyId!==m.companyId || !membership.active) return null;
  const staff=(await db.select().from(staffAccounts).where(eq(staffAccounts.id,staffAccountId)).limit(1))[0];
  if(!staff) return null;
  const attendance=await db.select().from(attendanceRecords).where(eq(attendanceRecords.staffAccountId,staffAccountId)).orderBy(desc(attendanceRecords.date));
  const requests=await db.select().from(staffRequests).where(eq(staffRequests.staffAccountId,staffAccountId)).orderBy(desc(staffRequests.createdAt)).limit(50);
  const payroll=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.staffAccountId,staffAccountId),eq(payrollRecords.month,month))).limit(1))[0] ?? null;
  const balance=await ensureLeaveBalance(staffAccountId,Number(month.slice(0,4)));
  return { staff, attendance: attendance.slice(0,90), requests, payroll, leaveBalance: balance };
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if(!rows.length) return "";
  const headers=Object.keys(rows[0]);
  const escape=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
  return [headers.map(escape).join(","),...rows.map(row=>headers.map(h=>escape(row[h])).join("\n"))].join("\n");
}

export async function listCompanySalaryAdjustments(staffAccountId:number, month?:string) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  return month ? db.select().from(salaryAdjustments).where(and(eq(salaryAdjustments.companyId,m.companyId),eq(salaryAdjustments.month,month))).orderBy(desc(salaryAdjustments.createdAt))
    : db.select().from(salaryAdjustments).where(eq(salaryAdjustments.companyId,m.companyId)).orderBy(desc(salaryAdjustments.createdAt));
}
export async function createSalaryAdjustment(actorId:number,input:{staffAccountId:number;month:string;type:"allowance"|"bonus"|"incentive"|"penalty"|"deduction";title:string;amount:number;note?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error("صيغة الشهر غير صحيحة. استخدم YYYY-MM.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("قيمة الإضافة أو الخصم يجب أن تكون أكبر من صفر.");
  await assertStaffInCompany(actorId,input.staffAccountId);
  await assertPayrollEditable(actorId,input.month,input.staffAccountId);
  const result=await db.insert(salaryAdjustments).values({...input,companyId:m.companyId,createdBy:actorId});
  await writeAudit(actorId,m.companyId,"salary_adjustment.created","salary_adjustment",String(result[0].insertId),input);
  await createNotification(input.staffAccountId,"payroll","إضافة جديدة على راتبك",input.title+": "+input.amount.toLocaleString()+" جنيه.");
  return (await db.select().from(salaryAdjustments).where(eq(salaryAdjustments.id,Number(result[0].insertId))).limit(1))[0];
}
export async function createSalaryAdvance(actorId:number,input:{staffAccountId:number;amount:number;installmentAmount:number;startMonth:string;note?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || !["owner","manager"].includes(m.role)) throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  if(!/^\d{4}-\d{2}$/.test(input.startMonth)) throw new Error("صيغة شهر بدء السلفة غير صحيحة. استخدم YYYY-MM.");
  await assertPayrollEditable(actorId,input.startMonth,input.staffAccountId);
  if(input.amount<=0 || input.installmentAmount<=0) throw new Error("قيمة السلفة والقسط يجب أن تكون أكبر من صفر.");
  if(input.installmentAmount>input.amount) throw new Error("قيمة القسط لا يمكن أن تتجاوز قيمة السلفة.");
  const result=await db.insert(salaryAdvances).values({...input,remainingAmount:input.amount,companyId:m.companyId,createdBy:actorId});
  await writeAudit(actorId,m.companyId,"salary_advance.created","salary_advance",String(result[0].insertId),input);
  await createNotification(input.staffAccountId,"payroll","تم تسجيل سلفة جديدة","قيمة السلفة "+input.amount.toLocaleString()+" جنيه.");
  return (await db.select().from(salaryAdvances).where(eq(salaryAdvances.id,Number(result[0].insertId))).limit(1))[0];
}
export async function listCompanyAdvances(actorId:number) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(actorId); if(!m) return [];
  return db.select().from(salaryAdvances).where(eq(salaryAdvances.companyId,m.companyId)).orderBy(desc(salaryAdvances.createdAt));
}
export async function listEmployeeDocuments(actorId:number,targetId:number) {
  await assertStaffInCompany(actorId,targetId);
  const db=await getDb(); if(!db) throw new Error("Database not available");
  return db.select().from(employeeDocuments).where(eq(employeeDocuments.staffAccountId,targetId)).orderBy(desc(employeeDocuments.createdAt));
}

export async function createEmployeeDocument(actorId:number,input:{staffAccountId:number;type:string;title:string;documentNumber?:string;expiryDate?:string;note?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId);
  if(!m || !["owner","manager","hr"].includes(m.role)) throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  const result=await db.insert(employeeDocuments).values({...input,companyId:m.companyId,createdBy:actorId,status:"active"});
  await writeAudit(actorId,m.companyId,"employee_document.created","employee_document",String(result[0].insertId),input);
  return (await db.select().from(employeeDocuments).where(eq(employeeDocuments.id,Number(result[0].insertId))).limit(1))[0];
}

export async function deleteEmployeeDocument(actorId:number,documentId:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || !["owner","manager","hr"].includes(m.role)) throw new Error("غير مصرح");
  const row=(await db.select().from(employeeDocuments).where(eq(employeeDocuments.id,documentId)).limit(1))[0];
  if(!row || row.companyId!==m.companyId) throw new Error("المستند غير موجود.");
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id,documentId));
  await writeAudit(actorId,m.companyId,"employee_document.deleted","employee_document",String(documentId),{staffAccountId:row.staffAccountId,title:row.title});
  return {success:true};
}

export async function listEmployee360(actorId:number,targetId:number) {
  await assertStaffInCompany(actorId,targetId);
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const staff=await getStaffAccountById(targetId);
  if(!staff) throw new Error("الموظف غير موجود");

  const safe = async <T>(query: Promise<T>, fallback: T): Promise<T> => {
    try { return await query; } catch { return fallback; }
  };

  const attendance = await safe(
    db.select().from(attendanceRecords).where(eq(attendanceRecords.staffAccountId,targetId)).orderBy(desc(attendanceRecords.date)),
    []
  );
  const requests = await safe(
    db.select().from(staffRequests).where(eq(staffRequests.staffAccountId,targetId)).orderBy(desc(staffRequests.createdAt)),
    []
  );
  const adjustments = await safe(
    db.select().from(salaryAdjustments).where(eq(salaryAdjustments.staffAccountId,targetId)).orderBy(desc(salaryAdjustments.createdAt)),
    []
  );
  const advances = await safe(
    db.select().from(salaryAdvances).where(eq(salaryAdvances.staffAccountId,targetId)).orderBy(desc(salaryAdvances.createdAt)),
    []
  );
  const documents = await safe(
    db.select().from(employeeDocuments).where(eq(employeeDocuments.staffAccountId,targetId)).orderBy(desc(employeeDocuments.createdAt)),
    []
  );

  const schedules = await safe(
    db.select().from(weeklySchedules).where(eq(weeklySchedules.staffAccountId,targetId)).orderBy(desc(weeklySchedules.scheduleDate)),
    []
  );
  const shifts = await safe(
    db.select().from(shiftTemplates).where(eq(shiftTemplates.active,true)),
    []
  );
  const employeeSchedules = schedules.map(row => ({
    ...row,
    shift: shifts.find(item => item.id === row.shiftTemplateId) ?? null,
  }));

  const m=await getCompanyForStaff(actorId);
  const payroll = m ? await safe(
    db.select().from(payrollRecords)
      .where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.staffAccountId,targetId)))
      .orderBy(desc(payrollRecords.month)),
    []
  ) : [];

  const companyAudit = m ? await safe(
    db.select().from(auditLogs)
      .where(eq(auditLogs.companyId,m.companyId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(250),
    []
  ) : [];

  const employeeAudit = companyAudit.filter((log:any) => {
    if (String(log.entityId ?? "") === String(targetId)) return true;
    const metadata = String(log.metadata ?? "");
    return metadata.includes(`"staffAccountId":${targetId}`) || metadata.includes(`"staffAccountId": ${targetId}`);
  });

  return {staff,attendance,requests,adjustments,advances,documents,payroll,schedules:employeeSchedules,audit:employeeAudit};
}
