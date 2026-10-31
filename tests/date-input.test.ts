import {expect,it} from 'vitest';
import {latinDigits,normalizeCalendarDate,validDateInput} from '../lib/date-input';
it.each([
 ['٣١/١٠/٢٠٢٦','2026-10-31'],
 ['۳۱/۱۰/۲۰۲۶','2026-10-31'],
 ['2026-1-9','2026-01-09'],
 ['٩-١-٢٠٢٦','2026-01-09'],
 [' 31 . 10 . 2026 ','2026-10-31'],
 ['\u200f٣١/\u200f١٠/٢٠٢٦','2026-10-31'],
 ['2026-10-31','2026-10-31'],
])('normalizes %s without swapping the day and month',(input,expected)=>{
 expect(normalizeCalendarDate(input)).toBe(expected);
 expect(validDateInput(input)).toBe(true);
});
it.each(['٣١/٠٢/٢٠٢٦','2026--10','2026-13-01','--','31/10/26','2026-1-'])('rejects incomplete or impossible date %s',input=>{
 expect(validDateInput(input)).toBe(false);
});
it('converts Arabic and Persian digits while preserving field positions',()=>{
 expect(latinDigits('٢٠۲٦-۱٠-٣۱')).toBe('2026-10-31');
});
