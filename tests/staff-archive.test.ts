import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MySqlDialect} from "drizzle-orm/mysql-core";
import {type SQL} from "drizzle-orm";
import * as dbQueries from "../server/db";
import { archiveStaffAccount } from "../server/staff-archive";
import {staffAccounts,staffSessions,companyMembers,attendanceRecords,auditLogs} from "../drizzle/schema";
import {calculateAttendanceAccrual,employeePayrollCutoff,includeEmployeeInPayroll} from "../lib/payroll";

function database(options:{owner?:boolean;missingMember?:boolean;failAudit?:boolean;laterAbsence?:boolean}={}) {
  let state={staff:{id:20,name:"Former Employee",active:true,employmentEndedOn:null as string|null},sessions:[{staffAccountId:20}],attendance:[{date:"2026-10-10",checkIn:"08:00" as string|null,status:"حاضر"},...(options.laterAbsence?[{date:"2026-10-25",checkIn:null,status:"غياب"}]:[])],payroll:[{month:"2026-10",netSalary:1200,status:"draft"}],advances:[{remainingAmount:500}],requests:[{status:"مقبول"}],schedules:[{scheduleDate:"2026-10-29"}],audit:[] as unknown[]};
  const dialect=new MySqlDialect();
  const deletes:unknown[]=[];
  const database={transaction:async(work:(tx:unknown)=>Promise<unknown>)=>{
    const draft=structuredClone(state);
    const tx={select:()=>({from:(table:unknown)=>({where:(condition:SQL)=>{
      const rows=()=>{
        if(table===companyMembers) return options.missingMember?[]:[{staffAccountId:20,companyId:1,role:options.owner?"owner":"employee"}];
        if(table===staffAccounts) return [draft.staff];
        const date=String(dialect.sqlToQuery(condition).params.find(p=>typeof p==="string" && /^\d{4}-\d{2}-\d{2}$/.test(p)));
        return draft.attendance.filter(row=>row.date>date && (row.checkIn!==null || row.status==="مأمورية"));
      };
      const q:any={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(rows()).then(resolve),limit:()=>q,for:async()=>rows()};return q;
    }})}),update:(table:unknown)=>({set:(values:object)=>({where:async()=>{
      if(table!==staffAccounts) throw new Error("Historical data must not be updated");Object.assign(draft.staff,values);
    }})}),delete:(table:unknown)=>({where:async()=>{
      deletes.push(table);if(table!==staffSessions) throw new Error("Historical data must not be deleted");draft.sessions=[];
    }}),insert:(table:unknown)=>({values:async(value:unknown)=>{
      if(table!==auditLogs || options.failAudit) throw new Error("audit failed");draft.audit.push(value);
    }})};
    const result=await work(tx);state=draft;return result;
  }};
  vi.spyOn(dbQueries,"getDb").mockResolvedValue(database as unknown as NonNullable<Awaited<ReturnType<typeof dbQueries.getDb>>>);
  return {state:()=>state,deletes};
}
beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));});
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
describe("employment archiving",()=>{
  it("revokes access and retains all financial and attendance history",async()=>{
    const d=database();const before=structuredClone(d.state());
    await archiveStaffAccount(20,1,1,"2026-10-20");
    expect(d.state().staff).toMatchObject({active:false,employmentEndedOn:"2026-10-20"});
    expect(d.state().sessions).toEqual([]);
    for(const field of ["attendance","payroll","advances","requests","schedules"] as const) expect(d.state()[field]).toEqual(before[field]);
    expect(d.deletes).toEqual([staffSessions]);
    await archiveStaffAccount(20,1,1,"2026-10-21");
    expect(d.state().audit).toHaveLength(1);
    expect(d.state().staff.employmentEndedOn).toBe("2026-10-20");
  });
  it("rolls back archival and session revocation if the audit fails",async()=>{
    const d=database({failAudit:true});
    await expect(archiveStaffAccount(20,1,1,"2026-10-20")).rejects.toThrow("audit failed");
    expect(d.state().staff.active).toBe(true);expect(d.state().sessions).toHaveLength(1);
  });
  it.each([{owner:true},{missingMember:true}])("protects owners and other companies (%j)",async options=>{
    const d=database(options);
    await expect(archiveStaffAccount(20,1,1,"2026-10-20")).rejects.toThrow("لا يمكن أرشفة");
    expect(d.state().staff.active).toBe(true);
  });
  it.each(["2026-02-30","2026-11-01"])("rejects invalid/future end dates (%s)",async date=>{
    const d=database();await expect(archiveStaffAccount(20,1,1,date)).rejects.toThrow("تاريخ");expect(d.state().staff.active).toBe(true);
  });
  it("does not silently exclude existing attendance after the chosen end date",async()=>{
    const d=database();await expect(archiveStaffAccount(20,1,1,"2026-10-09")).rejects.toThrow("توجد سجلات حضور");expect(d.state().staff.active).toBe(true);
  });
  it("allows an earlier leaving date when later records are unworked absences, retaining those records",async()=>{
    const d=database({laterAbsence:true});
    await archiveStaffAccount(20,1,1,"2026-10-20");
    expect(d.state().staff.active).toBe(false);
    expect(d.state().attendance).toHaveLength(2);
  });
  it("includes leaving-month payroll and ignores future paid rest after leaving",()=>{
    const employee={active:false,employmentEndedOn:"2026-10-20"};
    expect(includeEmployeeInPayroll(employee,"2026-10")).toBe(true);
    expect(includeEmployeeInPayroll(employee,"2026-11",true)).toBe(false);
    const cutoff=employeePayrollCutoff(employee,"2026-10-31");
    expect(calculateAttendanceAccrual(9000,"2026-10",[{date:"2026-10-20",checkIn:"08:00",status:"حاضر"}],["2026-10-21"],cutoff).earnedBaseSalary).toBe(300);
  });
});
