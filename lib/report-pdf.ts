import { buildAttendanceReportHtml, printReportHtml, type AttendancePdfEmployee } from './attendance-pdf';

export type ReportView = 'overview'|'attendance'|'payroll'|'team';
export const REPORT_TITLES:Record<ReportView,string> = {
  overview:'التقرير العام',attendance:'تقرير الحضور والانصراف',payroll:'تقرير الرواتب',team:'تقرير الفريق',
};
type ReportEmployee=AttendancePdfEmployee & {id:number;pendingRequests?:number};
export type ReportPdfData={month:string;employees:ReportEmployee[]};
export type PayrollReportRow={
  staffAccountId:number;month:string;status:string;baseSalary?:number;allowances?:number;bonuses?:number;
  overtime?:number;absenceDeduction?:number;lateDeduction?:number;earlyDeduction?:number;otherDeductions?:number;
  advances?:number;employeeSocialInsurance?:number;employeeIncomeTax?:number;grossSalary?:number;netSalary?:number;
};
type Options={employeeId?:number|'all';payrollRows?:PayrollReportRow[];canViewPayroll?:boolean;companyName?:string;branchName?:string};
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
const number=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const money=(value:unknown)=>number(value).toLocaleString('ar-EG',{maximumFractionDigits:2});
const rate=(employee:ReportEmployee)=>employee.presentDays+employee.absentDays ? Math.round(employee.presentDays/(employee.presentDays+employee.absentDays)*100):0;
const attendanceDeductions=(row:PayrollReportRow)=>number(row.absenceDeduction)+number(row.lateDeduction)+number(row.earlyDeduction);
const statutoryDeductions=(row:PayrollReportRow)=>number(row.employeeSocialInsurance)+number(row.employeeIncomeTax);
const deductions=(row:PayrollReportRow)=>attendanceDeductions(row)+number(row.otherDeductions)+statutoryDeductions(row)+number(row.advances);
const sum=(rows:PayrollReportRow[],field:(row:PayrollReportRow)=>number)=>rows.reduce((total,row)=>total+field(row),0);
const card=(label:string,value:unknown)=>`<div class="card"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
const table=(headers:string[],rows:string[][],empty:string)=>`<table><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(cells=>`<tr>${cells.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="empty">${esc(empty)}</td></tr>`}</tbody></table>`;
function payrollStatus(status:string) {
  if(['approved','مقبول','معتمد'].includes(status)) return 'معتمد';
  if(['paid','مدفوع'].includes(status)) return 'مدفوع';
  if(['closed','مغلق','finalized','مقفل'].includes(status)) return 'مغلق';
  return status==='draft'?'مسودة — غير معتمد':status;
}

/** A single dispatcher binds every PDF to the selected report and filters. */
export function buildSelectedReportHtml(view:ReportView,report:ReportPdfData,options:Options={}) {
  if(view==='payroll'&&!options.canViewPayroll) throw new Error('لا تملك صلاحية تصدير بيانات الرواتب.');
  const employees=report.employees.filter(employee=>options.employeeId===undefined||options.employeeId==='all'||employee.id===options.employeeId);
  const rows=(options.payrollRows??[]).filter(row=>row.month===report.month&&(options.employeeId===undefined||options.employeeId==='all'||row.staffAccountId===options.employeeId));
  const summary={staffCount:employees.length,presentDays:employees.reduce((s,e)=>s+e.presentDays,0),absentDays:employees.reduce((s,e)=>s+e.absentDays,0),lateMinutes:employees.reduce((s,e)=>s+e.lateMinutes,0),pendingRequests:employees.reduce((s,e)=>s+number(e.pendingRequests),0)};
  if(view==='attendance') return buildAttendanceReportHtml({...report,employees,summary},options);
  const employeeName=(id:number)=>employees.find(employee=>employee.id===id)?.name??`موظف #${id}`;
  let body='';
  if(view==='payroll') {
    body=`<section class="cards">${card('عدد المسيرات',rows.length)}${card('إجمالي المستحق قبل الخصومات',money(sum(rows,r=>number(r.grossSalary))))}${card('الأوفر تايم',money(sum(rows,r=>number(r.overtime))))}${card('الخصومات والسلف',money(sum(rows,deductions)))}${card('صافي الرواتب',money(sum(rows,r=>number(r.netSalary))))}</section>
      <p class="note">جميع المبالغ بالجنيه المصري. يعرض التقرير مستحقات الفترة كما تظهر في المسير، وحالة اعتماد كل راتب.</p>
      ${table(['الموظف','الأساسي المستحق','بدلات ومكافآت','أوفر تايم','خصومات الحضور','خصومات أخرى','سلف','تأمين وضريبة','الصافي','الحالة'],rows.map(row=>[employeeName(row.staffAccountId),money(row.baseSalary),money(number(row.allowances)+number(row.bonuses)),money(row.overtime),money(attendanceDeductions(row)),money(row.otherDeductions),money(row.advances),money(statutoryDeductions(row)),money(row.netSalary),payrollStatus(row.status)]),'لا توجد مسيرات رواتب لهذا الشهر ضمن الفلتر المحدد.')}`;
  } else if(view==='team') {
    const departments=new Map<string,number>();
    employees.forEach(employee=>{const key=employee.department||'عام';departments.set(key,(departments.get(key)??0)+1);});
    body=`<section class="cards">${card('الموظفون',employees.length)}${card('الأقسام',departments.size)}${card('طلبات معلقة',summary.pendingRequests)}</section>
      <h2>توزيع الفريق حسب القسم</h2>${table(['القسم','عدد الموظفين'],[...departments].map(([department,count])=>[department,String(count)]),'لا توجد أقسام في هذا النطاق.')}
      <h2>أداء الفريق حسب نسبة الحضور</h2>${table(['الترتيب','الموظف','الوظيفة','القسم','الحضور','الغياب','دقائق التأخير','نسبة الحضور'],[...employees].sort((a,b)=>rate(b)-rate(a)).map((employee,index)=>[String(index+1),employee.name,employee.title||'موظف',employee.department||'عام',String(employee.presentDays),String(employee.absentDays),String(employee.lateMinutes),`${rate(employee)}%`]),'لا يوجد موظفون في النطاق المحدد.')}`;
  } else {
    body=`<section class="cards">${card('الموظفون',summary.staffCount)}${card('أيام الحضور',summary.presentDays)}${card('أيام الغياب',summary.absentDays)}${card('دقائق التأخير',summary.lateMinutes)}${card('طلبات معلقة',summary.pendingRequests)}</section>
      <h2>ملخص أداء الموظفين</h2>${table(['الموظف','القسم','الحضور','الغياب','دقائق التأخير','نسبة الحضور'],employees.map(employee=>[employee.name,employee.department||'عام',String(employee.presentDays),String(employee.absentDays),String(employee.lateMinutes),`${rate(employee)}%`]),'لا توجد بيانات خلال هذه الفترة.')}`;
    if(options.canViewPayroll) body+=`<h2>ملخص الرواتب</h2><section class="cards">${card('عدد المسيرات',rows.length)}${card('صافي الرواتب — ج.م',money(sum(rows,r=>number(r.netSalary))))}${card('الأوفر تايم — ج.م',money(sum(rows,r=>number(r.overtime))))}${card('الخصومات والسلف — ج.م',money(sum(rows,deductions)))}</section>`;
  }
  const title=REPORT_TITLES[view];
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)} - ${esc(report.month)}</title><style>
    @page{size:A4 ${view==='payroll'?'landscape':'portrait'};margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;color:#172033;background:#fff;margin:0;font-size:11px;direction:rtl}header{border-bottom:3px solid #163A63;padding-bottom:14px}h1{font-size:24px;margin:8px 0}h2{font-size:15px;color:#163A63;margin-top:24px}.brand{color:#163A63;font-weight:bold}.meta,.note{color:#667085;line-height:1.7}.cards{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}.card{flex:1;min-width:100px;background:#F6F8FB;border:1px solid #DCE3EC;border-radius:8px;padding:12px}.card b{display:block;font-size:19px;color:#163A63;margin-bottom:6px}.card span{font-size:10px;color:#667085}table{border-collapse:collapse;width:100%;margin:12px 0;font-size:${view==='payroll'?'10':'11'}px}thead{display:table-header-group}th{background:#163A63;color:#fff;text-align:right;padding:9px 6px}td{padding:9px 6px;border-bottom:1px solid #E4E7EC;overflow-wrap:anywhere}tbody tr{break-inside:avoid}tbody tr:nth-child(even){background:#F7F9FC}.empty{text-align:center;color:#667085;padding:20px}footer{border-top:1px solid #E4E7EC;color:#667085;margin-top:24px;padding-top:10px;font-size:9px}
    </style></head><body><header><div class="brand">حاضر · إدارة الموارد البشرية</div><h1>${esc(title)}</h1><div class="meta">شهر ${esc(report.month)} · ${esc(options.companyName||'الشركة الرئيسية')} · ${esc(options.branchName||'الفرع الرئيسي')} · ${options.employeeId!==undefined&&options.employeeId!=='all'?esc(employeeName(options.employeeId)):'كل الموظفين'}</div></header>${body}<footer>تم إنشاء التقرير من نظام حاضر · ${esc(new Intl.DateTimeFormat('ar-EG',{dateStyle:'long',timeZone:'Africa/Cairo'}).format(new Date()))}</footer></body></html>`;
}
export async function exportSelectedReportPdf(view:ReportView,report:ReportPdfData,options:Options={}) {
  return printReportHtml(buildSelectedReportHtml(view,report,options));
}
