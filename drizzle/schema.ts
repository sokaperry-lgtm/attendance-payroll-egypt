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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;
export type StaffRequest = typeof staffRequests.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
