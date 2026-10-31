import {afterEach,expect,it,vi} from "vitest";
import {MySqlDialect} from "drizzle-orm/mysql-core";
import {type SQL} from "drizzle-orm";
import * as dbQueries from "../server/db";
import {generatePayroll,getPayroll} from "../server/enterprise";
import {staffAccounts,companyMembers,attendanceRecords,weeklySchedules,shiftTemplates,staffRequests,payrollRecords,leaveBalances} from "../drizzle/schema";

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it.each([generatePayroll,getPayroll])("retains the archived employee leaving-month pay through generation and payroll listing (%s)",async(loadPayroll)=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
  const payroll:Record<string,unknown>[]=[];
  const data=new Map<unknown,any[]>([
    [companyMembers,[{companyId:1,staffAccountId:1,role:"owner",active:true},{companyId:1,staffAccountId:20,role:"employee",active:false}]],
    [staffAccounts,[{id:20,active:false,employmentEndedOn:"2026-10-20",baseSalary:9000,shiftStart:"08:00",shiftEnd:"17:00"}]],
    [attendanceRecords,[{staffAccountId:20,date:"2026-10-01",checkIn:"08:00",status:"حاضر",lateMinutes:0}]],
    [weeklySchedules,[{staffAccountId:20,scheduleDate:"2026-10-10",shiftTemplateId:1},{staffAccountId:20,scheduleDate:"2026-10-29",shiftTemplateId:1}]],
    [shiftTemplates,[{id:1,active:true,kind:"weekly_off"}]],
    [staffRequests,[{staffAccountId:20,type:"إجازة",status:"مقبول",fromDate:"2026-10-05",toDate:"2026-10-05"}]],
    [payrollRecords,payroll],
    [leaveBalances,[{staffAccountId:20,companyId:1,year:2026}]],
  ]);
  const dialect=new MySqlDialect();
  const database={select:()=>({from:(table:unknown)=>{
    let rows=data.get(table)??[];
    const q:any={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(rows).then(resolve),limit:()=>q,orderBy:()=>q,where:(condition:SQL)=>{
      const {sql,params}=dialect.sqlToQuery(condition);
      if(table===companyMembers && sql.includes('`staffAccountId`')) rows=rows.filter(r=>r.staffAccountId===params[0]);
      if(table===staffAccounts && sql.includes('`active`')) rows=rows.filter(r=>r.active);
      if(table===staffRequests && sql.includes('`type`')) rows=[]; // No overtime or permissions.
      return q;
    }};return q;
  }}),insert:(table:unknown)=>({values:(values:Record<string,unknown>)=>({onDuplicateKeyUpdate:async()=>{if(table===payrollRecords)payroll.push(values);}})})};
  vi.spyOn(dbQueries,"getDb").mockResolvedValue(database as unknown as NonNullable<Awaited<ReturnType<typeof dbQueries.getDb>>>);
  const rows=await loadPayroll(1,"2026-10");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({staffAccountId:20,baseSalary:900,status:"draft"});
});
