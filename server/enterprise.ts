import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  companies, branches, companyMembers, departments, leaveBalances,
  payrollRecords, notifications, subscriptions, auditLogs, staffAccounts,
  attendanceRecords, staffRequests
} from "../drizzle/schema";

export type CompanyRole = "owner" | "hr" | "manager" | "accountant" | "employee";

export async function getMembership(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const rows = await db.select().from(companyMembers).where(eq(companyMembers.staffAccountId, staffAccountId)).limit(1);
  return rows[0];
}

export async function ensureCompanyForStaff(staffAccountId: number, companyName = "الشركة الرئيسية") {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const existing = await getMembership(staffAccountId);
  if (existing) return existing;
  let company = (await db.select().from(companies).limit(1))[0];
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
  const role: CompanyRole = staff?.role === "manager" ? "owner" : "employee";
  const result = await db.insert(companyMembers).values({ companyId: company.id, branchId: branch?.id ?? null, staffAccountId, role });
  return (await db.select().from(companyMembers).where(eq(companyMembers.id, Number(result[0].insertId))).limit(1))[0];
}

export async function getCompanyForStaff(staffAccountId: number) {
  const db = await getDb(); if (!db) return undefined;
  const membership = await getMembership(staffAccountId);
  if (!membership) return ensureCompanyForStaff(staffAccountId);
  return membership;
}

export async function getBranchForStaff(staffAccountId: number) { const db = await getDb(); if (!db) return undefined; const m = await getCompanyForStaff(staffAccountId); if (!m?.branchId) return undefined; return (await db.select().from(branches).where(eq(branches.id,m.branchId)).limit(1))[0]; }

export async function listCompanyBranches(staffAccountId: number) {
  const db = await getDb(); if (!db) return [];
  const m = await getCompanyForStaff(staffAccountId); if (!m) return [];
  return db.select().from(branches).where(eq(branches.companyId, m.companyId)).orderBy(desc(branches.createdAt));
}

export async function createBranch(staffAccountId: number, input: { name: string; address: string; latitude: string; longitude: string; radiusMeters: number }) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m) throw new Error("Company not found");
  const result = await db.insert(branches).values({ ...input, companyId: m.companyId });
  return (await db.select().from(branches).where(eq(branches.id, Number(result[0].insertId))).limit(1))[0];
}

export async function setMemberRole(actorId: number, staffAccountId: number, role: CompanyRole) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const actor = await getCompanyForStaff(actorId); if (!actor || actor.role !== "owner") throw new Error("غير مصرح");
  const target = await getMembership(staffAccountId); if (!target || target.companyId !== actor.companyId) throw new Error("الموظف غير موجود في الشركة");
  await db.update(companyMembers).set({ role, updatedAt: new Date() }).where(eq(companyMembers.staffAccountId, staffAccountId));
  await db.update(staffAccounts).set({ role: role === "employee" ? "employee" : "manager", updatedAt: new Date() }).where(eq(staffAccounts.id, staffAccountId));
  await writeAudit(actorId, actor.companyId, "role.updated", "staff", String(staffAccountId), { role });
  return getMembership(staffAccountId);
}

export async function ensureLeaveBalance(staffAccountId: number, year: number) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m) throw new Error("Company not found");
  const existing = (await db.select().from(leaveBalances).where(and(eq(leaveBalances.staffAccountId, staffAccountId), eq(leaveBalances.year, year))).limit(1))[0];
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
  const result = await db.insert(notifications).values({ staffAccountId, type, title, body });
  return (await db.select().from(notifications).where(eq(notifications.id, Number(result[0].insertId))).limit(1))[0];
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
  const m = await getCompanyForStaff(staffAccountId); if (!m || m.role !== "owner") throw new Error("غير مصرح");
  const plans: Record<string,{seats:number;price:number}> = { trial:{seats:10,price:0}, starter:{seats:25,price:999}, growth:{seats:75,price:2499}, scale:{seats:250,price:5999} };
  const p=plans[plan]; if (!p) throw new Error("الباقة غير صحيحة");
  const current = await getSubscription(staffAccountId);
  if (!current) throw new Error("Subscription unavailable");
  await db.update(subscriptions).set({ plan, status:"active", seats:p.seats, monthlyPrice:p.price, currentPeriodStart:new Date(), currentPeriodEnd:new Date(Date.now()+30*86400000), updatedAt:new Date() }).where(eq(subscriptions.id,current.id));
  await writeAudit(staffAccountId,m.companyId,"subscription.updated","subscription",String(current.id),{plan});
  return getSubscription(staffAccountId);
}

