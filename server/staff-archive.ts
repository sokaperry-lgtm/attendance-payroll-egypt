import { and, eq, gt, or, isNotNull } from "drizzle-orm";
import { getDb } from "./db";
import { todayKey } from "../lib/payroll";
import { companyMembers, staffAccounts, attendanceRecords, staffSessions, auditLogs } from "../drizzle/schema";

/** Archive employment while retaining all attendance, payroll, requests and balances. */
export async function archiveStaffAccount(id:number, actorId:number, companyId:number, employmentEndedOn=todayKey()) {
  const parsed = new Date(`${employmentEndedOn}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(employmentEndedOn) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==employmentEndedOn || employmentEndedOn>todayKey()) throw new Error("تاريخ آخر يوم عمل غير صحيح أو مستقبلي.");
  const db=await getDb(); if(!db) throw new Error("Database not available");
  return db.transaction(async tx=>{
    const member=(await tx.select().from(companyMembers).where(and(eq(companyMembers.staffAccountId,id),eq(companyMembers.companyId,companyId))).limit(1).for("update"))[0];
    if(!member || member.role==="owner" || id===actorId) throw new Error("لا يمكن أرشفة حساب المالك أو حساب خارج الشركة.");
    const staff=(await tx.select().from(staffAccounts).where(eq(staffAccounts.id,id)).limit(1).for("update"))[0];
    if(!staff) throw new Error("الموظف غير موجود.");
    if(staff.employmentEndedOn) return {id:staff.id,name:staff.name,employmentEndedOn:staff.employmentEndedOn};
    const laterAttendance=(await tx.select().from(attendanceRecords).where(and(eq(attendanceRecords.staffAccountId,id),gt(attendanceRecords.date,employmentEndedOn),or(isNotNull(attendanceRecords.checkIn),isNotNull(attendanceRecords.checkOut),eq(attendanceRecords.status,"مأمورية")))).limit(1))[0];
    if(laterAttendance) throw new Error("توجد سجلات حضور بعد آخر يوم عمل المحدد. راجع التاريخ قبل الأرشفة.");
    await tx.update(staffAccounts).set({active:false,employmentEndedOn,updatedAt:new Date()}).where(eq(staffAccounts.id,id));
    await tx.delete(staffSessions).where(eq(staffSessions.staffAccountId,id));
    await tx.insert(auditLogs).values({staffAccountId:actorId,companyId,action:"staff.archived",entity:"staff",entityId:String(id),metadata:JSON.stringify({name:staff.name,employmentEndedOn})});
    return {id:staff.id,name:staff.name,employmentEndedOn};
  });
}

