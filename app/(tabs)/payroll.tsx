import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { StatusBadge } from "@/components/ui/design-system";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

function monthLabel(value: string) {
  const [y, m] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ar-EG", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
}
function shiftMonth(value: string, delta: number) {
  const [y, m] = value.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}

export default function PayrollScreen() {
  const { role, employee, payroll } = useAppData();
  const isAdmin = role === "manager";
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<"all" | "draft" | "approved">("all");
  const query = trpc.payroll.list.useQuery({ month }, { enabled: isAdmin });
  const generate = trpc.payroll.generate.useMutation({ onSuccess: () => query.refetch() });
  const approve = trpc.payroll.approve.useMutation({ onSuccess: () => query.refetch() });
  const adjustments = trpc.hrTools.adjustments.useQuery({ month }, { enabled: isAdmin });
  const advances = trpc.hrTools.advances.useQuery(undefined, { enabled: isAdmin });

  const rows = query.data ?? [];
  const filteredRows = useMemo(
    () => rows.filter(r => filter === "all" || r.status === filter),
    [rows, filter]
  );
  const stats = useMemo(() => {
    const gross = rows.reduce((s, r) => s + r.baseSalary + r.overtime, 0);
    const deductions = rows.reduce((s, r) => s + r.absenceDeduction + r.lateDeduction, 0);
    const net = rows.reduce((s, r) => s + r.netSalary, 0);
    const approved = rows.filter(r => r.status === "approved").length;
    return { gross, deductions, net, approved };
  }, [rows]);

  if (query.isLoading && isAdmin) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color="#163A63" /><Text style={styles.stateText}>جاري تحميل مسير الرواتب...</Text></View></ScreenContainer>;
  }

  if (!isAdmin) {
    const gross = employee.baseSalary + payroll.overtimeValue;
    const deductions = payroll.absenceDeduction + payroll.lateDeduction;
    return (
      <ScreenContainer>
        <ScrollView contentContainerStyle={styles.content}>
          <Header title="راتبي" subtitle="ملخص راتبك ومكوناته لهذا الشهر." icon="banknote" />
          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>NET SALARY</Text>
              <Text style={styles.heroValue}>{formatMoney(payroll.net)}</Text>
              <Text style={styles.heroMeta}>{monthLabel(month)} · صافي متوقع</Text>
            </View>
            <View style={styles.heroIcon}><IconSymbol name="banknote" size={25} color="#FFFFFF" /></View>
          </View>
          <View style={styles.kpiGrid}>
            <Kpi label="الإجمالي" value={formatMoney(gross)} />
            <Kpi label="الخصومات" value={formatMoney(deductions)} />
            <Kpi label="أوفر تايم" value={formatMoney(payroll.overtimeValue)} />
          </View>
          <Section title="تفاصيل الراتب" subtitle="المكونات التي دخلت في حساب الصافي" />
          <View style={styles.detailCard}>
            <Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} />
            <Row label="الأوفر تايم المعتمد" value={formatMoney(payroll.overtimeValue)} />
            <Row label="خصم الغياب" value={formatMoney(payroll.absenceDeduction)} />
            <Row label="خصم التأخير" value={formatMoney(payroll.lateDeduction)} />
            <Row label="الصافي" value={formatMoney(payroll.net)} strong />
          </View>
          <View style={styles.statusCard}>
            <View style={styles.statusIcon}><IconSymbol name="checkmark" size={18} color="#1677D2" /></View>
            <View style={styles.statusCopy}><Text style={styles.statusTitle}>حالة المسير</Text><Text style={styles.statusText}>سيظهر اعتماد الإدارة هنا بعد مراجعة مسير الشهر.</Text></View>
            <StatusBadge label="قيد المراجعة" tone="warning" />
          </View>
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
          <Pressable onPress={() => setMonth(shiftMonth(month, 1))} style={styles.monthButton}><Text style={styles.monthButtonText}>‹</Text></Pressable>
          <View style={styles.monthCenter}><Text style={styles.monthKicker}>PAYROLL PERIOD</Text><Text style={styles.monthTitle}>{monthLabel(month)}</Text></View>
          <Pressable onPress={() => setMonth(shiftMonth(month, -1))} style={styles.monthButton}><Text style={styles.monthButtonText}>›</Text></Pressable>
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
            const gross = r.baseSalary + r.overtime;
            return (
              <View key={r.id} style={styles.employeeRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{String(r.staffAccountId).slice(-2)}</Text></View>
                <View style={styles.employeeCopy}>
                  <Text style={styles.employeeName}>موظف #{r.staffAccountId}</Text>
                  <Text style={styles.employeeMeta}>إجمالي {formatMoney(gross)} · خصومات {formatMoney(deductions)}</Text>
                </View>
                <View style={styles.netBox}><Text style={styles.netLabel}>الصافي</Text><Text style={styles.netValue}>{formatMoney(r.netSalary)}</Text><StatusBadge label={r.status === "approved" ? "معتمد" : "مسودة"} tone={r.status === "approved" ? "success" : "warning"} /></View>
                <Pressable disabled={r.status === "approved" || approve.isPending} onPress={() => approve.mutate({ id: r.id })} style={[styles.approveButton, r.status === "approved" && styles.approvedButton]}><Text style={styles.approveText}>{r.status === "approved" ? "✓" : "اعتماد"}</Text></Pressable>
              </View>
            );
          })}
        </View>
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
  monthBar:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:17,padding:10,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},monthCenter:{alignItems:"center"},monthKicker:{color:"#98A6B8",fontSize:8,fontWeight:"900"},monthTitle:{color:"#172033",fontSize:14,fontWeight:"900",marginTop:2},monthButton:{width:38,height:38,borderRadius:11,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},monthButtonText:{color:"#163A63",fontSize:24,fontWeight:"700",lineHeight:27},
  kpiGrid:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},kpi:{flex:1,minWidth:150,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:16,padding:14,minHeight:82,justifyContent:"center"},kpiValue:{color:"#163A63",fontSize:18,fontWeight:"900",textAlign:"right"},kpiLabel:{color:"#667085",fontSize:9,fontWeight:"700",textAlign:"right",marginTop:5},
  actionCard:{backgroundColor:"#F3F8FD",borderWidth:1,borderColor:"#D9E9F7",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",gap:12},actionCopy:{flex:1},actionTitle:{color:"#172033",fontSize:13,fontWeight:"900",textAlign:"right"},actionText:{color:"#667085",fontSize:9,lineHeight:16,textAlign:"right",marginTop:4},primaryButton:{backgroundColor:"#163A63",borderRadius:12,paddingHorizontal:16,paddingVertical:12},primaryText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  insightGrid:{flexDirection:"row-reverse",gap:10},insight:{flex:1,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:16,padding:14},insightValue:{color:"#163A63",fontSize:16,fontWeight:"900",textAlign:"right"},insightTitle:{color:"#172033",fontSize:10,fontWeight:"900",textAlign:"right",marginTop:7},insightMeta:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:3},
  sectionHeader:{gap:10},section:{},sectionTitle:{color:"#172033",fontSize:16,fontWeight:"900",textAlign:"right"},sectionSubtitle:{color:"#98A6B8",fontSize:9,textAlign:"right",marginTop:3},filters:{flexDirection:"row-reverse",gap:7},filter:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E7ED",borderRadius:10,paddingHorizontal:12,paddingVertical:8},filterActive:{backgroundColor:"#163A63",borderColor:"#163A63"},filterText:{color:"#667085",fontSize:9,fontWeight:"800"},filterTextActive:{color:"#FFFFFF"},
  table:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,overflow:"hidden"},employeeRow:{minHeight:88,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:10,borderBottomWidth:1,borderBottomColor:"#EEF1F4"},avatar:{width:38,height:38,borderRadius:12,backgroundColor:"#EAF1F8",alignItems:"center",justifyContent:"center"},avatarText:{color:"#31577F",fontSize:10,fontWeight:"900"},employeeCopy:{flex:1},employeeName:{color:"#172033",fontSize:11,fontWeight:"900",textAlign:"right"},employeeMeta:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:4},netBox:{minWidth:110,alignItems:"flex-end"},netLabel:{color:"#98A6B8",fontSize:8},netValue:{color:"#163A63",fontSize:12,fontWeight:"900",marginTop:2},approveButton:{backgroundColor:"#163A63",borderRadius:10,paddingHorizontal:12,paddingVertical:9},approvedButton:{backgroundColor:"#EAF8F1"},approveText:{color:"#FFFFFF",fontSize:9,fontWeight:"900"},empty:{padding:35,alignItems:"center"},emptyTitle:{color:"#172033",fontSize:13,fontWeight:"900",marginTop:9},emptyText:{color:"#98A6B8",fontSize:9,marginTop:4},
  detailCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:16},row:{flexDirection:"row-reverse",justifyContent:"space-between",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#F1F4F7"},rowLabel:{color:"#667085",fontSize:10},rowValue:{color:"#172033",fontSize:11,fontWeight:"800"},rowStrong:{color:"#163A63",fontSize:14},statusCard:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",gap:10},statusIcon:{width:40,height:40,borderRadius:12,backgroundColor:"#EEF6FF",alignItems:"center",justifyContent:"center"},statusCopy:{flex:1},statusTitle:{color:"#172033",fontSize:11,fontWeight:"900",textAlign:"right"},statusText:{color:"#667085",fontSize:9,lineHeight:16,textAlign:"right",marginTop:3},state:{flex:1,alignItems:"center",justifyContent:"center",gap:12},stateText:{color:"#667085",fontSize:11}
});
