import {afterEach,expect,it,vi} from "vitest";
import * as db from "../server/db";
import {syncMonthlyAttendance} from "../server/enterprise";
import {companyMembers,staffAccounts,weeklySchedules,shiftTemplates,staffRequests,attendanceRecords} from "../drizzle/schema";

afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it.each([undefined,"2026-10-03"])("respects scheduled rest and employment start (%s)",async(employmentStartedOn)=>{
  vi.useFakeTimers({toFake:["Date"]});
  vi.setSystemTime(new Date("2026-10-04T20:00:00Z"));
  const data=new Map<unknown,unknown[]>([
    [companyMembers,[{id:1,companyId:1,staffAccountId:10,role:"owner",active:true}]],
    [staffAccounts,[{id:10,employmentStartedOn,active:true,shiftStart:"08:00",shiftEnd:"17:00"}]],
    [weeklySchedules,[{staffAccountId:10,scheduleDate:"2026-10-04",shiftTemplateId:1}]],
    [shiftTemplates,[{id:1,kind:"weekly_off"}]],
    [staffRequests,[]],[attendanceRecords,[]],
  ]);
  const database={select:()=>({from:(table:unknown)=>{
    const rows=data.get(table)??[];
    const result={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(rows).then(resolve),limit:async()=>rows};
    return {...result,where:()=>result};
  }}),insert:()=>({values:async()=>{}})};
  vi.spyOn(db,"getDb").mockResolvedValue(database as unknown as NonNullable<Awaited<ReturnType<typeof db.getDb>>>);
  const upsert=vi.spyOn(db,"upsertAttendance").mockResolvedValue(undefined);
  await syncMonthlyAttendance(10,"2026-10");
  const dates=upsert.mock.calls.map(([row])=>row.date);
  if (employmentStartedOn) { expect(dates).not.toContain("2026-10-01"); expect(dates).not.toContain("2026-10-02"); }
  else expect(dates).toContain("2026-10-02"); // Friday
  expect(dates).toContain("2026-10-03"); // Saturday
  expect(dates).not.toContain("2026-10-04"); // scheduled rest
});
