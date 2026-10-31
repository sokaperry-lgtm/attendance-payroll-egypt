import { isCalendarDate } from './payroll';

/** Accept Arabic/Persian digits and the familiar day/month/year order. */
export function latinDigits(value:string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const code=digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code-0x06f0 : code-0x0660);
  });
}
export function normalizeCalendarDate(value:string) {
  const clean=latinDigits(value).replace(/[\u200e\u200f\u061c]/g,'').trim();
  const parts=clean.split(/\s*[-/.]\s*/);
  if(parts.length!==3) return clean;
  const [year,month,day]=parts[0].length===4 ? parts : [parts[2],parts[1],parts[0]];
  if(!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return clean;
  return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
}
export function validDateInput(value:string) {
  return isCalendarDate(normalizeCalendarDate(value));
}
