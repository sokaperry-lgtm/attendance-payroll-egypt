import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { INTERNAL_SESSION_COOKIE } from "../shared/const";
import { companyAdminProcedure, payrollAdminProcedure, managerProcedure, supervisorProcedure, publicProcedure, router, staffProcedure, hrProcedure, payrollProcedure, reportsProcedure } from "./_core/trpc";
import * as enterprise from "./enterprise";
import * as db from "./db";
import { PAYROLL_RULES } from "../lib/payroll";

function timeMinutes(value: string) {
  const match = /^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?$/.test(value);
  if (!match) throw new Error("صيغة الوقت غير صحيحة.");
  const [h,m]=value.split(":").map(Number);
  return h*60+m;
}
function cairoToday() {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Cairo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}

const loginInput = z.object({ phone: z.string().min(3).max(32), password: z.string().min(4).max(120) });
const staffView = async (staff: Awaited<ReturnType<typeof db.getStaffAccountById>> | null) => {
  if (!staff) return null;
  const membershipRole = (await enterprise.getMembership(staff.id))?.role;
  const effectiveMembershipRole = staff.role === "manager" && membershipRole !== "owner" && membershipRole !== "manager"
    ? "manager"
    : membershipRole ?? (staff.role === "manager" ? "manager" : staff.role === "supervisor" ? "supervisor" : "employee");
  return {
    id: staff.id, phone: staff.phone, name: staff.name, title: staff.title, department: staff.department,
    role: staff.role, baseSalary: staff.baseSalary, shiftStart: staff.shiftStart, shiftEnd: staff.shiftEnd, active: staff.active,
    membershipRole: effectiveMembershipRole,
  };
};

