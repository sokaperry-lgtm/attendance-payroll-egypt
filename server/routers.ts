import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { INTERNAL_SESSION_COOKIE } from "../shared/const";
import { companyAdminProcedure, payrollAdminProcedure, managerProcedure, supervisorProcedure, publicProcedure, router, staffProcedure } from "./_core/trpc";
import * as enterprise from "./enterprise";
import * as db from "./db";
import { PAYROLL_RULES } from "../lib/payroll";

function timeMinutes(value: string) { const [h,m]=value.split(":").map(Number); return (h||0)*60+(m||0); }

const loginInput = z.object({ phone: z.string().min(3).max(32), password: z.string().min(4).max(120) });
const staffView = (staff: Awaited<ReturnType<typeof db.getStaffAccountById>> | null) => staff ? ({
  id: staff.id, phone: staff.phone, name: staff.name, title: staff.title, department: staff.department,
  role: staff.role, baseSalary: staff.baseSalary, shiftStart: staff.shiftStart, shiftEnd: staff.shiftEnd, active: staff.active,
}) : null;

export const appRouter = router({
  system: router({
    bootstrapStatus: publicProcedure.query(async () => ({ hasManager: (await db.countStaffAccounts()) > 0 })),
    setupManager: publicProcedure.input(z.object({ phone: z.string().min(3).max(32), password: z.string().min(6).max(120), name: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
      if ((await db.countStaffAccounts()) > 0) throw new Error("تم إعداد حساب المدير بالفعل.");
      const staff = await db.createStaffAccount({ ...input, role: "manager", title: "مدير الشركة" });
      if (staff) await enterprise.ensureCompanyForStaff(staff.id, "الشركة الرئيسية");
      const token = await db.createStaffSession(staff!.id);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { token, staff: staffView(staff) };
    }),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => staffView(ctx.staffUser)),
    login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
      const staff = await db.authenticateStaff(input.phone, input.password);
      if (!staff) throw new Error("رقم الهاتف أو كلمة المرور غير صحيحة.");
      await enterprise.ensureCompanyForStaff(staff.id);
      const token = await db.createStaffSession(staff.id);
      ctx.res.cookie(INTERNAL_SESSION_COOKIE, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { token, staff: staffView(staff) };
    }),
    logout: staffProcedure.mutation(async ({ ctx }) => {
      const authHeader = ctx.req.headers.authorization || ctx.req.headers.Authorization;
      const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
      const cookieToken = parseCookieHeader(ctx.req.headers.cookie ?? "")[INTERNAL_SESSION_COOKIE] ?? null;
      await db.deleteStaffSession(bearer || cookieToken);
      ctx.res.clearCookie(INTERNAL_SESSION_COOKIE, getSessionCookieOptions(ctx.req));
      return { success: true };
    }),
  }),
  staff: router({
    list: managerProcedure.query(async ({ ctx }) => (await enterprise.listCompanyStaff(ctx.staffUser.id)).map((item) => ({ ...item }))),
    create: managerProcedure.input(z.object({ phone: z.string().min(3).max(32), password: z.string().min(6).max(120), name: z.string().min(2).max(160), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).default(0), role: z.enum(["manager","supervisor","employee"]).default("employee"), shiftStart: z.string().max(8).default("09:00"), shiftEnd: z.string().max(8).default("18:00") })).mutation(async ({ ctx, input }) => { const staff = await db.createStaffAccount({ ...input });
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
      return staffView(staff); }),
    update: managerProcedure.input(z.object({ id: z.number().int(), phone: z.string().min(3).max(32).optional(), password: z.string().min(6).max(120).optional(), name: z.string().min(2).max(160).optional(), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).optional(), role: z.enum(["manager","supervisor","employee"]).optional(), shiftStart: z.string().max(8).optional(), shiftEnd: z.string().max(8).optional(), active: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      await enterprise.assertStaffInCompany(ctx.staffUser.id, id);
      if (id === ctx.staffUser.id && (changes.active === false || changes.role === "employee" || changes.role === "supervisor")) throw new Error("لا يمكنك تعطيل حسابك أو خفض صلاحيتك من هنا.");
      const updated = await db.updateStaffAccount(id, changes);
      if (changes.role) await enterprise.syncCompanyMemberRole(ctx.staffUser.id, id, changes.role);
      await enterprise.writeAudit(ctx.staffUser.id, (await enterprise.getCompanyForStaff(ctx.staffUser.id))!.companyId, "staff.updated", "staff", String(id), changes);
      return staffView(updated);
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
    managerUpdate: supervisorProcedure.input(z.object({ staffAccountId: z.number().int(), date: z.string().length(10), checkIn: z.string().max(8).nullable().optional(), checkOut: z.string().max(8).nullable().optional(), status: z.enum(["حاضر", "متأخر", "غياب", "إجازة", "مأمورية"]), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0).nullable().optional(), note: z.string().max(1000).nullable().optional() })).mutation(async ({ ctx, input }) => {
      await enterprise.assertStaffInCompany(ctx.staffUser.id, input.staffAccountId);
      await enterprise.assertPayrollEditable(ctx.staffUser.id, input.date.slice(0,7));
      const row = await db.updateAttendanceByManager(input);
      const m = await enterprise.getCompanyForStaff(ctx.staffUser.id);
      if (m) await enterprise.writeAudit(ctx.staffUser.id, m.companyId, "attendance.updated", "attendance", String(row?.id ?? ""), {staffAccountId:input.staffAccountId,date:input.date,status:input.status});
      return row;
    }),
    checkIn: staffProcedure.input(z.object({ date: z.string().length(10), time: z.string().max(8), status: z.string().max(32), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
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
    checkOut: staffProcedure.input(z.object({ date: z.string().length(10), time: z.string().max(8), distanceMeters: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
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
      const earlyMinutes = Math.max(0, timeMinutes(shiftEnd) - timeMinutes(input.time));
      const earlyNote = earlyMinutes > 0 ? `انصراف مبكر: ${earlyMinutes} دقيقة` : null;
      const note = [current.note, earlyNote].filter(Boolean).join(" · ") || null;
      return db.upsertAttendance({ staffAccountId: ctx.staffUser.id, date: input.date, checkIn: current.checkIn, checkOut: input.time, status: current.status, lateMinutes: current.lateMinutes, distanceMeters: current.distanceMeters, note });
    }),
  }),
  requests: router({
    list: staffProcedure.query(({ ctx }) => ctx.staffUser.role === "manager" ? enterprise.listCompanyRequests(ctx.staffUser.id) : db.listRequests(ctx.staffUser.id)),
    create: staffProcedure.input(z.object({ type: z.string().max(32), fromDate: z.string().length(10), toDate: z.string().length(10), reason: z.string().min(2).max(1000), hours: z.number().min(0.5).max(24).optional() })).mutation(({ ctx, input }) => db.createRequest({ ...input, staffAccountId: ctx.staffUser.id })),
    review: supervisorProcedure.input(z.object({ id: z.number().int(), status: z.enum(["مقبول", "مرفوض"]) })).mutation(async ({ ctx, input }) => {
      const existing = (await enterprise.listCompanyRequests(ctx.staffUser.id)).find(r => r.id === input.id);
      if (!existing) throw new Error("الطلب غير موجود.");
      if (existing.status !== "قيد المراجعة") throw new Error("هذا الطلب تمت معالجته بالفعل.");
      if (input.status === "مقبول" && existing.type === "إجازة") await enterprise.consumeLeaveBalance(existing.staffAccountId, existing.fromDate, existing.toDate, "annual");
      if (input.status === "مقبول" && existing.type === "إجازة مرضية") await enterprise.consumeLeaveBalance(existing.staffAccountId, existing.fromDate, existing.toDate, "sick");
      const row = await db.approveRequest(input.id, ctx.staffUser.id, input.status);
      if (row) {
        await enterprise.createNotification(row.staffAccountId, "request", "تم تحديث طلبك", `حالة الطلب أصبحت: ${input.status}`);
        const m=await enterprise.getCompanyForStaff(ctx.staffUser.id);
        if(m) await enterprise.writeAudit(ctx.staffUser.id,m.companyId,"request.reviewed","request",String(row.id),{status:input.status});
      }
      return row;
    }),
  }),
  leave: router({
    balance: staffProcedure.input(z.object({ year: z.number().int().min(2024).max(2100) })).query(({ ctx, input }) => enterprise.getLeaveBalance(ctx.staffUser.id, input.year)),
  }),
  payroll: router({
    list: payrollAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getPayroll(ctx.staffUser.id, input.month)),
    generate: payrollAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).mutation(({ ctx, input }) => enterprise.generatePayroll(ctx.staffUser.id, input.month)),
    approve: payrollAdminProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.approvePayroll(ctx.staffUser.id, input.id)),
    payslip: staffProcedure.input(z.object({ id: z.number().int() })).query(({ ctx, input }) => enterprise.getPayrollPayslip(ctx.staffUser.id, input.id)),
  }),
  notifications: router({
    list: staffProcedure.query(({ ctx }) => enterprise.listNotifications(ctx.staffUser.id)),
    read: staffProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.markNotificationRead(ctx.staffUser.id, input.id)),
  }),
  hrTools: router({
    documents: supervisorProcedure.input(z.object({staffAccountId:z.number().int()})).query(({ctx,input})=>enterprise.listEmployeeDocuments(ctx.staffUser.id,input.staffAccountId)),
    addDocument: managerProcedure.input(z.object({staffAccountId:z.number().int(),type:z.string().min(2).max(40),title:z.string().min(2).max(160),documentNumber:z.string().max(120).optional(),expiryDate:z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createEmployeeDocument(ctx.staffUser.id,input)),
    deleteDocument: managerProcedure.input(z.object({id:z.number().int()})).mutation(({ctx,input})=>enterprise.deleteEmployeeDocument(ctx.staffUser.id,input.id)),
    adjustments: companyAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })).query(({ctx,input}) => enterprise.listCompanySalaryAdjustments(ctx.staffUser.id,input.month)),
    advances: companyAdminProcedure.query(({ctx}) => enterprise.listCompanyAdvances(ctx.staffUser.id)),
    addAdjustment: companyAdminProcedure.input(z.object({staffAccountId:z.number().int(),month:z.string().regex(/^\d{4}-\d{2}$/),type:z.enum(["allowance","bonus","incentive","penalty","deduction"]),title:z.string().min(2).max(160),amount:z.number().int().positive(),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createSalaryAdjustment(ctx.staffUser.id,input)),
    addAdvance: companyAdminProcedure.input(z.object({staffAccountId:z.number().int(),amount:z.number().int().positive(),installmentAmount:z.number().int().positive(),startMonth:z.string().regex(/^\d{4}-\d{2}$/),note:z.string().max(500).optional()})).mutation(({ctx,input})=>enterprise.createSalaryAdvance(ctx.staffUser.id,input)),
    employee360: supervisorProcedure.input(z.object({staffAccountId:z.number().int()})).query(({ctx,input})=>enterprise.listEmployee360(ctx.staffUser.id,input.staffAccountId)),
  }),
  companyAdmin: router({
    branches: companyAdminProcedure.query(({ ctx }) => enterprise.listCompanyBranches(ctx.staffUser.id)),
    createBranch: companyAdminProcedure.input(z.object({ name:z.string().min(2), address:z.string().min(2), latitude:z.string(), longitude:z.string(), radiusMeters:z.number().int().min(50).max(5000) })).mutation(({ ctx, input }) => enterprise.createBranch(ctx.staffUser.id,input)),
    role: managerProcedure.input(z.object({ staffAccountId:z.number().int(), role:z.enum(["owner","hr","manager","supervisor","accountant","employee"]) })).mutation(({ ctx,input }) => enterprise.setMemberRole(ctx.staffUser.id,input.staffAccountId,input.role)),
    subscription: staffProcedure.query(({ ctx }) => enterprise.getSubscription(ctx.staffUser.id)),
    changePlan: managerProcedure.input(z.object({ plan:z.enum(["trial","starter","growth","scale"]) })).mutation(({ ctx,input }) => enterprise.updateSubscription(ctx.staffUser.id,input.plan)),
    security: staffProcedure.query(({ ctx }) => enterprise.getSecuritySummary(ctx.staffUser.id)),
    payrollAccess: staffProcedure.query(async ({ ctx }) => {
      const membership = await enterprise.getMembership(ctx.staffUser.id);
      const role = membership?.role ?? "employee";
      const canManagePayroll =
        ["owner", "manager", "hr", "accountant", "supervisor"].includes(role) ||
        ["manager", "supervisor"].includes(ctx.staffUser.role);
      return { role, canManagePayroll };
    }),
  }),
  reports: router({
    month: supervisorProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getMonthlyStaffReports(ctx.staffUser.id, input.month)),
  }),
  audit: router({
    list: companyAdminProcedure.query(({ ctx }) => enterprise.listAuditLogs(ctx.staffUser.id)),
  }),
  selfService: router({
    me: staffProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ ctx, input }) => enterprise.getEmployeeSelfService(ctx.staffUser.id, input.month)),
  }),
  exports: router({
    attendanceCsv: managerProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ ctx, input }) => {
      const report = await enterprise.getMonthlyStaffReports(ctx.staffUser.id, input.month);
      return enterprise.toCsv(report.employees.flatMap((e:any) => e.records.map((r:any) => ({ employee:e.name, date:r.date, checkIn:r.checkIn, checkOut:r.checkOut, status:r.status, lateMinutes:r.lateMinutes }))));
    }),
    payrollCsv: companyAdminProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ ctx, input }) => {
      const rows = await enterprise.getPayroll(ctx.staffUser.id, input.month);
      return enterprise.toCsv(rows.map((r:any) => ({ staffAccountId:r.staffAccountId, month:r.month, baseSalary:r.baseSalary, socialInsurance:r.employeeSocialInsurance, incomeTax:r.employeeIncomeTax, absenceDeduction:r.absenceDeduction, lateDeduction:r.lateDeduction, netSalary:r.netSalary, status:r.status })));
    }),
  }),
});

export type AppRouter = typeof appRouter;
