import {afterEach,expect,it,vi} from 'vitest';
vi.mock('react-native',()=>({Platform:{OS:'ios'}}));
vi.mock('expo-print',()=>({printAsync:vi.fn().mockResolvedValue(undefined)}));
import * as Print from 'expo-print';
import {buildSelectedReportHtml,exportSelectedReportPdf, type ReportPdfData,type PayrollReportRow} from '../lib/report-pdf';
const report:ReportPdfData={month:'2026-10',employees:[
 {id:1,name:'Ali',title:'Barista',department:'Bar',presentDays:20,absentDays:1,lateMinutes:15,pendingRequests:2,records:[{date:'2026-10-01',status:'حاضر',lateMinutes:0,checkIn:'08:00',checkOut:'17:00'}]},
 {id:2,name:'Mahmoud',title:'Chef',department:'Kitchen',presentDays:18,absentDays:2,lateMinutes:30,pendingRequests:1,records:[]},
]};
const payrollRows:PayrollReportRow[]=[
 {staffAccountId:1,month:'2026-10',status:'draft',baseSalary:9000,overtime:600,allowances:100,bonuses:200,absenceDeduction:300,lateDeduction:75,earlyDeduction:25,otherDeductions:50,advances:100,employeeSocialInsurance:200,employeeIncomeTax:80,grossSalary:9900,netSalary:9070},
 {staffAccountId:2,month:'2026-10',status:'approved',baseSalary:8000,netSalary:8000,grossSalary:8000},
 {staffAccountId:1,month:'2026-09',status:'approved',baseSalary:90999,netSalary:90999,grossSalary:90999},
];
const options={canViewPayroll:true,payrollRows};
const money=(number:number)=>number.toLocaleString('ar-EG',{maximumFractionDigits:2});
afterEach(()=>vi.clearAllMocks());
it('exports payroll columns and actual payroll amounts instead of attendance punches',()=>{
 const html=buildSelectedReportHtml('payroll',report,options);
 expect(html).toContain('<h1>تقرير الرواتب</h1>');
 for(const text of ['الأساسي المستحق','أوفر تايم','خصومات الحضور','سلف','تأمين وضريبة','الصافي','مسودة — غير معتمد','معتمد']) expect(html).toContain(text);
 expect(html).toContain(money(9070));
 expect(html).toContain(money(400)); // Absence + lateness + early checkout.
 expect(html).toContain(money(280)); // Insurance + tax.
 expect(html).not.toContain(money(90999)); // Another month's payroll.
 expect(html).not.toContain('<th>الانصراف</th>');
 expect(html).not.toContain('08:00');
});
it('retains the detailed attendance report for the attendance tab',()=>{
 const html=buildSelectedReportHtml('attendance',report,options);
 expect(html).toContain('<h1>تقرير الحضور والانصراف</h1>');
 expect(html).toContain('<th>الانصراف</th>');
 expect(html).toContain('08:00');
 expect(html).not.toContain('<th>الصافي</th>');
});
it.each(['overview','attendance','payroll','team'] as const)('applies employee and month filters to %s',view=>{
 const html=buildSelectedReportHtml(view,report,{...options,employeeId:1});
 expect(html).toContain('Ali');
 expect(html).not.toContain('Mahmoud');
 expect(html).not.toContain('Kitchen');
 expect(html).not.toContain(money(90999));
 expect(html).toMatch(/2026|٢٠٢٦/);
});
it('exports team ranking and department distribution without salary data',()=>{
 const html=buildSelectedReportHtml('team',report,options);
 expect(html).toContain('<h1>تقرير الفريق</h1>');
 expect(html).toContain('توزيع الفريق حسب القسم');
 expect(html).toContain('Barista');
 expect(html).toContain('Kitchen');
 expect(html).not.toContain('<th>الانصراف</th>');
 expect(html).not.toContain(money(9070));
});
it('exports an overview summary and respects payroll access',()=>{
 expect(buildSelectedReportHtml('overview',report,options)).toContain('ملخص الرواتب');
 const restricted=buildSelectedReportHtml('overview',report,{...options,canViewPayroll:false});
 expect(restricted).toContain('<h1>التقرير العام</h1>');
 expect(restricted).not.toContain('ملخص الرواتب');
 expect(restricted).not.toContain(money(9070));
 expect(()=>buildSelectedReportHtml('payroll',report,{...options,canViewPayroll:false})).toThrow('صلاحية');
});
it('shows an empty payroll report without substituting attendance data',()=>{
 const html=buildSelectedReportHtml('payroll',report,{...options,payrollRows:[]});
 expect(html).toContain('لا توجد مسيرات رواتب');
 expect(html).not.toContain('08:00');
});
it('escapes employee names in printable HTML',()=>{
 const html=buildSelectedReportHtml('payroll',{...report,employees:[{...report.employees[0],name:'<script>alert(1)</script>'}]},options);
 expect(html).toContain('&lt;script&gt;');
 expect(html).not.toContain('<script>');
});
it('sends the selected payroll template to the print service',async()=>{
 await exportSelectedReportPdf('payroll',report,options);
 expect(Print.printAsync).toHaveBeenCalledWith({html:expect.stringContaining('<h1>تقرير الرواتب</h1>')});
});