export const appRouter = router({
  system: router({
    bootstrapStatus: publicProcedure.query(async () => ({ hasManager: (await db.countStaffAccounts()) > 0 })),
    setupManager: publicProcedure.input(z.object({ phone: z.string().min(3).max(32), password: z.string().min(6).max(120), name: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      if ((await db.countStaffAccounts()) > 0) throw new Error("تم إعداد حساب المدير بالفعل.");
      const staff = await db.createStaffAccount({ ...input, role: "manager", title: "مدير الشركة" });
      if (staff) await enterprise.ensureCompanyForStaff(staff.id, "الشركة الرئيسية");
      const token = await db.createStaffSession(staff!.id);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { token, staff: await staffView(staff) };
    }),
    resetAndSetup: publicProcedure.input(z.object({
      confirm: z.literal("RESET-STAFF"),
      phone: z.string().min(3).max(32),
      password: z.string().min(6).max(120),
      name: z.string().min(2).max(160),
    })).mutation(async ({ ctx, input }) => {
      const staff = await db.resetStaffAccountsAndCreateManager(input);
      await enterprise.ensureCompanyForStaff(staff.id, "الشركة الرئيسية");
      const token = await db.createStaffSession(staff.id);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { token, staff: await staffView(staff) };
    }),
  }),
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.staffUser) return null;
      // Self-heal the tenant membership before the client decides which
      // admin tools to render. This also repairs older accounts created
      // before company membership was introduced.
      await enterprise.ensureCompanyForStaff(ctx.staffUser.id);
      const freshStaff = await db.getStaffAccountById(ctx.staffUser.id);
      return await staffView(freshStaff);
    }),
    login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
      const staff = await db.authenticateStaff(input.phone, input.password);
      if (!staff) throw new Error("رقم الهاتف أو كلمة المرور غير صحيحة.");
      const membership = await enterprise.ensureCompanyForStaff(staff.id);
      await enterprise.writeAudit(staff.id, membership.companyId, "auth.login", "staff", String(staff.id), { role: staff.role });
      const token = await db.createStaffSession(staff.id);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { token, staff: await staffView(staff) };
    }),
    logout: staffProcedure.mutation(async ({ ctx }) => {
      const authHeader = ctx.req.headers.authorization || ctx.req.headers.Authorization;
      const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const cookieToken = parseCookieHeader(ctx.req.headers.cookie ?? "")[INTERNAL_SESSION_COOKIE] ?? null;
      const membership = await enterprise.getCompanyForStaff(ctx.staffUser.id);
      if (membership) await enterprise.writeAudit(ctx.staffUser.id, membership.companyId, "auth.logout", "staff", String(ctx.staffUser.id));
      await db.deleteStaffSession(bearer || cookieToken);
      ctx.res.clearCookie(INTERNAL_SESSION_COOKIE, getSessionCookieOptions(ctx.req));
      return { success: true };
    }),
  }),
  staff: router({
    list: hrProcedure.query(async ({ ctx }) => (await enterprise.listCompanyStaff(ctx.staffUser.id)).map((item) => ({ ...item }))),
    create: hrProcedure.input(z.object({ phone: z.string().min(3).max(32), password: z.string().min(6).max(120), name: z.string().min(2).max(160), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).default(0), role: z.enum(["manager","supervisor","employee"]).default("employee"), shiftStart: z.string().max(8).default("09:00"), shiftEnd: z.string().max(8).default("18:00") })).mutation(async ({ ctx, input }) => {
      const actorMembership = await enterprise.getMembership(ctx.staffUser.id);
      if (input.role === "manager" && !["owner", "manager"].includes(actorMembership?.role ?? "")) {
        throw new Error("إنشاء حساب مدير متاح للمالك أو مدير الشركة فقط.");
      }
      const staff = await db.createStaffAccount({ ...input });
      if (staff) {
        const actor = await enterprise.getCompanyForStaff(ctx.staffUser.id);
        if (actor) {
          // A normal manager can create a manager, but must not silently mint
          // another tenant owner. The first setup account is the owner.
          const membershipRole = input.role === "manager" ? "manager" : input.role === "supervisor" ? "supervisor" : "employee";
          const m = await enterprise.getMembership(staff.id);
          if (!m) {
            const dbx = await db.getDb();
            if (dbx) {
              const { companyMembers } = await import("../drizzle/schema");
              await dbx.insert(companyMembers).values({
                companyId: actor.companyId,
                branchId: actor.branchId,
                staffAccountId: staff.id,
                role: membershipRole,
              });
            }
          }
          await enterprise.createNotification(staff.id, "welcome", "مرحبًا بك في الشركة", "تم إنشاء حسابك ويمكنك الآن تسجيل الدخول.");
        }
      }
      return await staffView(staff); }),
    update: hrProcedure.input(z.object({ id: z.number().int(), phone: z.string().min(3).max(32).optional(), password: z.string().min(6).max(120).optional(), name: z.string().min(2).max(160).optional(), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).optional(), role: z.enum(["manager","supervisor","employee"]).optional(), shiftStart: z.string().max(8).optional(), shiftEnd: z.string().max(8).optional(), active: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const access = await enterprise.assertStaffInCompany(ctx.staffUser.id, id);
      if (id === ctx.staffUser.id && (changes.active === false || changes.role === "employee" || changes.role === "supervisor")) throw new Error("لا يمكنك تعطيل حسابك أو خفض صلاحيتك من هنا.");
      // Role changes are privileged operations. HR may manage employee data,
      // but only owner/manager can change a member's access level.
      if (changes.role && !["owner", "manager"].includes(access.actor.role)) {
        throw new Error("غير مصرح بتغيير صلاحيات الموظفين.");
      }
      if (changes.role && access.target.role === "owner" && access.actor.role !== "owner") {
        throw new Error("لا يمكن لمدير الشركة تغيير صلاحيات المالك.");
      }
      const updated = await db.updateStaffAccount(id, changes);
      if (changes.role) await enterprise.syncCompanyMemberRole(ctx.staffUser.id, id, changes.role);
      await enterprise.writeAudit(ctx.staffUser.id, (await enterprise.getCompanyForStaff(ctx.staffUser.id))!.companyId, "staff.updated", "staff", String(id), changes);
      return await staffView(updated);
    }),
  }),
  company: router({
    settings: staffProcedure.query(async ({ctx}) => { const b = await enterprise.getBranchForStaff(ctx.staffUser.id); return b ?? { id: 0, name: "الفرع الرئيسي", address: "مدينة نصر، القاهرة", latitude: "30.0444", longitude: "31.2357", radiusMeters: 200 }; }),
    updateSettings: managerProcedure.input(z.object({ name: z.string().min(2).max(160), address: z.string().min(2).max(255), latitude: z.string().max(32), longitude: z.string().max(32), radiusMeters: z.number().int().min(50).max(5000) })).mutation(({ ctx,input }) => enterprise.updateBranchForStaff(ctx.staffUser.id,input)),
  }),
  schedule: router({
    templates: staffProcedure.query(() => db.listShiftTemplates()),
    mine: staffProcedure.query(({ ctx }) => db.listSchedules(ctx.staffUser.id)),
    all: supervisorProcedure.query(({ ctx }) => enterprise.listCompanySchedules(ctx.staffUser.id)),
    save: supervisorProcedure.input(z.object({ staffAccountId: z.number().int(), scheduleDate: z.string().length(10), shiftTemplateId: z.number().int(), note: z.string().max(255).optional() })).mutation(async ({ ctx, input }) => { await enterprise.assertStaffInCompany(ctx.staffUser.id, input.staffAccountId); return db.saveSchedule(input); }),
  }),
  attendance: router({
    list: staffProcedure.query(({ ctx }) => db.listAttendance(ctx.staffUser.id)),
    team: supervisorProcedure.query(({ ctx }) => enterprise.listCompanyAttendance(ctx.staffUser.id)),
    sync: supervisorProcedure.input(z.object({ month: z.string().regex(/^\\d{4}-\\d{2}$/) })).mutation(({ ctx, input }) => enterprise.syncMonthlyAttendance(ctx.staffUser.id, input.month)),
    workSummary: supervisorProcedure.input(z.object({ month: z.string().regex(/^\\d{4}-\\d{2}$/) })).query(({ ctx, input }) => enterprise.getAttendanceWorkSummary(ctx.staffUser.id, input.month)),
    managerUpdate: supervisorProcedure.input(z.object({ staffAccountId: z.number().int(), date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), checkIn: z.string().max(8).nullable().optional(), checkOut: z.string().max(8).nullable().optional(), status: z.enum(["حاضر", "متأخر", "غياب", "إجازة", "مأمورية"]), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0).nullable().optional(), note: z.string().max(1000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const access = await enterprise.assertStaffInCompany(ctx.staffUser.id, input.staffAccountId);
      if (access.target.role === "owner" && access.actor.role !== "owner") throw new Error("لا يمكن تعديل حضور المالك من هذا الحساب.");
      if (input.date > cairoToday()) throw new Error("لا يمكن تسجيل حضور بتاريخ مستقبلي.");
      if (input.checkIn) timeMinutes(input.checkIn);
      if (input.checkOut) timeMinutes(input.checkOut);
      if (input.checkIn && input.checkOut && timeMinutes(input.checkOut) < timeMinutes(input.checkIn) && !String(input.note ?? "").includes("وردية ليلية")) {
        throw new Error("وقت الانصراف لا يمكن أن يسبق وقت الحضور.");
      }
      await enterprise.assertPayrollEditable(ctx.staffUser.id, input.date.slice(0,7));
      const row = await db.updateAttendanceByManager(input);
      const m = await enterprise.getCompanyForStaff(ctx.staffUser.id);
      if (m) await enterprise.writeAudit(ctx.staffUser.id, m.companyId, "attendance.updated", "attendance", String(row?.id ?? ""), {staffAccountId:input.staffAccountId,date:input.date,status:input.status});
      return row;
    }),
    checkIn: staffProcedure.input(z.object({ date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), time: z.string().max(8), status: z.string().max(32), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      timeMinutes(input.time);
      if (input.date > cairoToday()) throw new Error("لا يمكن تسجيل حضور بتاريخ مستقبلي.");
      await enterprise.assertPayrollEditable(ctx.staffUser.id, input.date.slice(0,7));
      const branch = await enterprise.getBranchForStaff(ctx.staffUser.id);
      if (branch && input.distanceMeters > branch.radiusMeters) throw new Error(`أنت خارج نطاق الحضور المسموح (${branch.radiusMeters} متر).`);
      const records = await db.listAttendance(ctx.staffUser.id);
      const existing = records.find(r => r.date === input.date);
      if (existing?.checkIn) throw new Error("تم تسجيل الحضور بالفعل لهذا اليوم.");

      const scheduled = (await db.listSchedules(ctx.staffUser.id)).find(r => r.scheduleDate === input.date);
      if (scheduled?.shift?.kind === "weekly_off") throw new Error("هذا اليوم إجازة أسبوعية حسب الجدول.");
      const shiftStart = scheduled?.shift?.startTime ?? ctx.staffUser.shiftStart;
      const rawLate = Math.max(0, timeMinutes(input.time) - timeMinutes(shiftStart));
      const late = Math.max(0, rawLate - PAYROLL_RULES.graceMinutes);
      const status = late > 0 ? "متأخر" : "حاضر";
      return db.upsertAttendance({ staffAccountId: ctx.staffUser.id, date: input.date, checkIn: input.time, checkOut: null, status, lateMinutes: late, distanceMeters: input.distanceMeters, note: scheduled?.shift ? `حسب جدول: ${scheduled.shift.name}` : null });
    }),
    checkOut: staffProcedure.input(z.object({ date: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), time: z.string().max(8), distanceMeters: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      timeMinutes(input.time);
      if (input.date > cairoToday()) throw new Error("لا يمكن تسجيل انصراف بتاريخ مستقبلي.");
      await enterprise.assertPayrollEditable(ctx.staffUser.id, input.date.slice(0,7));
      const branch = await enterprise.getBranchForStaff(ctx.staffUser.id);
      if (branch && input.distanceMeters > branch.radiusMeters) throw new Error(`أنت خارج نطاق الانصراف المسموح (${branch.radiusMeters} متر).`);
      const records = await db.listAttendance(ctx.staffUser.id);
      const current = records.find((item) => item.date === input.date);
      if (!current) throw new Error("سجل الحضور غير موجود.");
      if (!current.checkIn) throw new Error("يجب تسجيل الحضور أولًا.");
      if (current.checkOut) throw new Error("تم تسجيل الانصراف بالفعل.");

      const scheduled = (await db.listSchedules(ctx.staffUser.id)).find(r => r.scheduleDate === input.date);
      const shiftEnd = scheduled?.shift?.endTime ?? ctx.staffUser.shiftEnd;
      const crossesMidnight = scheduled?.shift?.crossesMidnight ?? false;
      const scheduledEnd = timeMinutes(shiftEnd) + (crossesMidnight ? 24 * 60 : 0);
      let actualCheckout = timeMinutes(input.time);
      if (crossesMidnight && actualCheckout < timeMinutes(scheduled?.shift?.startTime ?? ctx.staffUser.shiftStart)) actualCheckout += 24 * 60;
      const earlyMinutes = Math.max(0, scheduledEnd - actualCheckout);
      const earlyNote = earlyMinutes > 0 ? `انصراف مبكر: ${earlyMinutes} دقيقة` : null;
      const note = [current.note, earlyNote].filter(Boolean).join(" · ") || null;
      const attendance = await db.upsertAttendance({ staffAccountId: ctx.staffUser.id, date: input.date, checkIn: current.checkIn, checkOut: input.time, status: current.status, lateMinutes: current.lateMinutes, distanceMeters: current.distanceMeters, note });

      // Detect overtime automatically from the actual checkout time.
      // A manager must approve the generated request before it reaches payroll.
      const overtimeMinutes = enterprise.overtimeAfterShiftEndMinutes(
        current.checkIn!,
        input.time,
        scheduled?.shift?.startTime ?? ctx.staffUser.shiftStart,
        scheduled?.shift?.endTime ?? ctx.staffUser.shiftEnd,
        scheduled?.shift?.crossesMidnight ?? false
      );
      if (overtimeMinutes >= 30) {
        const overtimeHours = Number((overtimeMinutes / 60).toFixed(2));

        // One automatic overtime request per employee/day.
        // This prevents duplicate requests if the checkout flow is retried.
        const existingRequests = await db.listRequests(ctx.staffUser.id);
        const hasOvertimeRequest = existingRequests.some((request) =>
          request.type === "أوفر تايم" &&
          request.fromDate === input.date &&
          request.toDate === input.date
        );

        if (!hasOvertimeRequest) {
          await db.createRequest({
            staffAccountId: ctx.staffUser.id,
            type: "أوفر تايم",
            fromDate: input.date,
            toDate: input.date,
            reason: `أوفر تايم تلقائي — الحضور ${current.checkIn} والانصراف ${input.time} — وقت إضافي ${overtimeHours} ساعة`,
            hours: overtimeHours,
          });
        }
      }

      return attendance;
    }),
  }),
  requests: router({
    list: staffProcedure.query(async ({ ctx }) => {
      const membership = await enterprise.getMembership(ctx.staffUser.id);
      const canViewTeamRequests = ["owner", "manager", "hr", "supervisor"].includes(membership?.role ?? "");
      if (canViewTeamRequests) {
        const cairoParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
        const cairoValues = Object.fromEntries(cairoParts.map(part => [part.type, part.value]));
        await enterprise.syncMonthlyAttendance(ctx.staffUser.id, `${cairoValues.year}-${cairoValues.month}`);
        return enterprise.listCompanyRequests(ctx.staffUser.id);
      }
      return db.listRequests(ctx.staffUser.id);
    }),
    create: staffProcedure.input(z.object({ type: z.enum(["إجازة","إجازة مرضية","إجازة طارئة","إذن","مأمورية"]), fromDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), toDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/), reason: z.string().min(2).max(1000), hours: z.number().min(0.5).max(24).optional() })).mutation(async ({ ctx, input }) => {
      if (input.fromDate > input.toDate) throw new Error("تاريخ بداية الإجازة يجب أن يكون قبل أو مساويًا لتاريخ النهاية.");
      if (!input.fromDate || !input.toDate) throw new Error("تواريخ الإجازة غير صحيحة.");
      if (["إجازة","إجازة مرضية","إجازة طارئة"].includes(input.type)) {
        await enterprise.validateLeaveRequest(ctx.staffUser.id, input.fromDate, input.toDate, input.type as "إجازة" | "إجازة مرضية" | "إجازة طارئة");
      }
      const row = await db.createRequest({ ...input, staffAccountId: ctx.staffUser.id });
      if (row) {
        const actorName = ctx.staffUser.name || "موظف";
        const m = await enterprise.getCompanyForStaff(ctx.staffUser.id);
        if (m) {
          await enterprise.notifyCompanyRoles(
            ctx.staffUser.id,
            ["owner", "manager", "hr", "supervisor"],
            "request",
            "طلب جديد يحتاج مراجعة",
            `${actorName} قدم طلب ${input.type} من ${input.fromDate} إلى ${input.toDate}.`
          );
          await enterprise.writeAudit(ctx.staffUser.id, m.companyId, "request.created", "request", String(row.id), {
            type: input.type, fromDate: input.fromDate, toDate: input.toDate,
          });
        }
      }
      return row;
    }),
    review: supervisorProcedure.input(z.object({ id: z.number().int(), status: z.enum(["مقبول", "مرفوض"]) })).mutation(async ({ ctx, input }) => {
      const existing = (await enterprise.listCompanyRequests(ctx.staffUser.id)).find(r => r.id === input.id);
      if (!existing) throw new Error("الطلب غير موجود.");
      if (existing.status !== "قيد المراجعة") throw new Error("هذا الطلب تمت معالجته بالفعل.");
      if (input.status === "مقبول" && ["إجازة","إجازة مرضية","إجازة طارئة"].includes(existing.type)) {
        return enterprise.reviewLeaveRequest(ctx.staffUser.id, input.id, input.status);
      }
      const row = await db.approveRequest(input.id, ctx.staffUser.id, input.status);
      if (row) {
        await enterprise.createNotification(row.staffAccountId, "request", "تم تحديث طلبك", `حالة الطلب أصبحت: ${input.status}`);
        const m=await enterprise.getCompanyForStaff(ctx.staffUser.id);
        if(m) await enterprise.writeAudit(ctx.staffUser.id,m.companyId,"request.reviewed","request",String(row.id),{status:input.status});
      }
      return row;
    }),
    waiveAttendance: supervisorProcedure.input(z.object({ staffAccountId:z.number().int(), date:z.string().length(10), kind:z.enum(["late","early"]) })).mutation(({ctx,input})=>enterprise.waiveAttendanceException(ctx.staffUser.id,input)),
    reviewAttendanceException: supervisorProcedure.input(z.object({ staffAccountId:z.number().int(), date:z.string().length(10), kind:z.enum(["late","early","absence"]), action:z.enum(["approve","cancel"]) })).mutation(({ctx,input})=>enterprise.reviewAttendanceException(ctx.staffUser.id,input)),
    cancelPenalty: companyAdminProcedure.input(z.object({ id:z.number().int() })).mutation(({ctx,input})=>enterprise.cancelSalaryAdjustment(ctx.staffUser.id,input.id)),
  }),
  leave: router({
    balance: staffProcedure.input(z.object({ year: z.number().int().min(2024).max(2100) })).query(({ ctx, input }) => enterprise.getLeaveBalance(ctx.staffUser.id, input.year)),
  }),
  payroll: router({
    list: payrollAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getPayroll(ctx.staffUser.id, input.month)),
    generate: payrollAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).mutation(({ ctx, input }) => enterprise.generatePayroll(ctx.staffUser.id, input.month)),
    approve: payrollAdminProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.approvePayroll(ctx.staffUser.id, input.id)),
    unapprove: companyAdminProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.unapprovePayroll(ctx.staffUser.id, input.id)),
    payslip: staffProcedure.input(z.object({ id: z.number().int() })).query(({ ctx, input }) => enterprise.getPayrollPayslip(ctx.staffUser.id, input.id)),
  }),
  notifications: router({
    list: staffProcedure.query(({ ctx }) => enterprise.listNotifications(ctx.staffUser.id)),
    unreadCount: staffProcedure.query(({ ctx }) => enterprise.getUnreadNotificationCount(ctx.staffUser.id)),
    read: staffProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.markNotificationRead(ctx.staffUser.id, input.id)),
  }),
  hrTools: router({
    documents: hrProcedure.input(z.object({staffAccountId:z.number().int()})).query(({ctx,input})=>enterprise.listEmployeeDocuments(ctx.staffUser.id,input.staffAccountId)),
    addDocument: hrProcedure.input(z.object({staffAccountId:z.number().int(),type:z.string().min(2).max(40),title:z.string().min(2).max(160),documentNumber:z.string().max(120).optional(),expiryDate:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createEmployeeDocument(ctx.staffUser.id,input)),
    deleteDocument: hrProcedure.input(z.object({id:z.number().int()})).mutation(({ctx,input})=>enterprise.deleteEmployeeDocument(ctx.staffUser.id,input.id)),
    adjustments: companyAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })).query(({ctx,input}) => enterprise.listCompanySalaryAdjustments(ctx.staffUser.id,input.month)),
    advances: companyAdminProcedure.query(({ctx}) => enterprise.listCompanyAdvances(ctx.staffUser.id)),
    addAdjustment: companyAdminProcedure.input(z.object({staffAccountId:z.number().int(),month:z.string().regex(/^\d{4}-\d{2}$/),type:z.enum(["allowance","bonus","incentive","penalty","deduction"]),title:z.string().min(2).max(160),amount:z.number().int().positive(),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createSalaryAdjustment(ctx.staffUser.id,input)),
    addAdvance: companyAdminProcedure.input(z.object({staffAccountId:z.number().int(),amount:z.number().int().positive(),installmentAmount:z.number().int().positive(),startMonth:z.string().regex(/^\d{4}-\d{2}$/),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createSalaryAdvance(ctx.staffUser.id,input)),
    employee360: hrProcedure.input(z.object({staffAccountId:z.number().int()})).query(({ctx,input})=>enterprise.listEmployee360(ctx.staffUser.id,input.staffAccountId)),
  }),
  companyAdmin: router({
    overview: companyAdminProcedure.query(({ ctx }) => enterprise.getCompanyAdminOverview(ctx.staffUser.id)),
    branches: companyAdminProcedure.query(({ ctx }) => enterprise.listCompanyBranches(ctx.staffUser.id)),
    members: companyAdminProcedure.query(({ ctx }) => enterprise.listCompanyMembers(ctx.staffUser.id)),
    createBranch: companyAdminProcedure.input(z.object({ name:z.string().min(2), address:z.string().min(2), latitude:z.string(), longitude:z.string(), radiusMeters:z.number().int().min(50).max(5000) })).mutation(({ ctx, input }) => enterprise.createBranch(ctx.staffUser.id,input)),
    updateBranch: companyAdminProcedure.input(z.object({ branchId:z.number().int(), name:z.string().min(2), address:z.string().min(2), latitude:z.string(), longitude:z.string(), radiusMeters:z.number().int().min(50).max(5000) })).mutation(({ ctx, input }) => enterprise.updateBranch(ctx.staffUser.id,input.branchId,input)),
    toggleBranch: companyAdminProcedure.input(z.object({ branchId:z.number().int(), active:z.boolean() })).mutation(({ ctx, input }) => enterprise.toggleBranch(ctx.staffUser.id,input.branchId,input.active)),
    assignBranch: companyAdminProcedure.input(z.object({ staffAccountId:z.number().int(), branchId:z.number().int().nullable() })).mutation(({ ctx, input }) => enterprise.assignMemberToBranch(ctx.staffUser.id,input.staffAccountId,input.branchId)),
    updateCompany: companyAdminProcedure.input(z.object({ name:z.string().min(2), legalName:z.string().max(200).optional(), email:z.string().max(320).optional(), phone:z.string().max(32).optional() })).mutation(({ ctx, input }) => enterprise.updateCompanyProfile(ctx.staffUser.id,input)),
    role: managerProcedure.input(z.object({ staffAccountId:z.number().int(), role:z.enum(["owner","hr","manager","supervisor","accountant","employee"]) })).mutation(({ ctx,input }) => enterprise.setMemberRole(ctx.staffUser.id,input.staffAccountId,input.role)),
    subscription: staffProcedure.query(({ ctx }) => enterprise.getSubscription(ctx.staffUser.id)),
    changePlan: managerProcedure.input(z.object({ plan:z.enum(["trial","starter","growth","scale"]) })).mutation(({ ctx,input }) => enterprise.updateSubscription(ctx.staffUser.id,input.plan)),
    security: staffProcedure.query(({ ctx }) => enterprise.getSecuritySummary(ctx.staffUser.id)),
    payrollAccess: staffProcedure.query(async ({ ctx }) => {
      const membership = await enterprise.getMembership(ctx.staffUser.id);
      const role = membership?.role ?? "employee";
      const canManagePayroll = ["owner", "manager", "hr", "accountant"].includes(role);
      return { role, canManagePayroll };
    }),
  }),
  reports: router({
    month: reportsProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getMonthlyStaffReports(ctx.staffUser.id, input.month)),
  }),
  audit: router({
    list: companyAdminProcedure.query(({ ctx }) => enterprise.listAuditLogs(ctx.staffUser.id)),
  }),
  selfService: router({
    me: staffProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getEmployeeSelfService(ctx.staffUser.id, input.month)),
  }),
  exports: router({
    attendanceCsv: reportsProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ ctx, input }) => {
      const report = await enterprise.getMonthlyStaffReports(ctx.staffUser.id, input.month);
      return enterprise.toCsv(report.employees.flatMap((e:any) => e.records.map((r:any) => ({ employee:e.name, date:r.date, checkIn:r.checkIn, checkOut:r.checkOut, status:r.status, lateMinutes:r.lateMinutes }))));
    }),
    payrollCsv: payrollProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ ctx, input }) => {
      const rows = await enterprise.getPayroll(ctx.staffUser.id, input.month);
      return enterprise.toCsv(rows.map((r:any) => ({ staffAccountId:r.staffAccountId, month:r.month, baseSalary:r.baseSalary, grossSalary:r.grossSalary, overtime:r.overtime, absenceDeduction:r.absenceDeduction, lateDeduction:r.lateDeduction, earlyDeduction:r.earlyDeduction, otherDeductions:r.otherDeductions, advances:r.advances, socialInsurance:r.employeeSocialInsurance, incomeTax:r.employeeIncomeTax, netSalary:r.netSalary, status:r.status })));
    }),
  }),
});

export type AppRouter = typeof appRouter;
