import { latinDigits, normalizeCalendarDate, validDateInput } from './date-input';

export type EmployeeEditForm = {
  name:string; phone:string; title:string; department:string; baseSalary:string;
  shiftStart:string; shiftEnd:string; employmentStartedOn:string; active:boolean;
};
type OriginalEmployee = {
  id:number; name:string; phone?:string|null; title?:string|null; department?:string|null;
  baseSalary?:number|null; shiftStart?:string|null; shiftEnd?:string|null;
  employmentStartedOn?:string|null; active?:boolean;
};
export type EmployeeUpdate = {id:number} & Partial<{
  name:string; phone:string; title:string; department:string; baseSalary:number;
  shiftStart:string; shiftEnd:string; employmentStartedOn:string; active:boolean;
}>;

/** Updating one field must not require or overwrite unrelated legacy data. */
export function employeeUpdateFromForm(original:OriginalEmployee, form:EmployeeEditForm):EmployeeUpdate {
  const update:EmployeeUpdate={id:original.id};
  for(const field of ['name','phone','title','department'] as const) {
    const next=form[field].trim();
    if(next === String(original[field] ?? '').trim()) continue;
    if(field==='name' && next.length<2) throw new Error('اكتب اسم الموظف بحرفين على الأقل.');
    if(field==='phone' && next.length<3) throw new Error('اكتب رقم الهاتف بصورة صحيحة.');
    update[field]=next;
  }
  const salaryText=latinDigits(form.baseSalary).trim();
  if(salaryText !== String(original.baseSalary ?? 0)) {
    const salary=Number(salaryText);
    if(!salaryText || !Number.isSafeInteger(salary) || salary<0) throw new Error('اكتب الراتب الأساسي كرقم صحيح لا يقل عن صفر.');
    update.baseSalary=salary;
  }
  for(const field of ['shiftStart','shiftEnd'] as const) {
    const next=latinDigits(form[field]).trim();
    if(next === String(original[field] ?? '').trim()) continue;
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(next)) throw new Error('اكتب وقت الشيفت بصيغة ساعة:دقيقة، مثل 08:00.');
    update[field]=next;
  }
  const start=form.employmentStartedOn.trim();
  if(start !== String(original.employmentStartedOn ?? '')) {
    if(!validDateInput(start)) throw new Error('اختار تاريخ بدء العمل من التقويم أو اكتب اليوم والشهر والسنة.');
    const canonical=normalizeCalendarDate(start);
    if(canonical !== original.employmentStartedOn) update.employmentStartedOn=canonical;
  }
  if(form.active !== (original.active !== false)) update.active=form.active;
  return update;
}
