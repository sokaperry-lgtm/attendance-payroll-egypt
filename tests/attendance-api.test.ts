import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../server/routers";
import * as db from "../server/db";
import * as enterprise from "../server/enterprise";
import type { TrpcContext } from "../server/_core/context";
import { todayKey } from "../lib/payroll";

function context(): TrpcContext {
  return { user:null, staffUser:{id:10,name:"Employee",phone:"01000000000",passwordHash:"test",title:null,department:null,role:"employee",baseSalary:9000,shiftStart:"08:00",shiftEnd:"17:00",active:true,createdAt:new Date(),updatedAt:new Date()},
    req:{headers:{}} as TrpcContext["req"],res:{} as TrpcContext["res"] };
}
function membership(role="employee") {
  return {id:1,staffAccountId:10,companyId:1,branchId:1,role,active:true,createdAt:new Date(),updatedAt:new Date()};
}
const input = (time="08:30") => ({date:todayKey(),time,status:"حاضر",lateMinutes:0,latitude:30,longitude:31});
const record = (date:string, checkOut:string|null=null) => ({id:1,staffAccountId:10,date,checkIn:"16:00",checkOut,status:"حاضر",lateMinutes:0,distanceMeters:0,note:null,createdAt:new Date(),updatedAt:new Date()});

