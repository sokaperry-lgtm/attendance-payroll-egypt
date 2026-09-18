import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const staffAccounts = mysqlTable("staff_accounts", {
  id: int("id").autoincrement().primaryKey(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 220 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  title: varchar("title", { length: 120 }),
  department: varchar("department", { length: 120 }),
  role: mysqlEnum("role", ["manager", "employee"]).default("employee").notNull(),
  baseSalary: int("baseSalary").default(0).notNull(),
  shiftStart: varchar("shiftStart", { length: 8 }).default("09:00").notNull(),
  shiftEnd: varchar("shiftEnd", { length: 8 }).default("18:00").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffSessions = mysqlTable("staff_sessions", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  tokenHash: varchar("tokenHash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const attendanceRecords = mysqlTable("attendance_records", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  checkIn: varchar("checkIn", { length: 8 }),
  checkOut: varchar("checkOut", { length: 8 }),
  status: varchar("status", { length: 32 }).default("حاضر").notNull(),
  lateMinutes: int("lateMinutes").default(0).notNull(),
  distanceMeters: int("distanceMeters"),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const staffRequests = mysqlTable("staff_requests", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  fromDate: varchar("fromDate", { length: 10 }).notNull(),
  toDate: varchar("toDate", { length: 10 }).notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 32 }).default("قيد المراجعة").notNull(),
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const companySettings = mysqlTable("company_settings", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  radiusMeters: int("radiusMeters").default(200).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const shiftTemplates = mysqlTable("shift_templates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  kind: varchar("kind", { length: 20 }).default("shift").notNull(),
  startTime: varchar("startTime", { length: 8 }).notNull(),
  endTime: varchar("endTime", { length: 8 }).notNull(),
  crossesMidnight: boolean("crossesMidnight").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
});

export const weeklySchedules = mysqlTable("weekly_schedules", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  scheduleDate: varchar("scheduleDate", { length: 10 }).notNull(),
  shiftTemplateId: int("shiftTemplateId").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;
export type StaffRequest = typeof staffRequests.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type CompanySettings = typeof companySettings.$inferSelect;
export type ShiftTemplate = typeof shiftTemplates.$inferSelect;
export type WeeklySchedule = typeof weeklySchedules.$inferSelect;


export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  legalName: varchar("legalName", { length: 200 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  currency: varchar("currency", { length: 8 }).default("EGP").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Africa/Cairo").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  latitude: varchar("latitude", { length: 32 }).notNull(),
  longitude: varchar("longitude", { length: 32 }).notNull(),
  radiusMeters: int("radiusMeters").default(200).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const companyMembers = mysqlTable("company_members", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  branchId: int("branchId"),
  staffAccountId: int("staffAccountId").notNull().unique(),
  role: varchar("role", { length: 24 }).default("employee").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const leaveBalances = mysqlTable("leave_balances", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  staffAccountId: int("staffAccountId").notNull(),
  year: int("year").notNull(),
  annualDays: int("annualDays").default(21).notNull(),
  sickDays: int("sickDays").default(14).notNull(),
  emergencyDays: int("emergencyDays").default(6).notNull(),
  annualUsed: int("annualUsed").default(0).notNull(),
  sickUsed: int("sickUsed").default(0).notNull(),
  emergencyUsed: int("emergencyUsed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const payrollRecords = mysqlTable("payroll_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  staffAccountId: int("staffAccountId").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  baseSalary: int("baseSalary").default(0).notNull(),
  allowances: int("allowances").default(0).notNull(),
  bonuses: int("bonuses").default(0).notNull(),
  overtime: int("overtime").default(0).notNull(),
  absenceDeduction: int("absenceDeduction").default(0).notNull(),
  lateDeduction: int("lateDeduction").default(0).notNull(),
  otherDeductions: int("otherDeductions").default(0).notNull(),
  advances: int("advances").default(0).notNull(),
  employeeSocialInsurance: int("employeeSocialInsurance").default(0).notNull(),
  employeeIncomeTax: int("employeeIncomeTax").default(0).notNull(),
  grossSalary: int("grossSalary").default(0).notNull(),
  netSalary: int("netSalary").default(0).notNull(),
  status: varchar("status", { length: 24 }).default("draft").notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  staffAccountId: int("staffAccountId").notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull().unique(),
  plan: varchar("plan", { length: 32 }).default("trial").notNull(),
  status: varchar("status", { length: 32 }).default("trialing").notNull(),
  seats: int("seats").default(10).notNull(),
  monthlyPrice: int("monthlyPrice").default(0).notNull(),
  trialEndsAt: timestamp("trialEndsAt"),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
  staffAccountId: int("staffAccountId"),
  action: varchar("action", { length: 80 }).notNull(),
  entity: varchar("entity", { length: 80 }),
  entityId: varchar("entityId", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
