import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppDataProvider, useAppData, type Employee } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

type FormFieldProps = { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; numeric?: boolean; secure?: boolean };
function FormField({ label, value, onChangeText, placeholder, numeric, secure }: FormFieldProps) {
  return <View><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} secureTextEntry={secure} keyboardType={numeric ? "phone-pad" : "default"} style={styles.input} textAlign="right" /></View>;
}

function ManagerScreenContent() {
  const router = useRouter();
  const { role, employee, branch, requests, records, payroll, staffMembers, approveRequest, createStaffAccount, updateStaffAccount, updateBranch } = useAppData();
  const [addOpen, setAddOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [newRole, setNewRole] = useState<"manager" | "supervisor" | "employee">("employee");
  const [editShiftStart, setEditShiftStart] = useState("09:00");
  const [editShiftEnd, setEditShiftEnd] = useState("18:00");
  const [editActive, setEditActive] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchLatitude, setBranchLatitude] = useState("");
  const [branchLongitude, setBranchLongitude] = useState("");
  const [branchRadius, setBranchRadius] = useState("");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<"all" | "active" | "inactive">("all");
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const previousMonthDate = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const previousMonth = `${previousMonthDate.getFullYear()}-${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const payrollQuery = trpc.payroll.list.useQuery({ month: currentMonth }, { enabled: role === "manager", retry: false });
  const previousPayrollQuery = trpc.payroll.list.useQuery({ month: previousMonth }, { enabled: role === "manager", retry: false });
  const currentPayrollNet = (payrollQuery.data ?? []).reduce((s,r)=>s+Number(r.netSalary||0),0);
  const previousPayrollNet = (previousPayrollQuery.data ?? []).reduce((s,r)=>s+Number(r.netSalary||0),0);
  const payrollChange = previousPayrollNet > 0 ? Math.round(((currentPayrollNet - previousPayrollNet) / previousPayrollNet) * 100) : null;
  const overtimeCost = (payrollQuery.data ?? []).reduce((s,r)=>s+Number(r.overtime||0),0);
  const overtimeShare = currentPayrollNet > 0 ? Math.min(100, Math.round((overtimeCost / currentPayrollNet) * 100)) : 0;
  const attendanceTrend = useMemo(() => {
    const grouped = new Map<string, { total:number; present:number }>();
    records.forEach((r) => {
      const key = String(r.date).slice(0,10);
      const item = grouped.get(key) ?? { total:0, present:0 };
      item.total += 1;
      if (r.status === "حاضر" || r.status === "متأخر") item.present += 1;
      grouped.set(key,item);
    });
    return Array.from(grouped.entries()).sort(([a],[b])=>a.localeCompare(b)).slice(-7).map(([date,v])=>({date,rate:v.total?Math.round(v.present/v.total*100):0}));
  }, [records]);
  const pending = requests.filter((item) => item.status === "قيد المراجعة").length;
  const presentCount = records.filter((record) => record.status === "حاضر").length;
  const lateCount = records.filter((record) => record.status === "متأخر").length;
  const absentCount = records.filter((record) => record.status === "غياب").length;
  const leaveCount = records.filter((record) => record.status === "إجازة").length;
  const attendanceTotal = records.length || 1;
  const attendanceRate = Math.min(100, Math.round(((presentCount + lateCount) / attendanceTotal) * 100));
  const payrollReady = staffMembers.length > 0 && payroll.net >= 0;
  const alerts = [
    ...(pending > 0 ? [{ icon: "doc.text.fill", title: "طلبات تحتاج مراجعة", value: String(pending), tone: "warning" }] : []),
    ...(absentCount > 0 ? [{ icon: "person.fill.xmark", title: "غياب مسجل", value: String(absentCount), tone: "danger" }] : []),
    ...(lateCount > 0 ? [{ icon: "clock", title: "موظفون متأخرون", value: String(lateCount), tone: "warning" }] : []),
  ];
  const filteredTeam = useMemo(() => { const q = teamSearch.trim().toLowerCase(); return staffMembers.filter((member) => { const matchesSearch = !q || [member.name, member.phone, member.title, member.department].some((value) => String(value ?? "").toLowerCase().includes(q)); const matchesFilter = teamFilter === "all" || (teamFilter === "active" ? member.active !== false : member.active === false); return matchesSearch && matchesFilter; }); }, [staffMembers, teamSearch, teamFilter]);
  const quickActions = [
    { icon: "person.2.fill", label: "الموظفون", hint: "إدارة الفريق" },
    { icon: "calendar", label: "الجدول", hint: "تخطيط الورديات" },
    { icon: "doc.text.fill", label: "الطلبات", hint: "المراجعة والاعتماد" },
    { icon: "banknote", label: "الرواتب", hint: "حالة المسير" },
  ];

  function resetAdd() { setName(""); setPhone(""); setPassword(""); setTitle(""); setDepartment(""); setBaseSalary(""); setNewRole("employee"); }
  async function saveEmployee() {
    if (!name.trim() || !phone.trim() || password.length < 6) { showAlert("بيانات ناقصة", "اكتب الاسم ورقم الهاتف وكلمة مرور من 6 أحرف على الأقل."); return; }
    try { await createStaffAccount({ name, phone, password, title, department, baseSalary: Number(baseSalary) || 0, role: newRole }); resetAdd(); setAddOpen(false); showAlert("تم إنشاء الحساب", "أصبح الموظف يستطيع الدخول بنفس رقم الهاتف وكلمة المرور."); }
    catch (error) { showAlert("تعذر إنشاء الحساب", error instanceof Error ? error.message : "حدث خطأ غير متوقع."); }
  }
  function openEdit(member: Employee) {
    setEditEmployee(member); setName(member.name); setPhone(member.phone ?? ""); setTitle(member.title); setDepartment(member.department); setBaseSalary(String(member.baseSalary)); setPassword(""); setEditActive(member.active !== false); setEditShiftStart("09:00"); setEditShiftEnd("18:00");
  }
  async function saveEdit() {
    if (!editEmployee) return;
    if (!name.trim() || !phone.trim()) { showAlert("بيانات ناقصة", "الاسم ورقم الهاتف مطلوبان."); return; }
    try { await updateStaffAccount({ id: Number(editEmployee.id), name, phone, title, department, baseSalary: Number(baseSalary) || 0, shiftStart: editShiftStart, shiftEnd: editShiftEnd, active: editActive, ...(password ? { password } : {}) }); setEditEmployee(null); showAlert("تم الحفظ", "تم تحديث بيانات الموظف."); }
    catch (error) { showAlert("تعذر الحفظ", error instanceof Error ? error.message : "حدث خطأ غير متوقع."); }
  }
  function openBranchSettings() { setBranchName(branch.name); setBranchAddress(branch.address); setBranchLatitude(String(branch.latitude)); setBranchLongitude(String(branch.longitude)); setBranchRadius(String(branch.radiusMeters)); setBranchOpen(true); }
  async function saveBranch() {
    const radius = Number(branchRadius); if (!branchName.trim() || !branchAddress.trim() || !Number.isFinite(radius) || radius < 50) { showAlert("بيانات غير صحيحة", "اكتب اسم الفرع والعنوان ونطاقًا لا يقل عن 50 متر."); return; }
    try { await updateBranch({ name: branchName, address: branchAddress, latitude: branchLatitude, longitude: branchLongitude, radiusMeters: radius }); setBranchOpen(false); showAlert("تم الحفظ", "تم تحديث بيانات الفرع ونطاق GPS."); }
    catch (error) { showAlert("تعذر الحفظ", error instanceof Error ? error.message : "حدث خطأ غير متوقع."); }
  }
  async function reviewRequest(id: string, status: "مقبول" | "مرفوض") {
    try { await approveRequest(id, status); showAlert("تم الحفظ", status === "مقبول" ? "تمت الموافقة على الطلب." : "تم رفض الطلب."); }
    catch (error) { showAlert("تعذر حفظ القرار", error instanceof Error ? error.message : "حدث خطأ غير متوقع."); }
  }

  if (role !== "manager") return <ScreenContainer><View style={styles.denied}><IconSymbol name="person.2.fill" size={36} color="#163A63" /><Text style={styles.deniedTitle}>هذه الصفحة للمدير فقط</Text><Text style={styles.deniedText}>سجّل الدخول بحساب المدير للوصول إلى بيانات الفريق.</Text></View></ScreenContainer>;

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.executiveHero}><View style={styles.heroGlow}/><View style={styles.executiveTop}><View style={styles.executiveCopy}><Text style={styles.executiveEyebrow}>EXECUTIVE COMMAND CENTER</Text><Text style={styles.executiveTitle}>لوحة قيادة المدير</Text><Text style={styles.executiveSub}>{branch.name} · التشغيل والموظفون والرواتب في نظرة واحدة</Text></View><View style={styles.executiveIcon}><IconSymbol name="chart.bar.xaxis" size={27} color="#FFFFFF"/></View></View><View style={styles.executiveBottom}><View><Text style={styles.executiveMeta}>حالة التشغيل اليوم</Text><Text style={styles.executiveStatus}>مراقبة مباشرة</Text></View><View style={styles.executiveLive}><View style={styles.liveDot}/><Text style={styles.liveText}>LIVE</Text></View></View></View>
    <View style={styles.commandHeader}><View><Text style={styles.commandEyebrow}>MANAGER COMMAND CENTER</Text><Text style={styles.commandTitle}>مركز قيادة التشغيل</Text><Text style={styles.commandSub}>كل ما يحتاج قرارك اليوم في شاشة واحدة.</Text></View><View style={styles.liveBadge}><View style={styles.liveDot}/><Text style={styles.liveText}>LIVE</Text></View></View>
<View style={styles.managerSearchCard}><View style={styles.searchHeader}><View><Text style={styles.searchTitle}>ابحث في فريقك</Text><Text style={styles.searchHint}>اسم · رقم · وظيفة · قسم</Text></View><View style={styles.searchCount}><Text style={styles.searchCountValue}>{filteredTeam.length}</Text><Text style={styles.searchCountLabel}>نتيجة</Text></View></View><View style={styles.searchBox}><IconSymbol name="magnifyingglass" size={18} color="#667085"/><TextInput value={teamSearch} onChangeText={setTeamSearch} placeholder="ابحث عن موظف..." placeholderTextColor="#98A6B8" style={styles.searchInput} textAlign="right"/>{teamSearch ? <Pressable onPress={() => setTeamSearch("")}><Text style={styles.clearSearch}>×</Text></Pressable> : null}</View><View style={styles.searchFilters}>{([["all","الكل"],["active","نشط"],["inactive","موقوف"]] as const).map(([key,label]) => <Pressable key={key} onPress={() => setTeamFilter(key)} style={[styles.searchFilter, teamFilter === key && styles.searchFilterActive]}><Text style={[styles.searchFilterText, teamFilter === key && styles.searchFilterTextActive]}>{label}</Text></Pressable>)}</View></View>
    <View style={styles.pulseCard}>
      <View style={styles.pulseHeader}>
        <View>
          <Text style={styles.commandCardTitle}>Today Pulse</Text>
          <Text style={styles.commandCardHint}>توزيع حالة الفريق الآن</Text>
        </View>
        <View style={styles.pulseLive}><View style={styles.pulseDot}/><Text style={styles.pulseLiveText}>LIVE</Text></View>
      </View>
      <View style={styles.pulseStats}>
        <View style={styles.pulseStat}><Text style={styles.pulseNumber}>{presentCount}</Text><Text style={styles.pulseLabel}>حاضر</Text></View>
        <View style={styles.pulseStat}><Text style={[styles.pulseNumber,{color:"#B45309"}]}>{lateCount}</Text><Text style={styles.pulseLabel}>متأخر</Text></View>
        <View style={styles.pulseStat}><Text style={[styles.pulseNumber,{color:"#B42318"}]}>{absentCount}</Text><Text style={styles.pulseLabel}>غائب</Text></View>
        <View style={styles.pulseStat}><Text style={[styles.pulseNumber,{color:"#163A63"}]}>{leaveCount}</Text><Text style={styles.pulseLabel}>إجازة</Text></View>
      </View>
      <View style={styles.pulseBar}><View style={[styles.pulseSegmentPresent,{flex:Math.max(presentCount,0.01)}]}/><View style={[styles.pulseSegmentLate,{flex:Math.max(lateCount,0.01)}]}/><View style={[styles.pulseSegmentAbsent,{flex:Math.max(absentCount,0.01)}]}/><View style={[styles.pulseSegmentLeave,{flex:Math.max(leaveCount,0.01)}]}/></View>
    </View>
    <View style={styles.operationsCard}>
      <View style={styles.commandCardHeader}>
        <View><Text style={styles.commandCardTitle}>عمليات اليوم</Text><Text style={styles.commandCardHint}>مين محتاج متابعة دلوقتي</Text></View>
        <Pressable onPress={() => router.push("/schedule")} style={styles.viewAllButton}><Text style={styles.viewAllText}>فتح الجدول</Text></Pressable>
      </View>
      <View style={styles.operationRows}>
        <Pressable onPress={() => router.push("/employees")} style={styles.operationRow}><View style={[styles.operationIcon,{backgroundColor:"#ECFDF3"}]}><IconSymbol name="checkmark" size={16} color="#15803D"/></View><View style={styles.operationCopy}><Text style={styles.operationTitle}>الحضور المسجل</Text><Text style={styles.operationHint}>موظفون سجلوا حضورهم اليوم</Text></View><Text style={styles.operationValue}>{presentCount}</Text></Pressable>
        <Pressable onPress={() => router.push("/employees")} style={styles.operationRow}><View style={[styles.operationIcon,{backgroundColor:"#FFF7ED"}]}><IconSymbol name="clock" size={16} color="#B45309"/></View><View style={styles.operationCopy}><Text style={styles.operationTitle}>تأخير يحتاج متابعة</Text><Text style={styles.operationHint}>راجع الحالات المتأخرة</Text></View><Text style={[styles.operationValue,{color:"#B45309"}]}>{lateCount}</Text></Pressable>
        <Pressable onPress={() => router.push("/requests")} style={styles.operationRow}><View style={[styles.operationIcon,{backgroundColor:"#FEF2F2"}]}><IconSymbol name="doc.text.fill" size={16} color="#B42318"/></View><View style={styles.operationCopy}><Text style={styles.operationTitle}>قرارات معلقة</Text><Text style={styles.operationHint}>طلبات بانتظار اعتمادك</Text></View><Text style={[styles.operationValue,{color:"#B42318"}]}>{pending}</Text></Pressable>
      </View>
    </View>
    <View style={styles.analyticsHeader}>
      <View><Text style={styles.analyticsEyebrow}>EXECUTIVE ANALYTICS</Text><Text style={styles.analyticsTitle}>لوحة التحليل التنفيذي</Text><Text style={styles.analyticsSub}>قراءة سريعة للحضور والتأخير وتكلفة الرواتب والفرق عن الشهر الحالي.</Text></View>
      <Pressable onPress={() => router.push("/reports")} style={styles.analyticsButton}><IconSymbol name="chart.bar.fill" size={15} color="#FFFFFF"/><Text style={styles.analyticsButtonText}>التقارير الكاملة</Text></Pressable>
    </View>
    <View style={styles.analyticsKpis}>
      <View style={styles.analyticsMetric}><Text style={styles.analyticsMetricLabel}>تكلفة صافي الرواتب</Text><Text style={styles.analyticsMetricValue}>{formatMoney((payrollQuery.data ?? []).reduce((s,r)=>s+Number(r.netSalary||0),0))}</Text><Text style={styles.analyticsMetricHint}>{payrollQuery.data?.length ?? 0} مسير هذا الشهر</Text></View>
      <View style={styles.analyticsMetric}><Text style={styles.analyticsMetricLabel}>الأوفر تايم</Text><Text style={styles.analyticsMetricValue}>{formatMoney((payrollQuery.data ?? []).reduce((s,r)=>s+Number(r.overtime||0),0))}</Text><Text style={styles.analyticsMetricHint}>تكلفة إضافية</Text></View>
      <View style={styles.analyticsMetric}><Text style={styles.analyticsMetricLabel}>نسبة الحضور</Text><Text style={styles.analyticsMetricValue}>{attendanceRate}%</Text><Text style={styles.analyticsMetricHint}>{presentCount + lateCount} سجل حضور فعلي</Text></View>
      <View style={styles.analyticsMetric}><Text style={styles.analyticsMetricLabel}>دقائق التأخير</Text><Text style={styles.analyticsMetricValue}>{records.reduce((s,r)=>s+Number(r.lateMinutes||0),0)}</Text><Text style={styles.analyticsMetricHint}>{lateCount} حالة متأخرة</Text></View>
    </View>
    <View style={styles.analyticsGrid}>
      <View style={styles.analyticsCard}>
        <View style={styles.analyticsCardHead}><View><Text style={styles.analyticsCardTitle}>نبض الحضور</Text><Text style={styles.analyticsCardHint}>توزيع سجلات الفريق الحالية</Text></View><Text style={styles.analyticsCardValue}>{attendanceRate}%</Text></View>
        <View style={styles.analyticsBigTrack}><View style={[styles.analyticsBigFill,{width: attendanceRate+"%"}]}/></View>
        <View style={styles.analyticsLegend}>
          <View><Text style={styles.analyticsLegendValue}>{presentCount}</Text><Text style={styles.analyticsLegendLabel}>حاضر</Text></View>
          <View><Text style={[styles.analyticsLegendValue,{color:"#B45309"}]}>{lateCount}</Text><Text style={styles.analyticsLegendLabel}>متأخر</Text></View>
          <View><Text style={[styles.analyticsLegendValue,{color:"#B42318"}]}>{absentCount}</Text><Text style={styles.analyticsLegendLabel}>غائب</Text></View>
          <View><Text style={[styles.analyticsLegendValue,{color:"#163A63"}]}>{leaveCount}</Text><Text style={styles.analyticsLegendLabel}>إجازة</Text></View>
        </View>
      </View>
      <View style={styles.analyticsCard}>
        <View style={styles.analyticsCardHead}><View><Text style={styles.analyticsCardTitle}>الأقسام</Text><Text style={styles.analyticsCardHint}>حجم الفريق وتوزيع الموظفين</Text></View><Text style={styles.analyticsCardValue}>{staffMembers.length}</Text></View>
        <View style={styles.departmentBars}>{Array.from(new Set(staffMembers.map(m=>m.department||"عام"))).slice(0,5).map(dept=>{const count=staffMembers.filter(m=>(m.department||"عام")===dept).length; const pct=Math.round((count/Math.max(staffMembers.length,1))*100); return <View key={dept} style={styles.departmentBarRow}><View style={styles.departmentBarTop}><Text style={styles.departmentBarName}>{dept}</Text><Text style={styles.departmentBarValue}>{count}</Text></View><View style={styles.departmentBarTrack}><View style={[styles.departmentBarFill,{width:pct+"%"}]}/></View></View>})}</View>
      </View>
    </View>
    <View style={styles.executiveDeepGrid}>
      <View style={styles.deepAnalyticsCard}>
        <View style={styles.analyticsCardHead}><View><Text style={styles.analyticsCardTitle}>Month-over-Month</Text><Text style={styles.analyticsCardHint}>صافي الرواتب مقابل الشهر السابق</Text></View><Text style={styles.deepValue}>{payrollChange === null ? "—" : `${payrollChange > 0 ? "+" : ""}${payrollChange}%`}</Text></View>
        <View style={styles.comparisonRow}><View><Text style={styles.comparisonValue}>{formatMoney(currentPayrollNet)}</Text><Text style={styles.comparisonLabel}>الشهر الحالي</Text></View><View style={styles.comparisonDivider}/><View><Text style={styles.comparisonValueMuted}>{formatMoney(previousPayrollNet)}</Text><Text style={styles.comparisonLabel}>الشهر السابق</Text></View></View>
        <Text style={styles.comparisonHint}>{payrollChange === null ? "لا توجد بيانات شهر سابق للمقارنة." : payrollChange > 0 ? "ارتفاع في تكلفة صافي الرواتب مقارنة بالشهر السابق." : payrollChange < 0 ? "انخفاض في تكلفة صافي الرواتب مقارنة بالشهر السابق." : "التكلفة مستقرة مقارنة بالشهر السابق."}</Text>
      </View>
      <View style={styles.deepAnalyticsCard}>
        <View style={styles.analyticsCardHead}><View><Text style={styles.analyticsCardTitle}>Payroll vs Overtime</Text><Text style={styles.analyticsCardHint}>نسبة تكلفة الأوفر تايم من صافي الرواتب</Text></View><Text style={styles.deepValue}>{overtimeShare}%</Text></View>
        <View style={styles.analyticsBigTrack}><View style={[styles.analyticsBigFill,{width:overtimeShare+"%"}]}/></View>
        <View style={styles.comparisonRow}><View><Text style={styles.comparisonValue}>{formatMoney(overtimeCost)}</Text><Text style={styles.comparisonLabel}>Overtime</Text></View><View><Text style={styles.comparisonValue}>{formatMoney(currentPayrollNet)}</Text><Text style={styles.comparisonLabel}>صافي الرواتب</Text></View></View>
      </View>
      <View style={styles.deepAnalyticsCard}>
        <View style={styles.analyticsCardHead}><View><Text style={styles.analyticsCardTitle}>Attendance Trend</Text><Text style={styles.analyticsCardHint}>آخر 7 أيام متاحة</Text></View><Text style={styles.deepValue}>{attendanceTrend.length ? attendanceTrend[attendanceTrend.length-1].rate+"%" : "—"}</Text></View>
        <View style={styles.trendBars}>{attendanceTrend.length ? attendanceTrend.map((item)=><View key={item.date} style={styles.trendColumn}><Text style={styles.trendValue}>{item.rate}%</Text><View style={styles.trendTrack}><View style={[styles.trendFill,{height:Math.max(8,item.rate)+"%"}]}/></View><Text style={styles.trendLabel}>{item.date.slice(8,10)}</Text></View>) : <Text style={styles.analyticsCardHint}>لا توجد بيانات كافية.</Text>}</View>
      </View>
    </View>
    <View style={styles.insightStrip}>
      <View style={styles.insightStripIcon}><IconSymbol name={absentCount>0?"person.fill.xmark":"checkmark"} size={17} color={absentCount>0?"#B42318":"#15803D"}/></View>
      <View style={styles.insightStripCopy}><Text style={styles.insightStripTitle}>{absentCount>0 ? "يوجد غياب يحتاج متابعة" : "الحضور مستقر اليوم"}</Text><Text style={styles.insightStripText}>{absentCount>0 ? absentCount+" موظف مسجل كغائب حاليًا. راجع السجلات قبل إغلاق اليوم." : "لا توجد حالات غياب مسجلة في البيانات الحالية."}</Text></View>
      <Pressable onPress={() => router.push("/reports")} style={styles.insightStripAction}><Text style={styles.insightStripActionText}>تحليل أعمق ←</Text></Pressable>
    </View>
    <View style={styles.kpiGrid}>
      <View style={styles.commandKpi}><View style={styles.kpiIconBlue}><IconSymbol name="person.2.fill" size={17} color="#163A63"/></View><Text style={styles.kpiNumber}>{staffMembers.length}</Text><Text style={styles.kpiLabel}>إجمالي الموظفين</Text><Text style={styles.kpiHint}>حسابات الفريق</Text></View>
      <View style={styles.commandKpi}><View style={styles.kpiIconGreen}><IconSymbol name="checkmark" size={17} color="#15803D"/></View><Text style={styles.kpiNumber}>{presentCount}</Text><Text style={styles.kpiLabel}>حاضر اليوم</Text><Text style={styles.kpiHint}>تم تسجيل الحضور</Text></View>
      <View style={styles.commandKpi}><View style={styles.kpiIconAmber}><IconSymbol name="clock" size={17} color="#B45309"/></View><Text style={styles.kpiNumber}>{lateCount}</Text><Text style={styles.kpiLabel}>متأخر اليوم</Text><Text style={styles.kpiHint}>يحتاج متابعة</Text></View>
      <View style={styles.commandKpi}><View style={styles.kpiIconRed}><IconSymbol name="person.fill.xmark" size={17} color="#B42318"/></View><Text style={styles.kpiNumber}>{absentCount}</Text><Text style={styles.kpiLabel}>غياب</Text><Text style={styles.kpiHint}>خصومات قيد المتابعة</Text></View>
      <View style={styles.commandKpi}><View style={styles.kpiIconBlue}><IconSymbol name="calendar" size={17} color="#163A63"/></View><Text style={styles.kpiNumber}>{leaveCount}</Text><Text style={styles.kpiLabel}>إجازات</Text><Text style={styles.kpiHint}>ضمن سجلات اليوم</Text></View>
      <View style={styles.commandKpi}><View style={styles.kpiIconAmber}><IconSymbol name="doc.text.fill" size={17} color="#B45309"/></View><Text style={styles.kpiNumber}>{pending}</Text><Text style={styles.kpiLabel}>طلبات معلقة</Text><Text style={styles.kpiHint}>تحتاج قرار المدير</Text></View>
    </View>
    <View style={styles.commandGrid}>
      <View style={styles.readinessCard}><View style={styles.commandCardHeader}><View><Text style={styles.commandCardTitle}>جاهزية الرواتب</Text><Text style={styles.commandCardHint}>ملخص سريع قبل اعتماد الشهر</Text></View><View style={[styles.readyBadge,{backgroundColor: payrollReady ? "#ECFDF3" : "#FFF7ED"}]}><Text style={[styles.readyBadgeText,{color: payrollReady ? "#15803D" : "#B45309"}]}>{payrollReady ? "جاهز" : "قيد التجهيز"}</Text></View></View><View style={styles.progressTrack}><View style={[styles.progressFill,{width: payrollReady ? "100%" : "35%"}]}/></View><View style={styles.readinessRow}><Text style={styles.readinessPercent}>{payrollReady ? "100%" : "35%"}</Text><Text style={styles.readinessLabel}>حالة البيانات الحالية</Text></View></View>
      <View style={styles.todayCard}><View style={styles.commandCardHeader}><View><Text style={styles.commandCardTitle}>مؤشر الحضور</Text><Text style={styles.commandCardHint}>اليوم</Text></View><Text style={styles.attendanceRate}>{attendanceRate}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill,{width: attendanceRate + "%"}]}/></View><View style={styles.readinessRow}><Text style={styles.readinessPercent}>{presentCount + lateCount}</Text><Text style={styles.readinessLabel}>سجلات حضور</Text></View></View>
    </View>
    <View style={styles.commandGrid}>
      <View style={styles.alertCard}><View style={styles.commandCardHeader}><View><Text style={styles.commandCardTitle}>يحتاج انتباهك</Text><Text style={styles.commandCardHint}>إجراءات تشغيلية مفتوحة</Text></View><Text style={styles.alertCount}>{alerts.length}</Text></View>{alerts.length ? alerts.map((item,index)=><View key={item.title+index} style={styles.alertRow}><View style={[styles.alertIcon,item.tone==="danger" ? styles.alertDanger : styles.alertWarning]}><IconSymbol name={item.icon as any} size={15} color={item.tone==="danger" ? "#B42318" : "#B45309"}/></View><View style={styles.alertCopy}><Text style={styles.alertTitle}>{item.title}</Text><Text style={styles.alertHint}>افتح القسم وراجع التفاصيل</Text></View><Text style={styles.alertValue}>{item.value}</Text></View>) : <View style={styles.clearState}><IconSymbol name="checkmark" size={19} color="#15803D"/><Text style={styles.clearText}>كل شيء تحت السيطرة حاليًا.</Text></View>}</View>
      <View style={styles.quickCard}><View style={styles.commandCardHeader}><View><Text style={styles.commandCardTitle}>وصول سريع</Text><Text style={styles.commandCardHint}>المهام اليومية للمدير</Text></View></View>{quickActions.map((item)=><Pressable key={item.label} onPress={() => router.push(item.label === "الموظفون" ? "/employees" : item.label === "الجدول" ? "/schedule" : item.label === "الطلبات" ? "/requests" : "/payroll")} style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]} accessibilityRole="button"><View style={styles.quickActionIcon}><IconSymbol name={item.icon as any} size={15} color="#163A63"/></View><View style={styles.quickActionCopy}><Text style={styles.quickActionTitle}>{item.label}</Text><Text style={styles.quickActionHint}>{item.hint}</Text></View><Text style={styles.quickArrow}>‹</Text></Pressable>)}</View>
    </View>
    <View style={styles.approvalInbox}>
      <View style={styles.approvalHeader}>
        <View><Text style={styles.approvalTitle}>صندوق قرارات المدير</Text><Text style={styles.approvalHint}>طلبات تحتاج قرارًا الآن</Text></View>
        <Pressable onPress={() => router.push("/requests")} style={styles.approvalViewAll}><Text style={styles.approvalViewAllText}>عرض الكل</Text></Pressable>
      </View>
      {requests.filter((item) => item.status === "قيد المراجعة").slice(0, 4).map((item) => (
        <View key={item.id} style={styles.approvalItem}>
          <View style={styles.approvalAvatar}><Text style={styles.approvalAvatarText}>{String((item as any).staffName ?? "مو").split(" ").slice(0,2).map((x:string)=>x[0] ?? "").join("")}</Text></View>
          <View style={styles.approvalCopy}><Text style={styles.approvalName}>{(item as any).staffName ?? "موظف"}</Text><Text style={styles.approvalType}>{item.type} · {item.from}{item.to !== item.from ? " — " + item.to : ""}</Text></View>
          <View style={styles.approvalActions}>
            <Pressable disabled={approvalBusy === String(item.id)} onPress={async()=>{setApprovalBusy(String(item.id));try{await approveRequest(String(item.id),"مقبول");showAlert("تم الاعتماد","تم اعتماد الطلب وإبلاغ الموظف.");}catch(error){showAlert("تعذر الاعتماد",error instanceof Error?error.message:"حدث خطأ أثناء اعتماد الطلب.");}finally{setApprovalBusy(null);}}} style={styles.approveMini}><Text style={styles.approveMiniText}>اعتماد</Text></Pressable>
            <Pressable disabled={approvalBusy === String(item.id)} onPress={async()=>{setApprovalBusy(String(item.id));try{await approveRequest(String(item.id),"مرفوض");showAlert("تم الرفض","تم رفض الطلب وإبلاغ الموظف.");}catch(error){showAlert("تعذر الرفض",error instanceof Error?error.message:"حدث خطأ أثناء رفض الطلب.");}finally{setApprovalBusy(null);}}} style={styles.rejectMini}><Text style={styles.rejectMiniText}>رفض</Text></Pressable>
          </View>
        </View>
      ))}
      {pending === 0 ? <View style={styles.approvalEmpty}><IconSymbol name="checkmark.circle.fill" size={18} color="#15803D" /><Text style={styles.approvalEmptyText}>لا توجد قرارات معلقة — كل الطلبات محدثة.</Text></View> : null}
    </View>
    <View style={styles.managerHero}><View style={styles.heroTop}><View style={styles.heroIcon}><IconSymbol name="chart.bar" size={25} color="#FFFFFF" /></View><View style={styles.heroText}><Text style={styles.heroEyebrow}>OPERATIONS OVERVIEW</Text><Text style={styles.heroTitle}>الفريق شغال بشكل مستقر</Text><Text style={styles.heroHint}>تابع الحضور والطلبات والرواتب من لوحة واحدة.</Text></View></View><View style={styles.heroMetrics}><View><Text style={styles.heroMetricValue}>{staffMembers.length}</Text><Text style={styles.heroMetricLabel}>موظف</Text></View><View><Text style={styles.heroMetricValue}>{presentCount > 0 ? "1" : "0"}</Text><Text style={styles.heroMetricLabel}>حاضر اليوم</Text></View><View><Text style={styles.heroMetricValue}>{pending}</Text><Text style={styles.heroMetricLabel}>طلبات معلقة</Text></View></View></View>
    <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>الفريق</Text><Text style={styles.sectionHint}>{staffMembers.length} حساب · إدارة الصلاحيات والبيانات</Text></View><Pressable onPress={() => { resetAdd(); setAddOpen(true); }} style={styles.addButton}><IconSymbol name="person.2.fill" size={15} color="#FFFFFF" /><Text style={styles.addButtonText}>إضافة موظف</Text></Pressable></View>
    {filteredTeam.map((member) => <Pressable key={member.id} onPress={() => router.push(("/employee/" + member.id) as never)} style={styles.employeeCard}><View style={styles.employeeAvatar}><Text style={styles.employeeAvatarText}>{member.initials}</Text></View><View style={styles.employeeMain}><Text style={styles.employeeName}>{member.name}</Text><Text style={styles.employeeRole}>{member.title} · {member.department}</Text><Text style={styles.employeePhone}>{member.phone}</Text></View><View style={styles.employeeActions}><View style={[styles.statusDot, { backgroundColor: member.active ? "#163A63" : "#667085" }]} /><Text style={styles.statusLabel}>{member.active ? "نشط" : "موقوف"}</Text><Pressable onPress={() => openEdit(member)} style={styles.editButton}><Text style={styles.editButtonText}>تعديل</Text></Pressable></View></Pressable>)}
    {filteredTeam.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyText}>لا توجد نتائج مطابقة للبحث الحالي.</Text></View>}
    {staffMembers.length === 0 && <View style={styles.emptyCard}><Text style={styles.emptyText}>لم تضف موظفين بعد. ابدأ بإضافة أول حساب للاستاف.</Text></View>}
    <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>طلبات تحتاج مراجعة</Text><Text style={styles.sectionHint}>الإجراءات التي تحتاج قرار المدير</Text></View><View style={styles.pendingPill}><Text style={styles.pendingPillText}>{pending} جديد</Text></View></View>
    {requests.filter((item) => item.status === "قيد المراجعة").map((request) => <View key={request.id} style={styles.requestCard}><View style={styles.requestHeader}><Text style={styles.requestType}>{request.type}</Text><Text style={styles.requestDate}>{request.type === "أوفر تايم" ? `${request.from} · ${request.hours ?? 0} ساعة` : request.from}</Text></View><Text style={styles.requestReason}>{request.reason}</Text><View style={styles.actions}><Pressable onPress={() => reviewRequest(request.id, "مرفوض")} style={styles.rejectButton}><Text style={styles.rejectText}>رفض</Text></Pressable><Pressable onPress={() => reviewRequest(request.id, "مقبول")} style={styles.approveButton}><Text style={styles.approveText}>موافقة</Text></Pressable></View></View>)}
    {pending === 0 && <View style={styles.emptyCard}><IconSymbol name="checkmark" size={24} color="#163A63" /><Text style={styles.emptyText}>لا توجد طلبات معلقة.</Text></View>}
    <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>إعدادات الفرع</Text><Text style={styles.sectionHint}>الموقع ونطاق تسجيل الحضور</Text></View><Pressable onPress={openBranchSettings} style={styles.iconButton}><IconSymbol name="settings" size={19} color="#163A63" /></Pressable></View>
    <Pressable onPress={openBranchSettings} style={styles.branchCard}><View style={styles.branchTop}><View style={styles.locationIcon}><IconSymbol name="location" size={21} color="#163A63" /></View><View style={styles.branchMain}><Text style={styles.branchName}>{branch.name}</Text><Text style={styles.branchAddress}>{branch.address}</Text></View><Text style={styles.changeText}>تعديل</Text></View><View style={styles.radiusRow}><View><Text style={styles.radiusLabel}>نطاق تسجيل الحضور</Text><Text style={styles.radiusHint}>الموظف يجب أن يكون داخله</Text></View><View style={styles.radiusValue}><Text style={styles.radiusNumber}>{branch.radiusMeters}</Text><Text style={styles.radiusUnit}>متر</Text></View></View></Pressable>
    <View style={styles.sectionTitleRow}><View><Text style={styles.sectionTitle}>مسير المرتب المبدئي</Text><Text style={styles.sectionHint}>ملخص سريع قبل إقفال الشهر</Text></View><Text style={styles.sectionLink}>سبتمبر 2026</Text></View><View style={styles.payrollCard}><View style={styles.payrollTop}><View style={styles.payrollIcon}><IconSymbol name="banknote" size={19} color="#FFFFFF" /></View><Text style={styles.payrollTopLabel}>PAYROLL SNAPSHOT</Text></View><Text style={styles.payrollLabel}>صافي {employee.name}</Text><Text style={styles.payrollValue}>{formatMoney(payroll.net)}</Text><View style={styles.payrollDetails}><Text style={styles.detailText}>أساسي {formatMoney(employee.baseSalary)}</Text><Text style={styles.detailText}>خصومات {formatMoney(payroll.totalDeductions)}</Text></View></View>
  </ScrollView>
  <Modal visible={addOpen || Boolean(editEmployee)} transparent animationType="slide" onRequestClose={() => { setAddOpen(false); setEditEmployee(null); }}><View style={styles.modalBackdrop}><View style={styles.modal}><ScrollView><View style={styles.modalHeader}><Pressable onPress={() => { setAddOpen(false); setEditEmployee(null); }}><Text style={styles.close}>إلغاء</Text></Pressable><Text style={styles.modalTitle}>{editEmployee ? "تعديل بيانات الموظف" : "إضافة موظف"}</Text></View><Text style={styles.modalHint}>{editEmployee ? "غيّر البيانات ثم اضغط حفظ." : "أنت تنشئ الحساب، والموظف يستخدم البيانات للدخول."}</Text><FormField label="الاسم" value={name} onChangeText={setName} placeholder="اسم الموظف" /><FormField label="رقم الهاتف" value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" numeric /><FormField label={editEmployee ? "كلمة مرور جديدة (اختياري)" : "كلمة المرور المؤقتة"} value={password} onChangeText={setPassword} placeholder="6 أحرف على الأقل" secure /><FormField label="الوظيفة" value={title} onChangeText={setTitle} placeholder="مثال: مسؤول مبيعات" /><FormField label="القسم" value={department} onChangeText={setDepartment} placeholder="مثال: المبيعات" /><FormField label="المرتب الأساسي" value={baseSalary} onChangeText={setBaseSalary} placeholder="12000" numeric />{!editEmployee && <View style={styles.roleSelector}><Text style={styles.fieldLabel}>نوع الحساب والصلاحية</Text><View style={styles.roleButtons}>{(["manager", "supervisor", "employee"] as const).map(item => <Pressable key={item} onPress={() => setNewRole(item)} style={[styles.roleButton, newRole === item && styles.roleButtonActive]}><Text style={[styles.roleButtonText, newRole === item && styles.roleButtonTextActive]}>{item === "manager" ? "مدير" : item === "supervisor" ? "سوبرفايزر" : "موظف عادي"}</Text></Pressable>)}</View></View>}{editEmployee && <><View style={styles.shiftRow}><View style={styles.shiftField}><FormField label="بداية الوردية" value={editShiftStart} onChangeText={setEditShiftStart} placeholder="09:00" /></View><View style={styles.shiftField}><FormField label="نهاية الوردية" value={editShiftEnd} onChangeText={setEditShiftEnd} placeholder="18:00" /></View></View><Pressable onPress={() => setEditActive(!editActive)} style={styles.activeToggle}><View style={[styles.toggle, editActive && styles.toggleOn]}><View style={[styles.toggleKnob, editActive && styles.toggleKnobOn]} /></View><Text style={styles.toggleText}>{editActive ? "الحساب نشط ويستطيع الدخول" : "الحساب موقوف"}</Text></Pressable></>}<Pressable onPress={editEmployee ? saveEdit : saveEmployee} style={styles.submitButton}><Text style={styles.submitText}>{editEmployee ? "حفظ التعديلات" : "إنشاء حساب الموظف"}</Text></Pressable></ScrollView></View></View></Modal>
  <Modal visible={branchOpen} transparent animationType="slide" onRequestClose={() => setBranchOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><ScrollView><View style={styles.modalHeader}><Pressable onPress={() => setBranchOpen(false)}><Text style={styles.close}>إلغاء</Text></Pressable><Text style={styles.modalTitle}>تعديل إعدادات الفرع</Text></View><Text style={styles.modalHint}>هذه البيانات تستخدم للتحقق من موقع الموظف وقت الحضور.</Text><FormField label="اسم الفرع" value={branchName} onChangeText={setBranchName} placeholder="الفرع الرئيسي" /><FormField label="العنوان" value={branchAddress} onChangeText={setBranchAddress} placeholder="العنوان بالتفصيل" /><View style={styles.shiftRow}><View style={styles.shiftField}><FormField label="خط العرض Latitude" value={branchLatitude} onChangeText={setBranchLatitude} placeholder="30.0444" /></View><View style={styles.shiftField}><FormField label="خط الطول Longitude" value={branchLongitude} onChangeText={setBranchLongitude} placeholder="31.2357" /></View></View><FormField label="نطاق GPS بالمتر" value={branchRadius} onChangeText={setBranchRadius} placeholder="200" numeric /><Pressable onPress={saveBranch} style={styles.submitButton}><Text style={styles.submitText}>حفظ إعدادات الفرع</Text></Pressable></ScrollView></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  analyticsHeader:{backgroundColor:"#163A63",borderRadius:22,padding:20,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:14,marginTop:4},
  analyticsEyebrow:{color:"#A9C7E3",fontSize:9,fontWeight:"900",letterSpacing:1,textAlign:"right"},
  analyticsTitle:{color:"#FFFFFF",fontSize:21,fontWeight:"900",textAlign:"right",marginTop:4},
  analyticsSub:{color:"#D9E6F2",fontSize:10,lineHeight:18,textAlign:"right",marginTop:5,maxWidth:650},
  analyticsButton:{backgroundColor:"#1677D2",borderRadius:11,paddingHorizontal:13,paddingVertical:10,flexDirection:"row-reverse",alignItems:"center",gap:6},
  analyticsButtonText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  analyticsKpis:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},
  analyticsMetric:{flex:1,minWidth:190,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E4E7EC",borderRadius:17,padding:15},
  analyticsMetricLabel:{color:"#667085",fontSize:10,fontWeight:"800",textAlign:"right"},
  analyticsMetricValue:{color:"#163A63",fontSize:20,fontWeight:"900",textAlign:"right",marginTop:7},
  analyticsMetricHint:{color:"#98A6B8",fontSize:9,textAlign:"right",marginTop:4},
  executiveDeepGrid:{flexDirection:"row-reverse",gap:12,flexWrap:"wrap"},
  deepAnalyticsCard:{flex:1,minWidth:260,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E4E7EC",borderRadius:20,padding:16},
  deepValue:{color:"#163A63",fontSize:22,fontWeight:"900"},
  comparisonRow:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:12,marginTop:18},
  comparisonValue:{color:"#172033",fontSize:15,fontWeight:"900",textAlign:"right"},
  comparisonValueMuted:{color:"#667085",fontSize:13,fontWeight:"800",textAlign:"right"},
  comparisonLabel:{color:"#98A2B3",fontSize:9,marginTop:3,textAlign:"right"},
  comparisonDivider:{width:1,height:34,backgroundColor:"#E4E7EC"},
  comparisonHint:{color:"#667085",fontSize:10,lineHeight:16,textAlign:"right",marginTop:14},
  trendBars:{height:120,flexDirection:"row-reverse",alignItems:"flex-end",justifyContent:"space-around",gap:6,marginTop:14},
  trendColumn:{flex:1,height:"100%",alignItems:"center",justifyContent:"flex-end",gap:4},
  trendValue:{color:"#667085",fontSize:8,fontWeight:"800"},
  trendTrack:{height:82,width:18,backgroundColor:"#EEF4FB",borderRadius:8,justifyContent:"flex-end",overflow:"hidden"},
  trendFill:{width:"100%",backgroundColor:"#1677D2",borderRadius:8},
  trendLabel:{color:"#98A2B3",fontSize:8},
  analyticsGrid:{flexDirection:"row-reverse",gap:12,flexWrap:"wrap"},
  analyticsCard:{flex:1,minWidth:320,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E4E7EC",borderRadius:19,padding:18},
  analyticsCardHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-start"},
  analyticsCardTitle:{color:"#172033",fontSize:15,fontWeight:"900",textAlign:"right"},
  analyticsCardHint:{color:"#667085",fontSize:9,textAlign:"right",marginTop:3},
  analyticsCardValue:{color:"#163A63",fontSize:22,fontWeight:"900"},
  analyticsBigTrack:{height:13,borderRadius:8,backgroundColor:"#EEF2F6",overflow:"hidden",marginTop:22},
  analyticsBigFill:{height:"100%",backgroundColor:"#1677D2",borderRadius:8},
  analyticsLegend:{flexDirection:"row-reverse",justifyContent:"space-between",marginTop:18},
  analyticsLegendValue:{color:"#15803D",fontSize:17,fontWeight:"900",textAlign:"right"},
  analyticsLegendLabel:{color:"#667085",fontSize:9,textAlign:"right",marginTop:2},
  departmentBars:{gap:12,marginTop:17},
  departmentBarRow:{gap:5},
  departmentBarTop:{flexDirection:"row-reverse",justifyContent:"space-between"},
  departmentBarName:{color:"#344054",fontSize:10,fontWeight:"800"},
  departmentBarValue:{color:"#163A63",fontSize:10,fontWeight:"900"},
  departmentBarTrack:{height:7,borderRadius:7,backgroundColor:"#EEF2F6",overflow:"hidden"},
  departmentBarFill:{height:"100%",backgroundColor:"#163A63",borderRadius:7},
  insightStrip:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#E4E7EC",borderRadius:17,padding:14,flexDirection:"row-reverse",alignItems:"center",gap:11},
  insightStripIcon:{width:36,height:36,borderRadius:12,backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},
  insightStripCopy:{flex:1},
  insightStripTitle:{color:"#172033",fontSize:12,fontWeight:"900",textAlign:"right"},
  insightStripText:{color:"#667085",fontSize:9,lineHeight:16,textAlign:"right",marginTop:3},
  insightStripAction:{paddingHorizontal:9,paddingVertical:7},
  insightStripActionText:{color:"#163A63",fontSize:10,fontWeight:"900"},
  approvalInbox:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E6ECF2",borderRadius:22,padding:17,gap:11,shadowColor:"#0F2742",shadowOpacity:0.04,shadowRadius:12,elevation:1},
  approvalHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  approvalTitle:{color:"#172033",fontSize:17,fontWeight:"900",textAlign:"right"},
  approvalHint:{color:"#98A6B8",fontSize:10,marginTop:3,textAlign:"right"},
  approvalViewAll:{backgroundColor:"#F2F6FA",borderRadius:10,paddingHorizontal:10,paddingVertical:7},
  approvalViewAllText:{color:"#31577F",fontSize:10,fontWeight:"800"},
  approvalItem:{flexDirection:"row-reverse",alignItems:"center",gap:9,borderTopWidth:1,borderTopColor:"#EEF2F6",paddingTop:11},
  approvalAvatar:{width:34,height:34,borderRadius:12,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},
  approvalAvatarText:{color:"#163A63",fontSize:10,fontWeight:"900"},
  approvalCopy:{flex:1},
  approvalName:{color:"#172033",fontSize:12,fontWeight:"800",textAlign:"right"},
  approvalType:{color:"#667085",fontSize:9,marginTop:3,textAlign:"right"},
  approvalActions:{flexDirection:"row",gap:5},
  approveMini:{backgroundColor:"#163A63",borderRadius:9,paddingHorizontal:9,paddingVertical:7},
  approveMiniText:{color:"#FFFFFF",fontSize:9,fontWeight:"800"},
  rejectMini:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#DDE4EC",borderRadius:9,paddingHorizontal:9,paddingVertical:7},
  rejectMiniText:{color:"#667085",fontSize:9,fontWeight:"800"},
  approvalEmpty:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:7,paddingVertical:8},
  approvalEmptyText:{color:"#667085",fontSize:10},

  executiveHero:{backgroundColor:"#102A43",borderRadius:26,padding:20,overflow:"hidden",gap:18},
  heroGlow:{position:"absolute",width:180,height:180,borderRadius:90,backgroundColor:"#1F4E79",right:-60,top:-70,opacity:.5},
  executiveTop:{flexDirection:"row-reverse",alignItems:"center",gap:14},
  executiveCopy:{flex:1},
  executiveEyebrow:{color:"#9FC5E8",fontSize:9,fontWeight:"900",letterSpacing:1.2,textAlign:"right"},
  executiveTitle:{color:"#FFFFFF",fontSize:25,fontWeight:"900",marginTop:5,textAlign:"right"},
  executiveSub:{color:"#D5E3EF",fontSize:11,marginTop:6,textAlign:"right"},
  executiveIcon:{width:58,height:58,borderRadius:18,backgroundColor:"rgba(255,255,255,.12)",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"rgba(255,255,255,.14)"},
  executiveBottom:{borderTopWidth:1,borderTopColor:"rgba(255,255,255,.12)",paddingTop:14,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  executiveMeta:{color:"#9FB4C8",fontSize:9,textAlign:"right"}, executiveStatus:{color:"#FFFFFF",fontSize:12,fontWeight:"800",marginTop:3,textAlign:"right"},
  executiveLive:{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"rgba(255,255,255,.09)",paddingHorizontal:9,paddingVertical:6,borderRadius:99},
  liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#6EE7B7"},liveText:{color:"#FFFFFF",fontSize:9,fontWeight:"900",letterSpacing:1},
  commandHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},commandEyebrow:{color:"#7A8EA3",fontSize:9,fontWeight:"900",letterSpacing:1,textAlign:"right"},commandTitle:{color:"#172033",fontSize:21,fontWeight:"900",marginTop:3,textAlign:"right"},commandSub:{color:"#667085",fontSize:10,marginTop:3,textAlign:"right"},
  liveBadge:{flexDirection:"row",alignItems:"center",gap:6,borderWidth:1,borderColor:"#D9E6F2",paddingHorizontal:9,paddingVertical:6,borderRadius:99},
  kpiGrid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:10},commandKpi:{width:"31.8%",minWidth:150,backgroundColor:"#FFFFFF",borderRadius:18,padding:14,borderWidth:1,borderColor:"#E8EDF3",gap:5},kpiIconBlue:{width:32,height:32,borderRadius:10,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},kpiIconGreen:{width:32,height:32,borderRadius:10,backgroundColor:"#ECFDF3",alignItems:"center",justifyContent:"center"},kpiIconAmber:{width:32,height:32,borderRadius:10,backgroundColor:"#FFF7ED",alignItems:"center",justifyContent:"center"},kpiIconRed:{width:32,height:32,borderRadius:10,backgroundColor:"#FEF2F2",alignItems:"center",justifyContent:"center"},kpiNumber:{color:"#172033",fontSize:23,fontWeight:"900",textAlign:"right"},kpiLabel:{color:"#344054",fontSize:10,fontWeight:"800",textAlign:"right"},kpiHint:{color:"#98A6B8",fontSize:9,textAlign:"right"},
  commandGrid:{flexDirection:"row-reverse",gap:12,flexWrap:"wrap"},readinessCard:{flex:1,minWidth:300,backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},todayCard:{flex:1,minWidth:300,backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},commandCardHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},commandCardTitle:{color:"#172033",fontSize:14,fontWeight:"900",textAlign:"right"},commandCardHint:{color:"#98A6B8",fontSize:9,marginTop:3,textAlign:"right"},readyBadge:{borderRadius:99,paddingHorizontal:9,paddingVertical:5},readyBadgeText:{fontSize:9,fontWeight:"900"},progressTrack:{height:8,backgroundColor:"#EEF2F6",borderRadius:99,overflow:"hidden",marginTop:16},progressFill:{height:"100%",backgroundColor:"#163A63",borderRadius:99},readinessRow:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",marginTop:8},readinessPercent:{color:"#163A63",fontSize:11,fontWeight:"900"},readinessLabel:{color:"#667085",fontSize:9},attendanceRate:{color:"#163A63",fontSize:23,fontWeight:"900"},
  pulseCard:{backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},pulseLive:{flexDirection:"row",alignItems:"center",gap:5,backgroundColor:"#ECFDF3",paddingHorizontal:8,paddingVertical:5,borderRadius:99},pulseDot:{width:6,height:6,borderRadius:3,backgroundColor:"#15803D"},pulseLiveText:{color:"#15803D",fontSize:8,fontWeight:"900"},pulseStats:{flexDirection:"row-reverse",justifyContent:"space-between",marginTop:16},pulseStat:{flex:1,alignItems:"center",borderLeftWidth:1,borderLeftColor:"#EEF2F6"},pulseNumber:{color:"#15803D",fontSize:22,fontWeight:"900"},pulseLabel:{color:"#667085",fontSize:9,marginTop:3},pulseBar:{height:9,borderRadius:99,overflow:"hidden",flexDirection:"row-reverse",marginTop:15,backgroundColor:"#F7F9FC"},pulseSegmentPresent:{backgroundColor:"#15803D"},pulseSegmentLate:{backgroundColor:"#F59E0B"},pulseSegmentAbsent:{backgroundColor:"#B42318"},pulseSegmentLeave:{backgroundColor:"#163A63"},
  operationsCard:{backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},viewAllButton:{backgroundColor:"#EEF4FB",paddingHorizontal:10,paddingVertical:6,borderRadius:9},viewAllText:{color:"#163A63",fontSize:9,fontWeight:"900"},operationRows:{marginTop:8},operationRow:{flexDirection:"row-reverse",alignItems:"center",paddingVertical:10,borderTopWidth:1,borderTopColor:"#F2F5F8",gap:10},operationIcon:{width:34,height:34,borderRadius:10,alignItems:"center",justifyContent:"center"},operationCopy:{flex:1},operationTitle:{color:"#344054",fontSize:11,fontWeight:"800",textAlign:"right"},operationHint:{color:"#98A6B8",fontSize:9,marginTop:2,textAlign:"right"},operationValue:{color:"#15803D",fontSize:18,fontWeight:"900",minWidth:25,textAlign:"center"},
  alertCard:{flex:1,minWidth:300,backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},quickCard:{flex:1,minWidth:300,backgroundColor:"#FFFFFF",borderRadius:20,padding:16,borderWidth:1,borderColor:"#E8EDF3"},alertCount:{color:"#B42318",fontSize:20,fontWeight:"900"},alertRow:{flexDirection:"row-reverse",alignItems:"center",gap:9,paddingVertical:9,borderTopWidth:1,borderTopColor:"#F2F5F8"},alertIcon:{width:32,height:32,borderRadius:10,alignItems:"center",justifyContent:"center"},alertDanger:{backgroundColor:"#FEF2F2"},alertWarning:{backgroundColor:"#FFF7ED"},alertCopy:{flex:1},alertTitle:{color:"#344054",fontSize:11,fontWeight:"800",textAlign:"right"},alertHint:{color:"#98A6B8",fontSize:8,marginTop:2,textAlign:"right"},alertValue:{color:"#172033",fontSize:17,fontWeight:"900"},clearState:{alignItems:"center",padding:16,gap:6},clearText:{color:"#15803D",fontSize:10,fontWeight:"800"},
  quickAction:{flexDirection:"row-reverse",alignItems:"center",gap:9,paddingVertical:9,borderTopWidth:1,borderTopColor:"#F2F5F8"},quickActionIcon:{width:32,height:32,borderRadius:10,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},quickActionCopy:{flex:1},quickActionTitle:{color:"#344054",fontSize:11,fontWeight:"800",textAlign:"right"},quickActionHint:{color:"#98A6B8",fontSize:8,marginTop:2,textAlign:"right"},quickArrow:{color:"#98A6B8",fontSize:20},
 managerSearchCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E8EDF3", padding: 15, gap: 10 }, searchHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, searchTitle: { color: "#172033", fontSize: 16, fontWeight: "900", textAlign: "right" }, searchHint: { color: "#98A6B8", fontSize: 10, marginTop: 3, textAlign: "right" }, searchCount: { backgroundColor: "#EEF4FB", borderRadius: 12, minWidth: 48, paddingVertical: 6, alignItems: "center" }, searchCountValue: { color: "#163A63", fontSize: 16, fontWeight: "900" }, searchCountLabel: { color: "#667085", fontSize: 8 }, searchBox: { minHeight: 46, borderWidth: 1, borderColor: "#D9E6F2", borderRadius: 13, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 8 }, searchInput: { flex: 1, color: "#172033", fontSize: 12, paddingVertical: 10 }, clearSearch: { color: "#667085", fontSize: 22, lineHeight: 22 }, searchFilters: { flexDirection: "row-reverse", gap: 7 }, searchFilter: { backgroundColor: "#F7F9FC", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 }, searchFilterActive: { backgroundColor: "#163A63" }, searchFilterText: { color: "#667085", fontSize: 10, fontWeight: "800" }, searchFilterTextActive: { color: "#FFFFFF" }, searchEmpty: { backgroundColor: "#F7F9FC", borderRadius: 16, padding: 20, alignItems: "center", gap: 5 }, searchEmptyTitle: { color: "#172033", fontSize: 13, fontWeight: "900" }, searchEmptyText: { color: "#667085", fontSize: 10 }, quickActionPressed: { opacity: 0.72, transform: [{ scale: 0.985 }] }, headerCopy: { flex: 1 }, managerHero: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 19, overflow: "hidden" }, heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 }, heroIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" }, heroText: { flex: 1 }, heroEyebrow: { color: "#31577F", fontSize: 9, fontWeight: "800", letterSpacing: 1, textAlign: "right" }, heroTitle: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginTop: 4, textAlign: "right" }, heroHint: { color: "#667085", fontSize: 11, marginTop: 5, textAlign: "right" }, heroMetrics: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)", marginTop: 17, paddingTop: 15, flexDirection: "row-reverse", justifyContent: "space-around" }, heroMetricValue: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", textAlign: "center" }, heroMetricLabel: { color: "#667085", fontSize: 10, marginTop: 3, textAlign: "center" }, sectionHint: { color: "#667085", fontSize: 10, marginTop: 3, textAlign: "right" }, pendingPill: { backgroundColor: "#F2F5F8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, pendingPillText: { color: "#163A63", fontSize: 10, fontWeight: "800" }, iconButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F2F5F8", alignItems: "center", justifyContent: "center" }, payrollTop: { flexDirection: "row-reverse", alignItems: "center", gap: 8 }, payrollIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }, payrollTopLabel: { color: "#D9E6F2", fontSize: 9, fontWeight: "800", letterSpacing: 1 }, content: { padding: 20, paddingBottom: 40, gap: 17 }, header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: "#667085", fontSize: 13, textAlign: "right" }, title: { color: "#172033", fontSize: 27, fontWeight: "800", marginTop: 5, textAlign: "right" }, subtitle: { color: "#667085", fontSize: 12, marginTop: 5, textAlign: "right" }, managerBadge: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#EEF4FB", justifyContent: "center", alignItems: "center" }, kpiRow: { flexDirection: "row-reverse", gap: 10 }, kpi: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 17, padding: 14, borderWidth: 1, borderColor: "#F2F5F8" }, kpiValue: { color: "#163A63", fontSize: 23, fontWeight: "800", textAlign: "right" }, kpiLabel: { color: "#667085", fontSize: 11, marginTop: 5, textAlign: "right" }, sectionTitleRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 2 }, sectionTitle: { color: "#172033", fontSize: 18, fontWeight: "800", textAlign: "right" }, sectionLink: { color: "#163A63", fontSize: 12, fontWeight: "700" }, addButton: { backgroundColor: "#163A63", borderRadius: 11, paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", gap: 5 }, addButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, employeeCard: { backgroundColor: "#FFFFFF", borderRadius: 19, padding: 14, flexDirection: "row-reverse", alignItems: "center", borderWidth: 1, borderColor: "#F2F5F8", gap: 10 }, employeeAvatar: { width: 45, height: 45, borderRadius: 15, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" }, employeeAvatarText: { color: "#FFFFFF", fontWeight: "800" }, employeeMain: { flex: 1 }, employeeName: { color: "#172033", fontSize: 14, fontWeight: "800", textAlign: "right" }, employeeRole: { color: "#667085", fontSize: 11, marginTop: 4, textAlign: "right" }, employeePhone: { color: "#667085", fontSize: 10, marginTop: 4, textAlign: "right" }, employeeActions: { alignItems: "flex-end", gap: 4 }, statusDot: { width: 9, height: 9, borderRadius: 5 }, statusLabel: { color: "#667085", fontSize: 10 }, editButton: { borderWidth: 1, borderColor: "#D9E6F2", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 3 }, editButtonText: { color: "#163A63", fontSize: 10, fontWeight: "800" }, requestCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 15, borderWidth: 1, borderColor: "#F2F5F8" }, requestHeader: { flexDirection: "row-reverse", justifyContent: "space-between" }, requestType: { color: "#172033", fontWeight: "800", fontSize: 14 }, requestDate: { color: "#667085", fontSize: 11 }, requestReason: { color: "#667085", fontSize: 12, textAlign: "right", marginTop: 7 }, actions: { flexDirection: "row-reverse", gap: 9, marginTop: 13 }, approveButton: { backgroundColor: "#163A63", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8 }, approveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" }, rejectButton: { borderWidth: 1, borderColor: "#0F2742", borderRadius: 10, paddingHorizontal: 15, paddingVertical: 8 }, rejectText: { color: "#0F2742", fontSize: 11, fontWeight: "800" }, emptyCard: { backgroundColor: "#EAF1F8", borderRadius: 15, padding: 15, flexDirection: "row-reverse", gap: 8, alignItems: "center" }, emptyText: { color: "#163A63", fontSize: 12, textAlign: "right", flex: 1 }, branchCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#F2F5F8", borderRadius: 18, padding: 15 }, branchTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10 }, locationIcon: { backgroundColor: "#EEF4FB", width: 40, height: 40, borderRadius: 13, justifyContent: "center", alignItems: "center" }, branchMain: { flex: 1 }, branchName: { color: "#172033", fontWeight: "800", fontSize: 14, textAlign: "right" }, branchAddress: { color: "#667085", fontSize: 11, marginTop: 4, textAlign: "right" }, changeText: { color: "#163A63", fontSize: 10, fontWeight: "800" }, radiusRow: { borderTopWidth: 1, borderTopColor: "#F7F9FC", marginTop: 14, paddingTop: 13, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, radiusLabel: { color: "#98A6B8", fontSize: 12, fontWeight: "700", textAlign: "right" }, radiusHint: { color: "#667085", fontSize: 10, marginTop: 3, textAlign: "right" }, radiusValue: { flexDirection: "row-reverse", alignItems: "center", gap: 4 }, radiusNumber: { color: "#163A63", fontSize: 18, fontWeight: "800" }, radiusUnit: { color: "#667085", fontSize: 11 }, payrollCard: { backgroundColor: "#163A63", borderRadius: 20, padding: 17 }, payrollLabel: { color: "#D9E6F2", fontSize: 12, textAlign: "right" }, payrollValue: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", textAlign: "right", marginTop: 3 }, payrollDetails: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", marginTop: 12, paddingTop: 11, flexDirection: "row-reverse", justifyContent: "space-between" }, detailText: { color: "#D9E6F2", fontSize: 11 }, denied: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }, deniedTitle: { color: "#172033", fontSize: 20, fontWeight: "800", marginTop: 15 }, deniedText: { color: "#667085", fontSize: 13, marginTop: 8, textAlign: "center" }, modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }, modal: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 32, maxHeight: "92%" }, modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, close: { color: "#667085", fontSize: 13 }, modalTitle: { color: "#172033", fontSize: 20, fontWeight: "800" }, modalHint: { color: "#667085", fontSize: 11, textAlign: "right", marginTop: 6 }, fieldLabel: { color: "#98A6B8", fontSize: 11, fontWeight: "700", textAlign: "right", marginTop: 9, marginBottom: 5 }, input: { borderWidth: 1, borderColor: "#667085", borderRadius: 11, paddingHorizontal: 10, paddingVertical: 10, color: "#172033", fontSize: 13 }, shiftRow: { flexDirection: "row-reverse", gap: 10 }, shiftField: { flex: 1 }, activeToggle: { flexDirection: "row-reverse", alignItems: "center", gap: 9, marginTop: 14 }, toggle: { width: 42, height: 24, borderRadius: 12, backgroundColor: "#172033", padding: 3 }, toggleOn: { backgroundColor: "#163A63" }, toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: "#FFFFFF" }, toggleKnobOn: { alignSelf: "flex-end" }, toggleText: { color: "#667085", fontSize: 12, flex: 1, textAlign: "right" }, roleSelector: { marginTop: 8 }, roleButtons: { flexDirection: "row-reverse", gap: 8 }, roleButton: { flex: 1, borderWidth: 1, borderColor: "#667085", borderRadius: 11, paddingVertical: 11, alignItems: "center", backgroundColor: "#FFFFFF" }, roleButtonActive: { backgroundColor: "#163A63", borderColor: "#163A63" }, roleButtonText: { color: "#98A6B8", fontSize: 11, fontWeight: "700" }, roleButtonTextActive: { color: "#FFFFFF" }, submitButton: { backgroundColor: "#163A63", borderRadius: 13, alignItems: "center", paddingVertical: 13, marginTop: 17 }, submitText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 } });


export default function ManagerScreen() {
  return <AppDataProvider><ManagerScreenContent /></AppDataProvider>;
}