describe("attendance API regression checks", () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake:["Date"]});
    vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
    vi.spyOn(enterprise,"getMembership").mockResolvedValue(membership());
    vi.spyOn(enterprise,"assertPayrollEditable").mockResolvedValue(true);
    vi.spyOn(enterprise,"getBranchForStaff").mockResolvedValue({id:1,companyId:1,name:"Branch",address:"Cairo",latitude:"30",longitude:"31",radiusMeters:200,active:true,createdAt:new Date(),updatedAt:new Date()});
    vi.spyOn(db,"listAttendance").mockResolvedValue([]);
    vi.spyOn(db,"listSchedules").mockResolvedValue([]);
    vi.spyOn(db,"upsertAttendance").mockImplementation(async value => ({...record(value.date),...value}));
    vi.spyOn(db,"listRequests").mockResolvedValue([]);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each([14,15,29,30,59,60])("stores %i late minutes without subtracting a grace allowance", async minutes => {
    const time = `${String(8+Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
    vi.setSystemTime(new Date(`2026-10-30T${time}:00+02:00`));
    await appRouter.createCaller(context()).attendance.checkIn(input("00:00"));
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({lateMinutes:minutes,status:"متأخر"}));
  });
  it("rejects a second attendance while an older shift is open", async () => {
    vi.mocked(db.listAttendance).mockResolvedValue([record("2026-10-29")]);
    await expect(appRouter.createCaller(context()).attendance.checkIn(input())).rejects.toThrow("شيفت سابق مفتوح");
    expect(db.upsertAttendance).not.toHaveBeenCalled();
  });
  it("allows a new shift after the previous shift was closed", async () => {
    vi.mocked(db.listAttendance).mockResolvedValue([record("2026-10-29","01:00")]);
    await expect(appRouter.createCaller(context()).attendance.checkIn(input())).resolves.toBeTruthy();
  });
  it("closes the original overnight record after midnight", async () => {
    vi.setSystemTime(new Date("2026-10-30T01:00:00+02:00"));
    const ctx=context(); ctx.staffUser!.shiftStart="16:00";ctx.staffUser!.shiftEnd="01:00";
    vi.mocked(db.listAttendance).mockResolvedValue([record("2026-10-29")]);
    await appRouter.createCaller(ctx).attendance.checkOut({date:todayKey(),time:"01:00",latitude:30,longitude:31});
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({date:"2026-10-29",checkOut:"01:00"}));
  });
  it("rejects attendance outside the branch GPS radius", async () => {
    await expect(appRouter.createCaller(context()).attendance.checkIn({...input(),latitude:0})).rejects.toThrow("خارج نطاق");
    expect(db.upsertAttendance).not.toHaveBeenCalled();
  });
  it("allows work on scheduled rest without lateness penalties", async () => {
    vi.mocked(db.listSchedules).mockResolvedValue([{id:1,staffAccountId:10,scheduleDate:todayKey(),shiftTemplateId:1,note:null,createdAt:new Date(),updatedAt:new Date(),shift:{id:1,name:"Rest",kind:"weekly_off",startTime:"00:00",endTime:"00:00",crossesMidnight:false,active:true}}]);
    await appRouter.createCaller(context()).attendance.checkIn(input());
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({status:"حاضر",lateMinutes:0,note:"عمل في يوم الراحة الأسبوعية"}));
  });
  it("ignores a forged device date/time and stores the Cairo server clock", async () => {
    vi.setSystemTime(new Date("2026-10-30T06:15:00Z"));
    await appRouter.createCaller(context()).attendance.checkIn({...input("00:01"),date:"2026-09-01"});
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({date:"2026-10-30",checkIn:"08:15",lateMinutes:15}));
  });
  it("ignores a forged checkout time", async () => {
    vi.setSystemTime(new Date("2026-10-30T15:00:00Z"));
    vi.mocked(db.listAttendance).mockResolvedValue([{...record("2026-10-30"),checkIn:"08:00"}]);
    await appRouter.createCaller(context()).attendance.checkOut({date:"2026-09-01",time:"23:59",latitude:30,longitude:31});
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({date:"2026-10-30",checkOut:"17:00"}));
  });
  it("closes a rest-day shift without treating its midnight template as overtime", async () => {
    vi.setSystemTime(new Date("2026-10-30T17:00:00+02:00"));
    vi.mocked(db.listAttendance).mockResolvedValue([{...record("2026-10-30"),checkIn:"08:00"}]);
    vi.mocked(db.listSchedules).mockResolvedValue([{id:1,staffAccountId:10,scheduleDate:todayKey(),shiftTemplateId:1,note:null,createdAt:new Date(),updatedAt:new Date(),shift:{id:1,name:"Rest",kind:"weekly_off",startTime:"00:00",endTime:"00:00",crossesMidnight:false,active:true}}]);
    const create=vi.spyOn(db,"createRequest");
    await appRouter.createCaller(context()).attendance.checkOut({date:todayKey(),time:"23:59",latitude:30,longitude:31});
    expect(create).not.toHaveBeenCalled();
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({checkOut:"17:00"}));
  });
  it("uses the original payroll month when an overnight shift crosses month end", async () => {
    vi.setSystemTime(new Date("2026-10-01T01:00:00+03:00"));
    const ctx=context(); ctx.staffUser!.shiftStart="16:00";ctx.staffUser!.shiftEnd="01:00";
    vi.mocked(db.listAttendance).mockResolvedValue([record("2026-09-30")]);
    await appRouter.createCaller(ctx).attendance.checkOut({date:"2026-09-30",time:"23:59",latitude:30,longitude:31});
    expect(enterprise.assertPayrollEditable).toHaveBeenCalledTimes(1);
    expect(enterprise.assertPayrollEditable).toHaveBeenCalledWith(10,"2026-09");
    expect(db.upsertAttendance).toHaveBeenCalledWith(expect.objectContaining({date:"2026-09-30",checkOut:"01:00"}));
  });
  it("does not let an employee delete staff or generate payroll", async () => {
    const caller=appRouter.createCaller(context());
    await expect(caller.staff.delete({id:20})).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(caller.payroll.generate({month:"2026-10"})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
  it("does not grant payroll management to a supervisor", async () => {
    vi.mocked(enterprise.getMembership).mockResolvedValue(membership("supervisor"));
    await expect(appRouter.createCaller(context()).payroll.generate({month:"2026-10"})).rejects.toMatchObject({code:"FORBIDDEN"});
  });
});
