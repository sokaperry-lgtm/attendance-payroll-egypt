import {expect,it} from 'vitest';
import {employeeUpdateFromForm, type EmployeeEditForm} from '../lib/employee-edit';
const employee={id:20,name:'Employee',phone:'01000000000',department:null,title:null,baseSalary:9000,shiftStart:'08:00',shiftEnd:'17:00',employmentStartedOn:null,active:true};
const form:EmployeeEditForm={name:'Employee',phone:'01000000000',department:'',title:'',baseSalary:'9000',shiftStart:'08:00',shiftEnd:'17:00',employmentStartedOn:'',active:true};
it('saves only the start date when the legacy department is blank',()=>{
 expect(employeeUpdateFromForm(employee,{...form,employmentStartedOn:'2026-10-01'})).toEqual({id:20,employmentStartedOn:'2026-10-01'});
});
it('normalizes Arabic input before sending the date-only update',()=>{
 expect(employeeUpdateFromForm(employee,{...form,employmentStartedOn:'١/١٠/٢٠٢٦'})).toEqual({id:20,employmentStartedOn:'2026-10-01'});
});
it('does not resend status or salary while backfilling an archived employee date',()=>{
 expect(employeeUpdateFromForm({...employee,active:false},{...form,active:false,employmentStartedOn:'2026-10-01'})).toEqual({id:20,employmentStartedOn:'2026-10-01'});
});
it('returns actionable validation instead of accepting an invalid date',()=>{
 expect(()=>employeeUpdateFromForm(employee,{...form,employmentStartedOn:'2026-02-31'})).toThrow('تاريخ بدء العمل');
});
it('does not require a start date when updating another field on a legacy employee',()=>{
 expect(employeeUpdateFromForm(employee,{...form,department:'Kitchen'})).toEqual({id:20,department:'Kitchen'});
});
it('does not overwrite current server values with unchanged form fields',()=>{
 expect(employeeUpdateFromForm(employee,form)).toEqual({id:20});
});
