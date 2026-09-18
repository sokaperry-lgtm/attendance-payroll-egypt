import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";
import { getSessionCookieOptions } from "./_core/cookies";
import { INTERNAL_SESSION_COOKIE } from "../shared/const";
import { companyAdminProcedure, managerProcedure, publicProcedure, router, staffProcedure } from "./_core/trpc";
import * as enterprise from "./enterprise";
import * as db from "./db";

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
    list: managerProcedure.query(async () => (await db.listStaffAccounts()).map((item) => ({ ...item }))),
    create: managerProcedure.input(z.object({ phone: z.string().min(3).max(32), password: z.string().min(6).max(120), name: z.string().min(2).max(160), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).default(0), shiftStart: z.string().max(8).default("09:00"), shiftEnd: z.string().max(8).default("18:00") })).mutation(async ({ ctx, input }) => { const staff = await db.createStaffAccount({ ...input, role: "employee" }); if (staff) { const actor = await enterprise.getCompanyForStaff(ctx.staffUser.id); if (actor) { const m = await enterprise.getMembership(staff.id); if (!m) { const dbx = await db.getDb(); if (dbx) { const { companyMembers } = await import("../drizzle/schema"); await dbx.insert(companyMembers).values({ companyId: actor.companyId, branchId: actor.branchId, staffAccountId: staff.id, role: "employee" }); } } await enterprise.createNotification(staff.id, "welcome", "مرحبًا بك في الشركة", "تم إنشاء حسابك ويمكنك الآن تسجيل الدخول."); } } return staffView(staff); }),
    update: managerProcedure.input(z.object({ id: z.number().int(), phone: z.string().min(3).max(32).optional(), password: z.string().min(6).max(120).optional(), name: z.string().min(2).max(160).optional(), title: z.string().max(120).optional(), department: z.string().max(120).optional(), baseSalary: z.number().int().min(0).optional(), shiftStart: z.string().max(8).optional(), shiftEnd: z.string().max(8).optional(), active: z.boolean().optional() })).mutation(async ({ input }) => { const { id, ...changes } = input; return staffView(await db.updateStaffAccount(id, changes)); }),
  }),
  company: router({
    settings: staffProcedure.query(async () => (await db.getCompanySettings()) ?? { id: 0, name: "الفرع الرئيسي", address: "مدينة نصر، القاهرة", latitude: "30.0444", longitude: "31.2357", radiusMeters: 200 }),
    updateSettings: managerProcedure.input(z.object({ name: z.string().min(2).max(160), address: z.string().min(2).max(255), latitude: z.string().max(32), longitude: z.string().max(32), radiusMeters: z.number().int().min(50).max(5000) })).mutation(({ input }) => db.updateCompanySettings(input)),
  }),
  schedule: router({
    templates: staffProcedure.query(() => db.listShiftTemplates()),
    mine: staffProcedure.query(({ ctx }) => db.listSchedules(ctx.staffUser.id)),
    all: managerProcedure.query(() => db.listSchedules()),
    save: managerProcedure.input(z.object({ staffAccountId: z.number().int(), scheduleDate: z.string().length(10), shiftTemplateId: z.number().int(), note: z.string().max(255).optional() })).mutation(({ input }) => db.saveSchedule(input)),
  }),
  attendance: router({
    list: staffProcedure.query(({ ctx }) => db.listAttendance(ctx.staffUser.id)),
    managerUpdate: managerProcedure.input(z.object({ staffAccountId: z.number().int(), date: z.string().length(10), checkIn: z.string().max(8).nullable().optional(), checkOut: z.string().max(8).nullable().optional(), status: z.enum(["حاضر", "متأخر", "غياب", "إجازة", "مأمورية"]), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0).nullable().optional(), note: z.string().max(1000).nullable().optional() })).mutation(({ input }) => db.updateAttendanceByManager(input)),
    checkIn: staffProcedure.input(z.object({ date: z.string().length(10), time: z.string().max(8), status: z.string().max(32), lateMinutes: z.number().int().min(0), distanceMeters: z.number().int().min(0) })).mutation(async ({ ctx, input }) => { const branch = await enterprise.getBranchForStaff(ctx.staffUser.id); if (branch && input.distanceMeters > branch.radiusMeters) throw new Error(`أنت خارج نطاق الحضور المسموح (${branch.radiusMeters} متر).`); const records = await db.listAttendance(ctx.staffUser.id); const existing = records.find(r => r.date === input.date); if (existing?.checkIn) throw new Error("تم تسجيل الحضور بالفعل لهذا اليوم."); const late = Math.max(0, timeMinutes(input.time) - timeMinutes(ctx.staffUser.shiftStart)); const status = late > 0 ? "متأخر" : "حاضر"; return db.upsertAttendance({ staffAccountId: ctx.staffUser.id, date: input.date, checkIn: input.time, checkOut: null, status, lateMinutes: late, distanceMeters: input.distanceMeters, note: null }); }),
    checkOut: staffProcedure.input(z.object({ date: z.string().length(10), time: z.string().max(8) })).mutation(async ({ ctx, input }) => {
      const records = await db.listAttendance(ctx.staffUser.id);
      const current = records.find((item) => item.date === input.date);
      if (!current) throw new Error("سجل الحضور غير موجود.");
      return db.upsertAttendance({ staffAccountId: ctx.staffUser.id, date: input.date, checkIn: current.checkIn, checkOut: input.time, status: current.status, lateMinutes: current.lateMinutes, distanceMeters: current.distanceMeters, note: current.note });
    }),
  }),
  requests: router({
    list: staffProcedure.query(({ ctx }) => db.listRequests(ctx.staffUser.role === "manager" ? undefined : ctx.staffUser.id)),
    create: staffProcedure.input(z.object({ type: z.string().max(32), fromDate: z.string().length(10), toDate: z.string().length(10), reason: z.string().min(2).max(1000) })).mutation(({ ctx, input }) => db.createRequest({ ...input, staffAccountId: ctx.staffUser.id })),
    review: managerProcedure.input(z.object({ id: z.number().int(), status: z.enum(["مقبول", "مرفوض"]) })).mutation(async ({ ctx, input }) => { const row = await db.approveRequest(input.id, ctx.staffUser.id, input.status); if (row) await enterprise.createNotification(row.staffAccountId, "request", `تم تحديث طلبك`, `حالة الطلب أصبحت: ${input.status}`); return row; }),
  }),
  leave: router({
    balance: staffProcedure.input(z.object({ year: z.number().int().min(2024).max(2100) })).query(({ ctx, input }) => enterprise.getLeaveBalance(ctx.staffUser.id, input.year)),
  }),
  payroll: router({
    list: companyAdminProcedure.input(z.object({ month: z.string().regex(/^\\d{4}-\\d{2}$/) })).query(({ ctx, input }) => enterprise.getPayroll(ctx.staffUser.id, input.month)),
    generate: companyAdminProcedure.input(z.object({ month: z.string().regex(/^\\d{4}-\\d{2}$/) })).mutation(({ ctx, input }) => enterprise.generatePayroll(ctx.staffUser.id, input.month)),
    approve: companyAdminProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.approvePayroll(ctx.staffUser.id, input.id)),
  }),
  notifications: router({
    list: staffProcedure.query(({ ctx }) => enterprise.listNotifications(ctx.staffUser.id)),
    read: staffProcedure.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => enterprise.markNotificationRead(ctx.staffUser.id, input.id)),
  }),
  companyAdmin: router({
    branches: companyAdminProcedure.query(({ ctx }) => enterprise.listCompanyBranches(ctx.staffUser.id)),
    createBranch: companyAdminProcedure.input(z.object({ name:z.string().min(2), address:z.string().min(2), latitude:z.string(), longitude:z.string(), radiusMeters:z.number().int().min(50).max(5000) })).mutation(({ ctx, input }) => enterprise.createBranch(ctx.staffUser.id,input)),
    role: managerProcedure.input(z.object({ staffAccountId:z.number().int(), role:z.enum(["owner","hr","manager","accountant","employee"]) })).mutation(({ ctx,input }) => enterprise.setMemberRole(ctx.staffUser.id,input.staffAccountId,input.role)),
    subscription: staffProcedure.query(({ ctx }) => enterprise.getSubscription(ctx.staffUser.id)),
    changePlan: managerProcedure.input(z.object({ plan:z.enum(["trial","starter","growth","scale"]) })).mutation(({ ctx,input }) => enterprise.updateSubscription(ctx.staffUser.id,input.plan)),
    security: staffProcedure.query(({ ctx }) => enterprise.getSecuritySummary(ctx.staffUser.id)),
  }),
  reports: router({
    month: managerProcedure.input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) })).query(({ input }) => db.getMonthlyStaffReports(input.month)),
  }),
});

export type AppRouter = typeof appRouter;
