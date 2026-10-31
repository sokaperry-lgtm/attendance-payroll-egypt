import {expect,it} from 'vitest';
import {calculateAttendanceAccrual,calculateAttendancePenalties,includeEmployeeInPayroll,isEmploymentDate,isCalendarDate} from '../lib/payroll';
it('only accrues work, rest and paid leave on or after the first working day',()=>{
 const records=[{date:'2026-10-01',status:'غياب'}, {date:'2026-10-09',status:'حاضر',checkIn:'08:00'}, {date:'2026-10-10',status:'حاضر',checkIn:'08:00'}];
 const result=calculateAttendanceAccrual(9000,'2026-10',records,['2026-10-05','2026-10-15'],'2026-10-31',['2026-10-06','2026-10-12'],'2026-10-10');
 expect(result).toMatchObject({earnedBaseSalary:900,workedDays:1,paidRestDays:1,unpaidAbsenceDays:0,restOvertimeValue:0});
 const eligible=records.filter(row=>isEmploymentDate({employmentStartedOn:'2026-10-10'},row.date));
 expect(calculateAttendancePenalties(9000,eligible,result.unpaidAbsenceDays).absenceDeduction).toBe(0);
});
it('excludes months before joining, even if stale absences exist',()=>{
 expect(includeEmployeeInPayroll({active:true,employmentStartedOn:'2026-11-10'},'2026-10',true)).toBe(false);
 expect(includeEmployeeInPayroll({active:true,employmentStartedOn:'2026-11-10'},'2026-11')).toBe(true);
});
it('includes the first and last working dates',()=>{
 const employee={employmentStartedOn:'2026-10-10',employmentEndedOn:'2026-10-20'};
 expect(['2026-10-09','2026-10-10','2026-10-20','2026-10-21'].map(date=>isEmploymentDate(employee,date))).toEqual([false,true,true,false]);
});
it('rejects nonexistent dates and accepts leap days correctly',()=>{
 expect(['2026-02-29','2026-02-30','2026-13-01','10-10-2026',''].map(isCalendarDate)).toEqual([false,false,false,false,false]);
 expect(isCalendarDate('2028-02-29')).toBe(true);
});
