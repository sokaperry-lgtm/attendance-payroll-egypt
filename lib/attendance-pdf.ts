import * as Print from "expo-print";
import { Platform } from "react-native";

export type AttendancePdfRecord = {
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  status: string;
  lateMinutes: number;
};

export type AttendancePdfEmployee = {
  name: string;
  title?: string | null;
  department?: string | null;
  presentDays: number;
  absentDays: number;
  lateMinutes: number;
  records: AttendancePdfRecord[];
};

export type AttendancePdfReport = {
  month: string;
  summary: {
    staffCount: number;
    presentDays: number;
    absentDays: number;
    lateMinutes: number;
    pendingRequests: number;
  };
  employees: AttendancePdfEmployee[];
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const formatMonth = (month: string) => {
  const date = new Date(`${month}-01T00:00:00`);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(date);
};

const formatDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(date);
};

const statusClass = (status: string) => {
  if (status === "حاضر") return "success";
  if (status === "متأخر") return "warning";
  if (status === "غياب") return "danger";
  return "neutral";
};

export function buildAttendanceReportHtml(
  report: AttendancePdfReport,
  options: { companyName?: string; branchName?: string } = {},
) {
  const summary = report.summary;
  const attendanceRate = summary.presentDays + summary.absentDays
    ? Math.round((summary.presentDays / (summary.presentDays + summary.absentDays)) * 100)
    : 0;
  const employeeSections = report.employees.map((employee) => {
    const records = employee.records.length
      ? employee.records.map((record) => `<tr>
          <td>${escapeHtml(formatDate(record.date))}</td>
          <td>${escapeHtml(record.checkIn || "—")}</td>
          <td>${escapeHtml(record.checkOut || "—")}</td>
          <td><span class="status ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
          <td>${record.lateMinutes ? `${escapeHtml(record.lateMinutes)} دقيقة` : "—"}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="empty">لا توجد سجلات حضور لهذا الموظف خلال الفترة.</td></tr>`;
    return `<section class="employee-section">
      <div class="employee-heading">
        <div><h2>${escapeHtml(employee.name)}</h2><p>${escapeHtml(employee.title || "موظف")} · ${escapeHtml(employee.department || "عام")}</p></div>
        <div class="employee-kpis"><span><b>${employee.presentDays}</b> حضور</span><span><b>${employee.absentDays}</b> غياب</span><span><b>${employee.lateMinutes}</b> دقيقة تأخير</span></div>
      </div>
      <table><thead><tr><th>التاريخ</th><th>الحضور</th><th>الانصراف</th><th>الحالة</th><th>التأخير</th></tr></thead><tbody>${records}</tbody></table>
    </section>`;
  }).join("");

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />
    <title>تقرير الحضور - ${escapeHtml(formatMonth(report.month))}</title>
    <style>
      @page { size: A4; margin: 14mm 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; background: #fff; font-family: Arial, "Tahoma", sans-serif; direction: rtl; font-size: 11px; }
      .report { max-width: 900px; margin: 0 auto; }
      .masthead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2563eb; padding-bottom: 16px; }
      .brand { color: #2563eb; font-size: 12px; font-weight: 700; letter-spacing: .4px; }
      h1 { margin: 7px 0 4px; font-size: 26px; }
      .subtitle { color: #64748b; margin: 0; font-size: 11px; }
      .meta { color: #64748b; text-align: left; line-height: 1.8; }
      .meta strong { color: #0f172a; }
      .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 18px 0 22px; }
      .summary-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
      .summary-card b { display: block; font-size: 19px; color: #2563eb; margin-bottom: 3px; }
      .summary-card span { color: #64748b; font-size: 10px; }
      .employee-section { break-inside: avoid; margin-bottom: 21px; }
      .employee-heading { display: flex; justify-content: space-between; align-items: center; border-right: 4px solid #2563eb; padding: 8px 12px; background: #f8fafc; }
      h2 { margin: 0; font-size: 15px; }
      .employee-heading p { margin: 4px 0 0; color: #64748b; font-size: 10px; }
      .employee-kpis { display: flex; gap: 12px; color: #64748b; font-size: 10px; }
      .employee-kpis b { color: #0f172a; font-size: 13px; }
      table { width: 100%; border-collapse: collapse; margin-top: 7px; }
      th { background: #0b1220; color: #fff; font-weight: 700; padding: 8px; text-align: right; }
      td { border-bottom: 1px solid #e2e8f0; padding: 7px 8px; color: #334155; }
      tr:nth-child(even) td { background: #f8fafc; }
      .status { border-radius: 99px; padding: 3px 8px; font-size: 9px; font-weight: 700; }
      .success { color: #047857; background: #ecfdf5; }
      .warning { color: #b45309; background: #fff7ed; }
      .danger { color: #b91c1c; background: #fef2f2; }
      .neutral { color: #475569; background: #f1f5f9; }
      .empty { color: #94a3b8; text-align: center; padding: 18px; }
      footer { color: #94a3b8; border-top: 1px solid #e2e8f0; margin-top: 28px; padding-top: 8px; font-size: 9px; display: flex; justify-content: space-between; }
      @media print { .employee-section { break-inside: avoid; } }
      @media (max-width: 650px) { .summary { grid-template-columns: repeat(2, 1fr); } .employee-heading { display: block; } .employee-kpis { margin-top: 8px; } }
    </style></head><body><main class="report">
      <header class="masthead"><div><div class="brand">حاضر · إدارة الموارد البشرية</div><h1>تقرير الحضور والانصراف</h1><p class="subtitle">${escapeHtml(formatMonth(report.month))} · تقرير تشغيلي مفصل</p></div><div class="meta"><div>الشركة: <strong>${escapeHtml(options.companyName || "الشركة الرئيسية")}</strong></div><div>الفرع: <strong>${escapeHtml(options.branchName || "الفرع الرئيسي")}</strong></div><div>نسبة الحضور: <strong>${attendanceRate}%</strong></div></div></header>
      <section class="summary"><div class="summary-card"><b>${summary.staffCount}</b><span>الموظفون</span></div><div class="summary-card"><b>${summary.presentDays}</b><span>أيام الحضور</span></div><div class="summary-card"><b>${summary.absentDays}</b><span>أيام الغياب</span></div><div class="summary-card"><b>${summary.lateMinutes}</b><span>دقائق التأخير</span></div><div class="summary-card"><b>${summary.pendingRequests}</b><span>طلبات معلقة</span></div></section>
      ${employeeSections || `<div class="empty">لا توجد بيانات حضور خلال هذه الفترة.</div>`}
      <footer><span>تم إنشاء التقرير تلقائيًا من نظام حاضر</span><span>تاريخ الإنشاء: ${escapeHtml(new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date()))}</span></footer>
    </main></body></html>`;
}

export async function exportAttendanceReportPdf(report: AttendancePdfReport, options?: { companyName?: string; branchName?: string }) {
  const html = buildAttendanceReportHtml(report, options);
  if (Platform.OS === "web") {
    const popup = window.open("", "_blank", "width=1000,height=800");
    if (!popup) throw new Error("اسمح بفتح النوافذ المنبثقة لتصدير التقرير.");
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.onload = () => popup.print();
    return;
  }
  await Print.printAsync({ html });
}
