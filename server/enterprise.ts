import { and, desc, eq } from "drizzle-orm";
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
  return rows[0];
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
  const actor = await getCompanyForStaff(actorId); if (!actor || actor.role !== "owner") throw new Error("غير مصرح");
  const target = await getMembership(staffAccountId); if (!target || target.companyId !== actor.companyId) throw new Error("الموظف غير موجود في الشركة");
  await db.update(companyMembers).set({ role, updatedAt: new Date() }).where(eq(companyMembers.staffAccountId, staffAccountId));
  await db.update(staffAccounts).set({ role: role === "employee" ? "employee" : role === "supervisor" ? "supervisor" : "manager", updatedAt: new Date() }).where(eq(staffAccounts.id, staffAccountId));
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
  const m = await getCompanyForStaff(staffAccountId); if (!m || !["owner","hr","accountant","manager","supervisor"].includes(m.role)) throw new Error("غير مصرح");
  const members = await db.select().from(companyMembers).where(eq(companyMembers.companyId,m.companyId));
  const ids = new Set(members.map(x=>x.staffAccountId));
  const staff = await db.select().from(staffAccounts).where(eq(staffAccounts.active,true));
  const attendance = await db.select().from(attendanceRecords);
  const approvedOvertime = await db.select().from(staffRequests).where(and(eq(staffRequests.type,"أوفر تايم"),eq(staffRequests.status,"مقبول")));
  const result=[];
  let skippedApproved=0;
  for(const s of staff.filter(x=>ids.has(x.id))) {
    const existing=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.staffAccountId,s.id),eq(payrollRecords.month,month))).limit(1))[0];
    if(existing && existing.status==="approved") { result.push(existing); skippedApproved++; continue; }
    const records=attendance.filter(x=>x.staffAccountId===s.id && x.date.startsWith(month));
    const absences=records.filter(x=>x.status==="غياب").length;
    const lateMinutes=records.reduce((a,x)=>a+x.lateMinutes,0);
    const lateDeduction=Math.round((s.baseSalary/PAYROLL_RULES.calendarDays/PAYROLL_RULES.dailyHours/60)*lateMinutes);
    const absenceDeduction=Math.round((s.baseSalary/PAYROLL_RULES.calendarDays)*PAYROLL_RULES.absencePenaltyDays*absences);
    const overtimeHours=approvedOvertime.filter(r=>r.staffAccountId===s.id && r.fromDate.startsWith(month)).reduce((sum,r)=>sum+Number(r.hours??0),0);
    const overtimeRate=s.baseSalary/PAYROLL_RULES.calendarDays/PAYROLL_RULES.dailyHours;
    const overtimeValue=Math.round(overtimeHours*overtimeRate);
    const adjustments=await db.select().from(salaryAdjustments).where(and(eq(salaryAdjustments.staffAccountId,s.id),eq(salaryAdjustments.month,month)));
    const bonuses=adjustments.filter(a=>a.type==="bonus"||a.type==="incentive").reduce((sum,a)=>sum+a.amount,0);
    const extraDeductions=adjustments.filter(a=>a.type==="penalty"||a.type==="deduction").reduce((sum,a)=>sum+a.amount,0);
    const activeAdvances=await db.select().from(salaryAdvances).where(and(eq(salaryAdvances.staffAccountId,s.id),eq(salaryAdvances.status,"active")));
    const advanceInstallment=activeAdvances.filter(a=>a.startMonth<=month && a.remainingAmount>0).reduce((sum,a)=>sum+Math.min(a.installmentAmount,a.remainingAmount),0);
    const gross=s.baseSalary+overtimeValue+bonuses;
    const egypt = calculateEgyptPayroll({ monthlyGross: gross, employeeSocialInsurance: 0, monthlyOtherDeductions: 0 });
    const net=Math.max(0, egypt.net-absenceDeduction-lateDeduction-extraDeductions-advanceInstallment);
    const values={companyId:m.companyId,staffAccountId:s.id,month,baseSalary:s.baseSalary,allowances:0,bonuses,overtime:overtimeValue,absenceDeduction,lateDeduction,otherDeductions:extraDeductions,advances:advanceInstallment,employeeSocialInsurance:egypt.employeeSocialInsurance,employeeIncomeTax:egypt.employeeIncomeTax,grossSalary:gross,netSalary:net,status:"draft"};
    if(existing) await db.update(payrollRecords).set({...values,updatedAt:new Date()}).where(eq(payrollRecords.id,existing.id));
    else await db.insert(payrollRecords).values(values);
    result.push(values);
  }
  await writeAudit(staffAccountId,m.companyId,"payroll.generated","payroll",month,{count:result.length,skippedApproved});
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function approvePayroll(staffAccountId:number, id:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m || !["owner","hr","accountant"].includes(m.role)) throw new Error("غير مصرح");
  const current=(await db.select().from(payrollRecords).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId))).limit(1))[0];
  if(!current) throw new Error("مسير الرواتب غير موجود.");
  if(current.status==="approved") return current;
  await db.update(payrollRecords).set({status:"approved",approvedAt:new Date(),updatedAt:new Date()}).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,m.companyId)));
  const advances=await db.select().from(salaryAdvances).where(and(eq(salaryAdvances.staffAccountId,current.staffAccountId),eq(salaryAdvances.companyId,m.companyId),eq(salaryAdvances.status,"active")));
  for(const advance of advances){ if(advance.startMonth<=current.month && advance.remainingAmount>0){ const paid=Math.min(advance.installmentAmount,advance.remainingAmount); const remaining=advance.remainingAmount-paid; await db.update(salaryAdvances).set({remainingAmount:remaining,status:remaining===0?"completed":"active",updatedAt:new Date()}).where(eq(salaryAdvances.id,advance.id)); } }
  const row=(await db.select().from(payrollRecords).where(eq(payrollRecords.id,id)).limit(1))[0];
  if(row){ await createNotification(row.staffAccountId,"payroll","تم اعتماد راتبك",`تم اعتماد راتب شهر ${row.month} بقيمة ${row.netSalary.toLocaleString()} جنيه.`); await writeAudit(staffAccountId,m.companyId,"payroll.approved","payroll",String(id),{month:row.month,netSalary:row.netSalary}); }
  return row;
}

