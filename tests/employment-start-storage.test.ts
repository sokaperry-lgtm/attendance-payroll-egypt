import {afterEach,expect,it,vi} from 'vitest';
import * as queries from '../server/db';
import {staffAccounts,attendanceRecords,payrollRecords} from '../drizzle/schema';
const state=vi.hoisted(()=>({current:{} as any}));
vi.mock('drizzle-orm/mysql2',()=>({drizzle:()=>new Proxy({}, {get:(_target,key)=>state.current[key]})}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
function database(attendance:any[]=[],payroll:any[]=[]) {
 const staff={id:20,employmentStartedOn:null,employmentEndedOn:null};
 const updates:any[]=[];
 const db={select:()=>({from:(table:unknown)=>{
  const rows=table===staffAccounts?[staff]:table===attendanceRecords?attendance:table===payrollRecords?payroll:[];
  const q:any={where:()=>q,limit:()=>q,then:(resolve:any)=>Promise.resolve(rows).then(resolve)};return q;
 }}),update:()=>({set:(values:any)=>({where:async()=>{updates.push(values);Object.assign(staff,values);}})}),
 insert:()=>({values:async(values:any)=>{Object.assign(staff,values);return [{insertId:20}];}})};
 state.current=db;
 vi.stubEnv('DATABASE_URL','mysql://unused-test-connection');
 return {staff,updates};
}
it('persists a selected start date on creation',async()=>{
 const {staff}=database();
 await queries.createStaffAccount({phone:'01000000000',password:'test1234',name:'Test',role:'employee',employmentStartedOn:'2026-10-10'});
 expect(staff.employmentStartedOn).toBe('2026-10-10');
});
it('allows correcting a start date with only stale absence records',async()=>{
 const {staff}=database([{date:'2026-10-01',status:'غياب',checkIn:null,checkOut:null}]);
 await queries.updateStaffAccount(20,{employmentStartedOn:'2026-10-10'});
 expect(staff.employmentStartedOn).toBe('2026-10-10');
});
it('rejects moving the start after an actual attendance record',async()=>{
 const {staff}=database([{date:'2026-10-01',status:'حاضر',checkIn:'08:00'}]);
 await expect(queries.updateStaffAccount(20,{employmentStartedOn:'2026-10-10'})).rejects.toThrow('حضور فعلي');
 expect(staff.employmentStartedOn).toBe(null);
});
it('preserves an approved payroll affected by changing the start date',async()=>{
 const {staff}=database([],[{month:'2026-10',status:'approved'}]);
 await expect(queries.updateStaffAccount(20,{employmentStartedOn:'2026-10-10'})).rejects.toThrow('مسير معتمد');
 expect(staff.employmentStartedOn).toBe(null);
});