export async function generatePayroll(staffAccountId: number, month: string) {
  const db = await getDb(); if (!db) throw new Error("Database not available");
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","hr","accountant","manager"].includes(m.role)) throw new Error("غير مصرح");
  const staff = await db.select().from(staffAccounts).where(eq(staffAccounts.active,true));
  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId,m.companyId));
  const ids = new Set(members.map(x=>x.staffAccountId));
  const attendance = await db.select().from(attendanceRecords);
  const result=[];
  for(const s of staff.filter(x=>ids.has(x.id))) {
    const records=attendance.filter(x=>x.staffAccountId===s.id && x.date.startsWith(month));
    const absences=records.filter(x=>x.status==="غياب").length;
    const lateMinutes=records.reduce((a,x)=>a+x.lateMinutes,0);
    const lateDeduction=Math.round((s.baseSalary/30/8/60)*lateMinutes);
    const absenceDeduction=Math.round((s.baseSalary/30)*absences);
    const gross=s.baseSalary;
    const net=Math.max(0,gross-lateDeduction-absenceDeduction);
    const existing=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.staffAccountId,s.id),eq(payrollRecords.month,month))).limit(1))[0];
    const values={companyId:m.companyId,staffAccountId:s.id,month,baseSalary:s.baseSalary,allowances:0,bonuses:0,overtime:0,absenceDeduction,lateDeduction,otherDeductions:0,advances:0,grossSalary:gross,netSalary:net,status:"draft"};
    if(existing) await db.update(payrollRecords).set({...values,updatedAt:new Date()}).where(eq(payrollRecords.id,existing.id));
    else await db.insert(payrollRecords).values(values);
    result.push(values);
  }
  await writeAudit(staffAccountId,m.companyId,"payroll.generated","payroll",month,{count:result.length});
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function approvePayroll(staffAccountId:number, id:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m || !["owner","hr","accountant"].includes(m.role)) throw new Error("غير مصرح");
  await db.update(payrollRecords).set({status:"approved",approvedAt:new Date(),updatedAt:new Date()}).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId)));
  const row=(await db.select().from(payrollRecords).where(eq(payrollRecords.id,id)).limit(1))[0];
  if(row) await createNotification(row.staffAccountId,"payroll","تم اعتماد راتبك",`تم اعتماد راتب شهر ${row.month} بقيمة ${row.netSalary.toLocaleString()} جنيه.`);
  return row;
}

export async function getPayroll(staffAccountId:number, month:string) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function writeAudit(staffAccountId:number, companyId:number, action:string, entity?:string, entityId?:string, metadata?:unknown) {
  const db=await getDb(); if(!db) return;
  await db.insert(auditLogs).values({staffAccountId,companyId,action,entity:entity??null,entityId:entityId??null,metadata:metadata?JSON.stringify(metadata):null});
}

export async function getSecuritySummary(staffAccountId:number) {
  const m=await getCompanyForStaff(staffAccountId); if(!m) return null;
  return { sessionPolicy:"30 days", passwordHash:"scrypt", tenantIsolation:"company membership", auditLog:true, roleBasedAccess:true };
}

export async function consumeAnnualLeave(staffAccountId:number, fromDate:string, toDate:string) {
  const db=await getDb(); if(!db) return;
  const days=Math.max(1,Math.floor((new Date(toDate).getTime()-new Date(fromDate).getTime())/86400000)+1);
  const year=Number(fromDate.slice(0,4));
  const balance=await ensureLeaveBalance(staffAccountId,year);
  if(!balance) return;
  if(balance.annualDays-balance.annualUsed < days) throw new Error("رصيد الإجازات السنوية غير كافٍ.");
  await db.update(leaveBalances).set({annualUsed:balance.annualUsed+days,updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
}
