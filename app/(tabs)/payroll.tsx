import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StatusBadge } from "@/components/ui/design-system";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(value: string) {
  const [y, m] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}

function printPayslip(data: any, month: string) {
  if (typeof window === "undefined") return;
  const p=data.payroll;
  const staff=data.staff;
  const company=data.company;
  const branch=data.branch;
  const employeeName=staff?.name || "الموظف";
  const issued=new Date(data.issuedAt || Date.now()).toLocaleDateString("ar-EG",{year:"numeric",month:"long",day:"numeric"});
  const approved=p.status==="approved";
  const rows=[
    ["الراتب الأساسي",p.baseSalary],["البدلات",p.allowances],["الحوافز والمكافآت",p.bonuses],["الإضافي",p.overtime],
    ["إجمالي المستحقات",p.grossSalary],["التأمينات الاجتماعية",p.employeeSocialInsurance],["ضريبة الدخل",p.employeeIncomeTax],
    ["خصم الغياب",p.absenceDeduction],["خصم التأخير",p.lateDeduction],["خصومات أخرى",p.otherDeductions],["السلف والأقساط",p.advances]
  ];
  const money=(v:number)=>formatMoney(Number(v||0));
  const esc=(v:any)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]!));
  const body=rows.map(([label,value])=>`<tr><td>${esc(label)}</td><td>${money(value as number)}</td></tr>`).join("");
  const logo=`<div class="logoMark"><span></span><span></span><span></span><span></span><span></span></div>`;
  const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>Payslip - ${esc(employeeName)} - ${esc(month)}</title><style>
  *{box-sizing:border-box}body{font-family:Arial,Tahoma,sans-serif;background:#eef2f6;margin:0;padding:30px;color:#172033}.sheet{max-width:820px;margin:auto;background:#fff;padding:38px 42px;border:1px solid #dce3ea;box-shadow:0 12px 35px #d7dee7;position:relative}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #163A63;padding-bottom:22px}.brandRow{display:flex;align-items:center;gap:12px}.logoMark{width:48px;height:48px;border-radius:15px;background:#163A63;display:flex;align-items:center;justify-content:center;gap:3px;transform:rotate(-8deg)}.logoMark span{display:block;width:3px;height:25px;border-radius:4px;background:#fff}.logoMark span:nth-child(2){height:32px}.logoMark span:nth-child(3){height:38px}.logoMark span:nth-child(4){height:30px}.logoMark span:nth-child(5){height:20px}.brand{font-size:22px;font-weight:900;color:#163A63}.company{font-size:12px;font-weight:800;color:#172033;margin-top:4px}.muted{color:#718096;font-size:11px;margin-top:4px}.status{padding:8px 14px;border-radius:9px;font-size:11px;font-weight:900;background:${approved?"#eaf8f1":"#fff5dd"};color:${approved?"#147a4b":"#9a6a00"}}.title{font-size:27px;font-weight:900;margin:26px 0 4px}.subtitle{font-size:11px;color:#718096}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.metaBox{border:1px solid #e2e8ee;border-radius:10px;padding:11px;background:#fafbfd}.metaLabel{font-size:9px;color:#8995a5;font-weight:800}.metaValue{font-size:12px;color:#172033;font-weight:900;margin-top:5px}.sectionTitle{font-size:12px;font-weight:900;color:#163A63;margin:18px 0 8px;border-right:4px solid #1677D2;padding-right:8px}table{width:100%;border-collapse:collapse}td{padding:11px 10px;border-bottom:1px solid #edf1f4;font-size:11px}td:last-child{text-align:left;font-weight:800;color:#163A63}.total td{background:#f3f8fd;font-size:14px;font-weight:900;border-top:2px solid #d9e9f7}.net td{background:#163A63;color:#fff;font-size:17px;font-weight:900;padding:15px}.net td:last-child{color:#fff}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:42px}.signature{border-top:1px solid #aeb9c6;padding-top:9px;text-align:center;font-size:10px;color:#667085}.seal{width:68px;height:68px;border:2px solid #8fa4b8;border-radius:50%;margin:-5px auto 8px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9px;font-weight:900;color:#6b8298}.footer{border-top:1px solid #edf1f4;margin-top:28px;padding-top:12px;text-align:center;color:#98a6b8;font-size:8px;line-height:15px}@media print{body{background:#fff;padding:0}.sheet{max-width:none;box-shadow:none;border:0;padding:28px 34px}.status{-webkit-print-color-adjust:exact;print-color-adjust:exact}.net td,.total td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media(max-width:650px){.meta{grid-template-columns:1fr 1fr}.top{gap:15px}.sheet{padding:24px}.signatures{gap:20px}}
  </style></head><body><div class="sheet">
  <div class="top"><div class="brandRow">${logo}<div><div class="brand">حاضر</div><div class="company">${esc(company?.legalName || company?.name || "الشركة")}</div><div class="muted">${esc(company?.phone || "")}${company?.email?" · "+esc(company.email):""}</div></div></div><div class="status">${approved?"تم الاعتماد":"مسودة / قيد المراجعة"}</div></div>
  <div class="title">قسيمة راتب رسمية</div><div class="subtitle">Official Payroll Statement · ${esc(monthLabel(month))}</div>
  <div class="meta"><div class="metaBox"><div class="metaLabel">اسم الموظف</div><div class="metaValue">${esc(employeeName)}</div></div><div class="metaBox"><div class="metaLabel">Employee ID</div><div class="metaValue">EMP-${String(staff?.id||"").padStart(5,"0")}</div></div><div class="metaBox"><div class="metaLabel">الفرع</div><div class="metaValue">${esc(branch?.name || "—")}</div></div><div class="metaBox"><div class="metaLabel">تاريخ الإصدار</div><div class="metaValue">${esc(issued)}</div></div></div>
  <div class="meta"><div class="metaBox"><div class="metaLabel">المسمى الوظيفي</div><div class="metaValue">${esc(staff?.title || "—")}</div></div><div class="metaBox"><div class="metaLabel">القسم</div><div class="metaValue">${esc(staff?.department || "—")}</div></div><div class="metaBox"><div class="metaLabel">رقم المسير</div><div class="metaValue">#${p.id}</div></div><div class="metaBox"><div class="metaLabel">العملة</div><div class="metaValue">${esc(company?.currency || "EGP")}</div></div></div>
  <div class="sectionTitle">تفاصيل المستحقات والخصومات</div><table>${body}<tr class="total"><td>إجمالي المستحقات</td><td>${money(p.grossSalary)}</td></tr><tr class="net"><td>صافي الراتب المستحق</td><td>${money(p.netSalary)}</td></tr></table>
  <div class="signatures"><div class="signature"><div class="seal">${approved?"PAYROLL<br>APPROVED":"PENDING<br>REVIEW"}</div>توقيع / اعتماد الإدارة<br><b>${approved?"تم اعتماد المسير":"لم يتم الاعتماد بعد"}</b></div><div class="signature">توقيع الموظف<br><br>________________________</div></div>
  <div class="footer">${esc(company?.name || "الشركة")} · ${esc(branch?.address || "")}<br>هذه القسيمة صادرة إلكترونيًا من نظام حاضر. ${approved?"تاريخ الاعتماد: "+esc(new Date(p.approvedAt).toLocaleDateString("ar-EG")):"القسيمة غير معتمدة بعد."}</div>
  </div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`;
  const w=window.open("","_blank","width=950,height=1200"); if(!w){window.alert("اسمح بالنوافذ المنبثقة لطباعة قسيمة الراتب.");return;} w.document.write(html);w.document.close();
}

function shiftMonth(value: string, delta: number) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const nextYear = d.getFullYear();
  const nextMonth = String(d.getMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

export default function PayrollScreen() {
  const { role, employee, payroll } = useAppData();
  const isAdmin = role === "manager";
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<"all" | "draft" | "approved">("all");
  const [selectedRowId, setSelectedRowId] = useState<number | string | null>(null);
  const query = trpc.payroll.list.useQuery({ month }, { enabled: isAdmin });
  const generate = trpc.payroll.generate.useMutation({ onSuccess: () => query.refetch() });
  const approve = trpc.payroll.approve.useMutation({ onSuccess: () => query.refetch() });
  const adjustments = trpc.hrTools.adjustments.useQuery({ month }, { enabled: isAdmin });
  const advances = trpc.hrTools.advances.useQuery(undefined, { enabled: isAdmin });
  const selfService = trpc.selfService.me.useQuery({ month }, { enabled: !isAdmin });
  const [printPayrollId, setPrintPayrollId] = useState<number | null>(null);
  const printQuery = trpc.payroll.payslip.useQuery({ id: printPayrollId ?? 0 }, { enabled: printPayrollId !== null });

  const rows = query.data ?? [];
  const printData = printQuery.data;
  const filteredRows = useMemo(
    () => rows.filter(r => filter === "all" || r.status === filter),
    [rows, filter]
  );
  const stats = useMemo(() => {
    const gross = rows.reduce((s, r) => s + r.grossSalary, 0);
    const deductions = rows.reduce((s, r) => s + r.employeeSocialInsurance + r.employeeIncomeTax + r.absenceDeduction + r.lateDeduction + r.otherDeductions + r.advances, 0);
    const net = rows.reduce((s, r) => s + r.netSalary, 0);
    const approved = rows.filter(r => r.status === "approved").length;
    return { gross, deductions, net, approved };
  }, [rows]);

  if (query.isLoading && isAdmin) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color="#163A63" /><Text style={styles.stateText}>جاري تحميل مسير الرواتب...</Text></View></ScreenContainer>;
  }

  if (!isAdmin) {
    const p = selfService.data?.payroll;
    const gross = p?.grossSalary ?? (employee.baseSalary + payroll.overtimeValue);
    const deductions = p ? p.employeeSocialInsurance + p.employeeIncomeTax + p.absenceDeduction + p.lateDeduction + p.otherDeductions + p.advances : payroll.absenceDeduction + payroll.lateDeduction;
    const net = p?.netSalary ?? payroll.net;
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <Header title="راتبي" subtitle="قسيمة راتبك التفصيلية لهذا الشهر." icon="banknote" />
          <View style={styles.hero}>
            <View style={styles.heroCopy}><Text style={styles.heroKicker}>NET SALARY</Text><Text style={styles.heroValue}>{formatMoney(net)}</Text><Text style={styles.heroMeta}>{monthLabel(month)} · {p?.status === "approved" ? "راتب معتمد" : "قيد المراجعة"}</Text></View>
            <View style={styles.heroIcon}><IconSymbol name="banknote" size={25} color="#FFFFFF" /></View>
          </View>
          <View style={styles.monthBar}>
            <Pressable onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthButton}><Text style={styles.monthArrow}>‹</Text><Text style={styles.monthButtonLabel}>السابق</Text></Pressable>
            <View style={styles.monthCenter}><Text style={styles.monthKicker}>PAYSLIP PERIOD</Text><Text style={styles.monthTitle}>{monthLabel(month)}</Text></View>
            <Pressable onPress={() => setMonth(shiftMonth(month, 1))} style={styles.monthButton}><Text style={styles.monthButtonLabel}>التالي</Text><IconSymbol name="arrow.right" size={16} color="#163A63" /></Pressable>
          </View>
          <View style={styles.kpiGrid}><Kpi label="إجمالي المستحقات" value={formatMoney(gross)} /><Kpi label="إجمالي الخصومات" value={formatMoney(deductions)} /><Kpi label="الأوفر تايم" value={formatMoney(p?.overtime ?? payroll.overtimeValue)} /></View>
          <Section title="قسيمة الراتب" subtitle="تفصيل كامل للمستحقات والخصومات والتأمين والضريبة" />
          <View style={styles.detailCard}>
            <Row label="الراتب الأساسي" value={formatMoney(p?.baseSalary ?? employee.baseSalary)} />
            <Row label="البدلات" value={formatMoney(p?.allowances ?? 0)} />
            <Row label="الحوافز والمكافآت" value={formatMoney(p?.bonuses ?? 0)} />
            <Row label="الأوفر تايم" value={formatMoney(p?.overtime ?? payroll.overtimeValue)} />
            <Row label="إجمالي المستحقات" value={formatMoney(gross)} />
            <Row label="التأمينات الاجتماعية" value={formatMoney(p?.employeeSocialInsurance ?? 0)} />
            <Row label="ضريبة الدخل" value={formatMoney(p?.employeeIncomeTax ?? 0)} />
            <Row label="خصم الغياب" value={formatMoney(p?.absenceDeduction ?? payroll.absenceDeduction)} />
            <Row label="خصم التأخير" value={formatMoney(p?.lateDeduction ?? payroll.lateDeduction)} />
            <Row label="خصومات أخرى" value={formatMoney(p?.otherDeductions ?? 0)} />
            <Row label="السلف والأقساط" value={formatMoney(p?.advances ?? 0)} />
            <Row label="صافي الراتب" value={formatMoney(net)} strong />
          </View>
          <View style={styles.statusCard}>
            <View style={styles.statusIcon}><IconSymbol name="checkmark" size={18} color="#1677D2" /></View>
            <View style={styles.statusCopy}><Text style={styles.statusTitle}>حالة المسير</Text><Text style={styles.statusText}>{p?.status === "approved" ? "تم اعتماد مسير هذا الشهر." : "المسير ما زال قيد المراجعة والاعتماد."}</Text></View>
            <StatusBadge label={p?.status === "approved" ? "معتمد" : "قيد المراجعة"} tone={p?.status === "approved" ? "success" : "warning"} />
          </View>
          <Pressable disabled={!p} onPress={() => p && setPrintPayrollId(p.id)} style={[styles.printButton, !p && styles.printButtonDisabled]}><IconSymbol name="banknote" size={16} color="#FFFFFF" /><Text style={styles.printText}>{p ? "طباعة / حفظ PDF" : "لا توجد قسيمة لهذا الشهر"}</Text></Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Header title="الرواتب" subtitle="Payroll Command Center لإدارة مسير الشهر من شاشة واحدة." icon="banknote" />
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>PAYROLL COMMAND CENTER</Text>
            <Text style={styles.heroValue}>{formatMoney(stats.net)}</Text>
            <Text style={styles.heroMeta}>{monthLabel(month)} · صافي المسير</Text>
          </View>
          <View style={styles.heroIcon}><IconSymbol name="banknote" size={25} color="#FFFFFF" /></View>
        </View>

        <View style={styles.monthBar}>
          <Pressable onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthButton}><Text style={styles.monthArrow}>‹</Text><Text style={styles.monthButtonLabel}>السابق</Text></Pressable>
          <View style={styles.monthCenter}><Text style={styles.monthKicker}>PAYROLL PERIOD</Text><Text style={styles.monthTitle}>{monthLabel(month)}</Text><Text style={styles.monthHint}>السابق ←  الشهر الحالي  → التالي</Text></View>
          <Pressable onPress={() => setMonth(shiftMonth(month, 1))} style={styles.monthButton}><Text style={styles.monthButtonLabel}>التالي</Text><IconSymbol name="arrow.right" size={16} color="#163A63" /></Pressable>
        </View>

        <View style={styles.kpiGrid}>
          <Kpi label="إجمالي قبل الخصم" value={formatMoney(stats.gross)} />
          <Kpi label="الخصومات" value={formatMoney(stats.deductions)} />
          <Kpi label="صافي المسير" value={formatMoney(stats.net)} />
          <Kpi label="تم اعتمادهم" value={String(stats.approved)} />
        </View>

        <View style={styles.actionCard}>
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>تشغيل مسير الشهر</Text><Text style={styles.actionText}>إعادة حساب الرواتب بناءً على الحضور والتأخير والغياب.</Text></View>
          <Pressable disabled={generate.isPending} onPress={() => generate.mutate({ month })} style={styles.primaryButton}><Text style={styles.primaryText}>{generate.isPending ? "جارٍ الحساب..." : "حساب المسير"}</Text></Pressable>
        </View>

        <View style={styles.insightGrid}>
          <Insight title="تعديلات الشهر" value={String(adjustments.data?.length ?? 0)} meta="حوافز / خصومات" />
          <Insight title="السلف النشطة" value={String((advances.data ?? []).filter(a => a.status === "active").length)} meta="حسابات مفتوحة" />
          <Insight title="المتبقي من السلف" value={formatMoney((advances.data ?? []).filter(a => a.status === "active").reduce((s, a) => s + a.remainingAmount, 0))} meta="إجمالي المتبقي" />
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.filters}>
            {([["all", "الكل"], ["draft", "مسودة"], ["approved", "معتمد"]] as const).map(([key, label]) => (
              <Pressable key={key} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterActive]}><Text style={[styles.filterText, filter === key && styles.filterTextActive]}>{label}</Text></Pressable>
            ))}
          </View>
          <Section title="موظفو المسير" subtitle={filteredRows.length + " موظف ظاهر في العرض"} />
        </View>

        <View style={styles.table}>
          {filteredRows.length === 0 ? (
            <View style={styles.empty}><IconSymbol name="banknote" size={25} color="#A1ACBA" /><Text style={styles.emptyTitle}>لا توجد نتائج</Text><Text style={styles.emptyText}>جرّب فلترًا آخر أو احسب مسير الشهر.</Text></View>
          ) : filteredRows.map(r => {
            const deductions = r.absenceDeduction + r.lateDeduction;
            const gross = r.grossSalary;
            const isSelected = String(selectedRowId) === String(r.id);
            return (
              <View key={r.id} style={[styles.employeeRow, isSelected && styles.employeeRowSelected]}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{String(r.staffAccountId).slice(-2)}</Text></View>
                <Pressable onPress={() => setSelectedRowId(r.id)} style={styles.employeeCopy}>
                  <Text style={styles.employeeName}>موظف #{r.staffAccountId}</Text>
                  <Text style={styles.employeeMeta}>إجمالي {formatMoney(gross)} · خصومات {formatMoney(deductions)}</Text>
                </Pressable>
                <Pressable onPress={() => setSelectedRowId(r.id)} style={styles.netBox}><Text style={styles.netLabel}>الصافي</Text><Text style={styles.netValue}>{formatMoney(r.netSalary)}</Text><StatusBadge label={r.status === "approved" ? "معتمد" : "مسودة"} tone={r.status === "approved" ? "success" : "warning"} /><Text style={styles.viewSalary}>عرض الراتب</Text></Pressable>
                <Pressable disabled={r.status === "approved" || approve.isPending} onPress={() => approve.mutate({ id: r.id })} style={[styles.approveButton, r.status === "approved" && styles.approvedButton]}><Text style={styles.approveText}>{r.status === "approved" ? "✓" : "اعتماد"}</Text></Pressable>
              </View>
            );
          })}
        </View>

        {selectedRowId !== null && (() => {
          const selected = rows.find(r => String(r.id) === String(selectedRowId));
          if (!selected) return null;
          const deductions = selected.employeeSocialInsurance + selected.employeeIncomeTax + selected.absenceDeduction + selected.lateDeduction + selected.otherDeductions + selected.advances;
          return (
            <View style={styles.selectedCard}>
              <View style={styles.selectedHeader}>
                <Pressable onPress={() => setSelectedRowId(null)} style={styles.closeSelected}><Text style={styles.closeSelectedText}>×</Text></Pressable>
                <View><Text style={styles.selectedKicker}>EMPLOYEE PAYSLIP</Text><Text style={styles.selectedTitle}>قسيمة راتب الموظف #{selected.staffAccountId}</Text></View>
              </View>
              <View style={styles.selectedGrid}>
                <Kpi label="الأساسي" value={formatMoney(selected.baseSalary)} />
                <Kpi label="البدلات" value={formatMoney(selected.allowances)} />
                <Kpi label="المكافآت" value={formatMoney(selected.bonuses)} />
                <Kpi label="الأوفر تايم" value={formatMoney(selected.overtime)} />
                <Kpi label="الإجمالي" value={formatMoney(selected.grossSalary)} />
                <Kpi label="التأمينات" value={formatMoney(selected.employeeSocialInsurance)} />
                <Kpi label="الضريبة" value={formatMoney(selected.employeeIncomeTax)} />
                <Kpi label="الغياب والتأخير" value={formatMoney(selected.absenceDeduction + selected.lateDeduction)} />
                <Kpi label="خصومات أخرى" value={formatMoney(selected.otherDeductions)} />
                <Kpi label="السلف" value={formatMoney(selected.advances)} />
                <Kpi label="الصافي" value={formatMoney(selected.netSalary)} />
              </View>
              <View style={styles.payslipActions}>
                <Pressable onPress={() => setPrintPayrollId(selected.id)} style={styles.printButton}><IconSymbol name="arrow.down" size={16} color="#FFFFFF" /><Text style={styles.printText}>طباعة / حفظ PDF</Text></Pressable>
                <StatusBadge label={selected.status === "approved" ? "معتمد" : "مسودة"} tone={selected.status === "approved" ? "success" : "warning"} />
              </View>
            </View>
          );
        })()}
      </ScrollView>
    </ScreenContainer>
  );
}

function PrintEffect({data,month,onDone}:{data:any;month:string;onDone:()=>void}) { useState(() => { setTimeout(() => { printPayslip(data,month); onDone(); }, 0); return null; }); return null; }\nfunction Header({ title, subtitle, icon }: { title: string; subtitle: string; icon: "banknote" }) {
  return <View style={styles.header}><View style={styles.headerIcon}><IconSymbol name={icon} size={24} color="#FFFFFF" /></View><View style={styles.headerCopy}><Text style={styles.eyebrow}>PAYROLL</Text><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View></View>;
}
function Section({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View>;
}
function Kpi({ label, value }: { label: string; value: string }) {
  return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}
function Insight({ title, value, meta }: { title: string; value: string; meta: string }) {
  return <View style={styles.insight}><Text style={styles.insightValue}>{value}</Text><Text style={styles.insightTitle}>{title}</Text><Text style={styles.insightMeta}>{meta}</Text></View>;
}
function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.row}><Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text><Text style={styles.rowLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  content:{padding:20,paddingBottom:60,gap:14,maxWidth:1200,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row-reverse",alignItems:"center",gap:12},headerIcon:{width:52,height:52,borderRadius:17,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},headerCopy:{flex:1},eyebrow:{color:"#7B8798",fontSize:9,fontWeight:"900",textAlign:"right",letterSpacing:1},title:{color:"#172033",fontSize:29,fontWeight:"900",textAlign:"right",marginTop:3},subtitle:{color:"#667085",fontSize:11,lineHeight:18,textAlign:"right",marginTop:4},
  hero:{backgroundColor:"#102A47",borderRadius:24,padding:20,minHeight:142,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},heroCopy:{flex:1},heroKicker:{color:"#8EA7BE",fontSize:9,fontWeight:"900",textAlign:"right",letterSpacing:1},heroValue:{color:"#FFFFFF",fontSize:32,fontWeight:"900",textAlign:"right",marginTop:5},heroMeta:{color:"#B8C9D8",fontSize:10,textAlign:"right",marginTop:4},heroIcon:{width:58,height:58,borderRadius:18,backgroundColor:"#1D4268",alignItems:"center",justifyContent:"center"},
  monthBar:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:17,padding:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},monthCenter:{alignItems:"center"},monthKicker:{color:"#98A6B8",fontSize:8,fontWeight:"900"},monthTitle:{color:"#172033",fontSize:14,fontWeight:"900",marginTop:2},monthButton:{minWidth:78,height:40,borderRadius:11,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:5,paddingHorizontal:9},monthArrow:{color:"#163A63",fontSize:18,fontWeight:"900"},monthButtonLabel:{color:"#163A63",fontSize:9,fontWeight:"900",textAlign:"center"},monthHint:{color:"#A1ACBA",fontSize:8,marginTop:3},
  kpiGrid:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},kpi:{flex:1,minWidth:150,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:16,padding:14,minHeight:82,justifyContent:"center"},kpiValue:{color:"#163A63",fontSize:18,fontWeight:"900",textAlign:"right"},kpiLabel:{color:"#667085",fontSize:9,fontWeight:"700",textAlign:"right",marginTop:5},
  actionCard:{backgroundColor:"#F3F8FD",borderWidth:1,borderColor:"#D9E9F7",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",gap:12},actionCopy:{flex:1},actionTitle:{color:"#172033",fontSize:13,fontWeight:"900",textAlign:"right"},actionText:{color:"#667085",fontSize:9,lineHeight:16,textAlign:"right",marginTop:4},primaryButton:{backgroundColor:"#163A63",borderRadius:12,paddingHorizontal:16,paddingVertical:12},primaryText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  insightGrid:{flexDirection:"row-reverse",gap:10},insight:{flex:1,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:16,padding:14},insightValue:{color:"#163A63",fontSize:16,fontWeight:"900",textAlign:"right"},insightTitle:{color:"#172033",fontSize:10,fontWeight:"900",textAlign:"right",marginTop:7},insightMeta:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:3},
  sectionHeader:{gap:10},section:{},sectionTitle:{color:"#172033",fontSize:16,fontWeight:"900",textAlign:"right"},sectionSubtitle:{color:"#98A6B8",fontSize:9,textAlign:"right",marginTop:3},filters:{flexDirection:"row-reverse",gap:7},filter:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E7ED",borderRadius:10,paddingHorizontal:12,paddingVertical:8},filterActive:{backgroundColor:"#163A63",borderColor:"#163A63"},filterText:{color:"#667085",fontSize:9,fontWeight:"800"},filterTextActive:{color:"#FFFFFF"},
  table:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,overflow:"hidden"},employeeRow:{minHeight:88,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:10,borderBottomWidth:1,borderBottomColor:"#EEF1F4"},employeeRowSelected:{backgroundColor:"#F1F7FD",borderColor:"#BFD8EE"},avatar:{width:38,height:38,borderRadius:12,backgroundColor:"#EAF1F8",alignItems:"center",justifyContent:"center"},avatarText:{color:"#31577F",fontSize:10,fontWeight:"900"},employeeCopy:{flex:1,paddingVertical:4},employeeName:{color:"#172033",fontSize:11,fontWeight:"900",textAlign:"right"},employeeMeta:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:4},netBox:{minWidth:110,alignItems:"flex-end"},netLabel:{color:"#98A6B8",fontSize:8},netValue:{color:"#163A63",fontSize:12,fontWeight:"900",marginTop:2},approveButton:{backgroundColor:"#163A63",borderRadius:10,paddingHorizontal:12,paddingVertical:9},approvedButton:{backgroundColor:"#EAF8F1"},approveText:{color:"#FFFFFF",fontSize:9,fontWeight:"900"},viewSalary:{color:"#1677D2",fontSize:7,fontWeight:"900",marginTop:3},selectedCard:{backgroundColor:"#FFFFFF",borderWidth:2,borderColor:"#163A63",borderRadius:20,padding:16,gap:10},selectedHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},selectedKicker:{color:"#7B8798",fontSize:8,fontWeight:"900",textAlign:"right"},selectedTitle:{color:"#172033",fontSize:15,fontWeight:"900",textAlign:"right",marginTop:3},closeSelected:{width:32,height:32,borderRadius:10,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},closeSelectedText:{color:"#667085",fontSize:22,lineHeight:24},selectedGrid:{flexDirection:"row-reverse",gap:8,flexWrap:"wrap"},empty:{padding:35,alignItems:"center"},emptyTitle:{color:"#172033",fontSize:13,fontWeight:"900",marginTop:9},emptyText:{color:"#98A6B8",fontSize:9,marginTop:4},
  detailCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:16},row:{flexDirection:"row-reverse",justifyContent:"space-between",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#F1F4F7"},rowLabel:{color:"#667085",fontSize:10},rowValue:{color:"#172033",fontSize:11,fontWeight:"800"},rowStrong:{color:"#163A63",fontSize:14},statusCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",gap:10},statusIcon:{width:40,height:40,borderRadius:12,backgroundColor:"#EEF6FF",alignItems:"center",justifyContent:"center"},statusCopy:{flex:1},statusTitle:{color:"#172033",fontSize:11,fontWeight:"900",textAlign:"right"},statusText:{color:"#667085",fontSize:9,lineHeight:16,textAlign:"right",marginTop:3},state:{flex:1,alignItems:"center",justifyContent:"center",gap:12},stateText:{color:"#667085",fontSize:11}
});