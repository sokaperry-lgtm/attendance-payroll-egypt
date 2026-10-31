import {expect,it} from 'vitest';
import {calculateAttendanceAccrual} from '../lib/payroll';
const worked = (count:number) => Array.from({length:count},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,checkIn:'08:00',status:'حاضر'}));
it('settles two untaken rest days after 28 worked days, shown as overtime',()=>{
 const result=calculateAttendanceAccrual(9000,'2026-10',worked(28),['2026-10-29','2026-10-30'],'2026-10-31');
 expect(result.restOvertimeDays).toBe(2);
 expect(result.restOvertimeValue).toBe(600);
 expect(result.earnedBaseSalary).toBe(9600);
});
it('does not pay future rest or compensate missing attendance',()=>{
 expect(calculateAttendanceAccrual(9000,'2026-10',worked(28),[],'2026-10-28').restOvertimeDays).toBe(0);
 expect(calculateAttendanceAccrual(9000,'2026-10',worked(24),['2026-10-29','2026-10-30'],'2026-10-31').restOvertimeDays).toBe(0);
});
it('does not count an explicitly worked rest day twice',()=>{
 const result=calculateAttendanceAccrual(9000,'2026-10',worked(28),['2026-10-01','2026-10-02','2026-10-29','2026-10-30'],'2026-10-31');
 expect(result.restOvertimeDays).toBe(2);
 expect(result.earnedBaseSalary).toBe(9600);
});
it('does not settle a full monthly entitlement at an early employment cutoff',()=>{
 expect(calculateAttendanceAccrual(9000,'2026-10',worked(28),[],'2026-10-20').restOvertimeDays).toBe(0);
});
