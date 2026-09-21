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

function printPayslip(p: any, month: string, employeeName: string) {
  if (typeof window === "undefined") return;
  const rows = [
    ["الراتب الأساسي", p.baseSalary], ["البدلات", p.allowances], ["الحوافز والمكافآت", p.bonuses],
    ["الإضافي", p.overtime], ["إجمالي المستحقات", p.grossSalary], ["التأمينات الاجتماعية", p.employeeSocialInsurance],
    ["ضريبة الدخل", p.employeeIncomeTax], ["خصم الغياب", p.absenceDeduction], ["خصم التأخير", p.lateDeduction],
    ["خصومات أخرى", p.otherDeductions], ["السلف والأقساط", p.advances], ["صافي الراتب", p.netSalary]
  ];
  const money=(v:number)=>formatMoney(Number(v||0));
  const body=rows.map(([label,value])=>`<tr><td>${label}</td><td>${money(value as number)}</td></tr>`).join("");
  const status=p.status==="approved"?"معتمد":"مسودة";
  const html=`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>قسيمة راتب - ${employeeName}</title><style>
  body{font-family:Arial,Tahoma,sans-serif;background:#f4f7fb;margin:0;padding:32px;color:#172033}.sheet{max-width:760px;margin:auto;background:#fff;border-radius:22px;padding:32px;box-shadow:0 8px 30px #dce3eb}.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #edf1f5;padding-bottom:20px}.brand{font-size:24px;font-weight:900;color:#163A63}.muted{color:#667085;font-size:12px;margin-top:5px}.badge{background:#eaf8f1;color:#147a4b;padding:8px 12px;border-radius:10px;font-weight:800;font-size:12px}h1{font-size:26px;margin:24px 0 4px}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:13px 10px;border-bottom:1px solid #eef1f4}td:last-child{text-align:left;font-weight:800;color:#163A63}.total td{font-size:18px;font-weight:900;background:#f3f8fd}.footer{margin-top:22px;color:#98a6b8;font-size:10px;text-align:center}@media print{body{background:#fff;padding:0}.sheet{box-shadow:none;max-width:none;border-radius:0}}
  </style></head><body><div class="sheet"><div class="top"><div><div class="brand">حاضر · HR & Payroll</div><div class="muted">قسيمة راتب شهر ${monthLabel(month)}</div></div><div class="badge">${status}</div></div><h1>${employeeName}</h1><div class="muted">كشف تفصيلي للراتب والمستحقات والخصومات</div><table>${body.replace('<tr><td>صافي الراتب</td>','<tr class="total"><td>صافي الراتب</td>')}</table><div class="footer">تم إنشاء قسيمة الراتب من نظام حاضر · جميع القيم بالجنيه المصري</div></div><script>window.onload=()=>window.print()</script></body></html>`;
  const w=window.open("", "_blank", "width=900,height=1100");
  if(!w){ window.alert("اسمح بفتح النوافذ المنبثقة لطباعة قسيمة الراتب."); return; }
  w.document.write(html); w.document.close();
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

  const rows = query.data ?? [];
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
          <Pressable disabled={!p} onPress={() => p && printPayslip(p, month, employee.name || "الموظف")} style={[styles.printButton, !p && styles.printButtonDisabled]}><IconSymbol name="banknote" size={16} color="#FFFFFF" /><Text style={styles.printText}>{p ? "طباعة / حفظ PDF" : "لا توجد قسيمة لهذا الشهر"}</Text></Pressable>
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
                <Pressable onPress={() => printPayslip(selected, month, `الموظف #${selected.staffAccountId}`)} style={styles.printButton}><IconSymbol name="arrow.down" size={16} color="#FFFFFF" /><Text style={styles.printText}>طباعة / حفظ PDF</Text></Pressable>
                <StatusBadge label={selected.status === "approved" ? "معتمد" : "مسودة"} tone={selected.status === "approved" ? "success" : "warning"} />
              </View>
            </View>
          );
        })()}
      </ScrollView>
    </ScreenContainer>
  );
}

function Header({ title, subtitle, icon }: { title: string; subtitle: string; icon: "banknote" }) {
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