export async function getPayroll(staffAccountId:number, month:string) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  return db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.month,month))).orderBy(desc(payrollRecords.netSalary));
}

export async function assertPayrollEditable(staffAccountId:number, month:string) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(staffAccountId); if(!m) throw new Error("Company not found");
  const approved=(await db.select({id:payrollRecords.id}).from(payrollRecords).where(and(
    eq(payrollRecords.companyId,m.companyId),
    eq(payrollRecords.month,month),
    eq(payrollRecords.status,"approved")
  )).limit(1))[0];
  if(approved) throw new Error("مسير هذا الشهر تم اعتماده ولا يمكن تعديل الحضور بعد الإغلاق.");
  return true;
}

export async function syncCompanyMemberRole(actorId:number,targetId:number,role:"manager"|"supervisor"|"employee") {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const actor=await getCompanyForStaff(actorId);
  if(!actor || actor.role!=="owner") throw new Error("غير مصرح");
  const target=await assertStaffInCompany(actorId,targetId);
  const companyRole=role==="manager"?"owner":role;
  await db.update(companyMembers).set({role:companyRole,updatedAt:new Date()}).where(and(
    eq(companyMembers.id,target.target.id),
    eq(companyMembers.companyId,actor.companyId)
  ));
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

export async function consumeLeaveBalance(staffAccountId:number, fromDate:string, toDate:string, kind:"annual"|"sick") {
  const db=await getDb(); if(!db) return;
  const days=Math.max(1,Math.floor((new Date(toDate).getTime()-new Date(fromDate).getTime())/86400000)+1);
  const year=Number(fromDate.slice(0,4));
  const balance=await ensureLeaveBalance(staffAccountId,year);
  if(!balance) return;
  if(kind==="annual"){
    if(balance.annualDays-balance.annualUsed < days) throw new Error("رصيد الإجازات السنوية غير كافٍ.");
    await db.update(leaveBalances).set({annualUsed:balance.annualUsed+days,updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
  } else {
    if(balance.sickDays-balance.sickUsed < days) throw new Error("رصيد الإجازات المرضية غير كافٍ.");
    await db.update(leaveBalances).set({sickUsed:balance.sickUsed+days,updatedAt:new Date()}).where(eq(leaveBalances.id,balance.id));
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
  const rows=await db.select().from(staffRequests).orderBy(desc(staffRequests.createdAt));
  return rows.filter(r=>ids.includes(r.staffAccountId));
}

export async function listAuditLogs(staffAccountId:number, limit=100) {
  const db=await getDb(); if(!db) return [];
  const m=await getCompanyForStaff(staffAccountId); if(!m) return [];
  return db.select().from(auditLogs).where(eq(auditLogs.companyId,m.companyId)).orderBy(desc(auditLogs.createdAt)).limit(Math.min(Math.max(limit,1),250));
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
export async function createSalaryAdjustment(actorId:number,input:{staffAccountId:number;month:string;type:"bonus"|"incentive"|"penalty"|"deduction";title:string;amount:number;note?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || m.role!=="owner") throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  const result=await db.insert(salaryAdjustments).values({...input,companyId:m.companyId,createdBy:actorId});
  await writeAudit(actorId,m.companyId,"salary_adjustment.created","salary_adjustment",String(result[0].insertId),input);
  await createNotification(input.staffAccountId,"payroll","إضافة جديدة على راتبك",input.title+": "+input.amount.toLocaleString()+" جنيه.");
  return (await db.select().from(salaryAdjustments).where(eq(salaryAdjustments.id,Number(result[0].insertId))).limit(1))[0];
}
export async function createSalaryAdvance(actorId:number,input:{staffAccountId:number;amount:number;installmentAmount:number;startMonth:string;note?:string}) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || m.role!=="owner") throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  if(input.amount<=0 || input.installmentAmount<=0) throw new Error("قيمة السلفة والقسط يجب أن تكون أكبر من صفر.");
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
  if(!m || m.role!=="owner") throw new Error("غير مصرح");
  await assertStaffInCompany(actorId,input.staffAccountId);
  const result=await db.insert(employeeDocuments).values({...input,companyId:m.companyId,createdBy:actorId,status:"active"});
  await writeAudit(actorId,m.companyId,"employee_document.created","employee_document",String(result[0].insertId),input);
  return (await db.select().from(employeeDocuments).where(eq(employeeDocuments.id,Number(result[0].insertId))).limit(1))[0];
}

export async function deleteEmployeeDocument(actorId:number,documentId:number) {
  const db=await getDb(); if(!db) throw new Error("Database not available");
  const m=await getCompanyForStaff(actorId); if(!m || m.role!=="owner") throw new Error("غير مصرح");
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
  const [attendance,requests,adjustments,advances,documents]=await Promise.all([
    db.select().from(attendanceRecords).where(eq(attendanceRecords.staffAccountId,targetId)).orderBy(desc(attendanceRecords.date)),
    db.select().from(staffRequests).where(eq(staffRequests.staffAccountId,targetId)).orderBy(desc(staffRequests.createdAt)),
    db.select().from(salaryAdjustments).where(eq(salaryAdjustments.staffAccountId,targetId)).orderBy(desc(salaryAdjustments.createdAt)),
    db.select().from(salaryAdvances).where(eq(salaryAdvances.staffAccountId,targetId)).orderBy(desc(salaryAdvances.createdAt)),
    db.select().from(employeeDocuments).where(eq(employeeDocuments.staffAccountId,targetId)).orderBy(desc(employeeDocuments.createdAt)),
  ]);
  const m=await getCompanyForStaff(actorId);
  const payroll=m ? await db.select().from(payrollRecords).where(and(eq(payrollRecords.companyId,m.companyId),eq(payrollRecords.staffAccountId,targetId))).orderBy(desc(payrollRecords.month)) : [];
  return {staff,attendance,requests,adjustments,advances,documents,payroll};
}
