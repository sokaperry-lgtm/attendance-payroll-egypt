import { afterEach, describe, expect, it, vi } from "vitest";
import { commitPayrollApproval } from "../server/payroll-approval";
import { payrollRecords, salaryAdvances, auditLogs, notifications } from "../drizzle/schema";
import * as dbQueries from "../server/db";
import type { getDb } from "../server/db";
import { unapprovePayroll } from "../server/enterprise";

// Transaction adapter models committed state and serial row locks, not the payroll algorithm.
function database(failAudit = false, installment = 100) {
  let state = {payroll:{id:1,companyId:1,staffAccountId:10,month:"2026-10",status:"draft",advances:100,netSalary:5000},advance:{id:2,remainingAmount:500,installmentAmount:installment,startMonth:"2026-10",status:"active"},audit:[] as unknown[],notifications:[] as unknown[]};
  let queue=Promise.resolve();
  const locks:string[]=[];
  const db = { select:()=>({from:()=>({where:()=>({limit:async()=>[{id:1,companyId:1,staffAccountId:1,role:"owner",active:true}]})})}), transaction: async (work:(tx:unknown)=>Promise<unknown>) => {
    const previous=queue;
    let release!:()=>void;
    queue=new Promise<void>(resolve=>{release=resolve;});
    await previous;
    const draft=structuredClone(state);
    const tx={
      select:()=>({from:(table:unknown)=>({where:()=>{
        const rows=()=>table===payrollRecords ? [draft.payroll] : table===auditLogs ? draft.audit.filter((row:any)=>row.action==="payroll.approved").slice(-1) : [draft.advance];
        const query:any={
          then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(rows()).then(resolve),
          for:(mode:string)=>{locks.push(mode);return Promise.resolve(rows());},
          limit:()=>query,orderBy:()=>query,
        };
        return query;
      }})}),
      update:(table:unknown)=>({set:(values:object)=>({where:async()=>{Object.assign(table===payrollRecords?draft.payroll:draft.advance,values);}})}),
      insert:(table:unknown)=>({values:async(value:unknown)=>{
        if(table===auditLogs && failAudit) throw new Error("audit unavailable");
        (table===notifications?draft.notifications:draft.audit).push(value);
      }}),
    };
    try { const result=await work(tx);state=draft;return result; } finally {release();}
  }};
  return {db:db as unknown as NonNullable<Awaited<ReturnType<typeof getDb>>>,state:()=>state,locks};
}

afterEach(()=>vi.restoreAllMocks());

describe("atomic payroll approval",()=>{
  it("deducts an installment once for concurrent repeated approvals",async()=>{
    const d=database();
    await Promise.all([commitPayrollApproval(d.db,1,1,1),commitPayrollApproval(d.db,1,1,1)]);
    expect(d.state().payroll.status).toBe("approved");
    expect(d.state().advance.remainingAmount).toBe(400);
    expect(d.state().audit).toHaveLength(1);
    expect(d.state().notifications).toHaveLength(1);
    expect(d.locks).toEqual(["update","update","update"]);
  });
  it("rolls payroll and advances back if the audit cannot be written",async()=>{
    const d=database(true);
    await expect(commitPayrollApproval(d.db,1,1,1)).rejects.toThrow("audit unavailable");
    expect(d.state().payroll.status).toBe("draft");
    expect(d.state().advance.remainingAmount).toBe(500);
    expect(d.state().notifications).toHaveLength(0);
  });
  it("rejects changed installments instead of settling amounts different from the payslip",async()=>{
    const d=database(false,200);
    await expect(commitPayrollApproval(d.db,1,1,1)).rejects.toThrow("تغيرت أرصدة السلف");
    expect(d.state().payroll.status).toBe("draft");
    expect(d.state().advance.remainingAmount).toBe(500);
  });
});

it("restores an allocated installment exactly once when reopening is repeated",async()=>{
  const d=database();
  await commitPayrollApproval(d.db,1,1,1);
  vi.spyOn(dbQueries,"getDb").mockResolvedValue(d.db);
  await Promise.all([unapprovePayroll(1,1),unapprovePayroll(1,1)]);
  expect(d.state().payroll.status).toBe("draft");
  expect(d.state().advance.remainingAmount).toBe(500);
  expect(d.state().audit).toHaveLength(2);
});
