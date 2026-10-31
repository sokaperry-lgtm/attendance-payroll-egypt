import { and, eq } from "drizzle-orm";
import { payrollRecords, salaryAdvances, auditLogs, notifications } from "../drizzle/schema";
import type { getDb } from "./db";

/** Monetary state, allocation audit and notification commit or roll back together. */
export async function commitPayrollApproval(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, staffAccountId:number, companyId:number, id:number) {
  return db.transaction(async tx => {
    // Serialize repeated approvals and reopening on the same payroll record.
    const row=(await tx.select().from(payrollRecords).where(and(eq(payrollRecords.id,id),eq(payrollRecords.companyId,companyId))).limit(1).for("update"))[0];
    if(!row) throw new Error("مسير الرواتب غير موجود.");
    if(row.status === "approved") return row;
    if(row.status !== "draft") throw new Error("هذا المسير مغلق ولا يمكن اعتماده مجددًا.");
    const advances=await tx.select().from(salaryAdvances).where(and(
      eq(salaryAdvances.staffAccountId,row.staffAccountId),eq(salaryAdvances.companyId,companyId),eq(salaryAdvances.status,"active")
    )).orderBy(salaryAdvances.id).for("update");
    const allocations=advances.filter(a=>a.startMonth<=row.month && a.remainingAmount>0)
      .map(a=>({id:a.id,amount:Math.min(a.installmentAmount,a.remainingAmount)}));
    if(allocations.reduce((sum,a)=>sum+a.amount,0) !== Number(row.advances)) {
      throw new Error("تغيرت أرصدة السلف أثناء الاعتماد. أعد توليد المسير ثم حاول مجددًا.");
    }
    for(const allocation of allocations) {
      const advance=advances.find(a=>a.id===allocation.id)!;
      const remaining=advance.remainingAmount-allocation.amount;
      await tx.update(salaryAdvances).set({remainingAmount:remaining,status:remaining===0?"completed":"active",updatedAt:new Date()}).where(eq(salaryAdvances.id,advance.id));
    }
    const approved={...row,status:"approved",approvedAt:new Date(),updatedAt:new Date()};
    await tx.update(payrollRecords).set({status:approved.status,approvedAt:approved.approvedAt,updatedAt:approved.updatedAt}).where(eq(payrollRecords.id,id));
    await tx.insert(auditLogs).values({staffAccountId,companyId,action:"payroll.approved",entity:"payroll",entityId:String(id),metadata:JSON.stringify({month:row.month,netSalary:row.netSalary,advanceAllocations:allocations})});
    await tx.insert(notifications).values({staffAccountId:row.staffAccountId,type:"payroll",title:"تم اعتماد راتبك",body:`تم اعتماد راتب شهر ${row.month} بقيمة ${row.netSalary.toLocaleString()} جنيه.`});
    return approved;
  });
}
