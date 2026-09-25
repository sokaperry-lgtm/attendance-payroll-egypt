import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/payroll";

type Tab = "overview" | "schedule" | "attendance" | "requests" | "payroll" | "audit" | "documents";

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const staffAccountId = Number(rawId);
  const [tab, setTab] = useState<Tab>("overview");
  const { width } = useWindowDimensions();
  const compact = width < 700;

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const canLoad = ["owner", "manager", "hr"].includes(me.data?.membershipRole ?? me.data?.role ?? "") && Number.isInteger(staffAccountId) && staffAccountId > 0;
  const profile = trpc.hrTools.employee360.useQuery({ staffAccountId }, { enabled: canLoad, retry: false });

  if (me.isLoading) return <Screen><Loading text="جاري التحقق من صلاحية الحساب..." /></Screen>;
  if (!me.data) return <State title="انتهت جلسة الدخول" message="سجل الدخول مرة أخرى ثم افتح ملف الموظف." onBack={() => router.replace("/login" as never)} />;
  if (!canLoad) return <State title="رابط الموظف غير صحيح" message="تعذر تحديد الموظف المطلوب أو لا تملك صلاحية عرضه." onBack={() => router.back()} />;
  if (profile.isLoading) return <Screen><Loading text="جاري تحميل بيانات الموظف..." /></Screen>;
  if (profile.isError) return <State title="تعذر تحميل التفاصيل" message={profile.error?.message || "حدث خطأ أثناء تحميل بيانات الموظف."} onBack={() => router.back()} retry={() => profile.refetch()} />;

  const data = profile.data;
  const employee = data?.staff;
  if (!employee) return <State title="الموظف غير موجود" message={`رقم الموظف: ${String(rawId || "غير معروف")}`} onBack={() => router.back()} />;

  const attendance = data.attendance ?? [];
  const requests = data.requests ?? [];
  const payroll = data.payroll ?? [];
  const documents = data.documents ?? [];
  const adjustments = data.adjustments ?? [];
  const advances = data.advances ?? [];
  const schedules = data.schedules ?? [];
  const audit = data.audit ?? [];
  const present = attendance.filter((r) => ["حاضر", "متأخر", "مأمورية"].includes(String(r.status))).length;
  const absent = attendance.filter((r) => r.status === "غياب").length;
  const late = attendance.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0);
  const approvedRequests = requests.filter((r) => r.status === "مقبول").length;
  const latestPayroll = payroll[0];
  const payrollSummary = latestPayroll ? { gross:Number(latestPayroll.grossSalary||0), overtime:Number(latestPayroll.overtime||0), absence:Number(latestPayroll.absenceDeduction||0), lateDeduction:Number(latestPayroll.lateDeduction||0), earlyDeduction:Number(latestPayroll.earlyDeduction||0), other:Number(latestPayroll.otherDeductions||0), advances:Number(latestPayroll.advances||0), insurance:Number(latestPayroll.employeeSocialInsurance||0), tax:Number(latestPayroll.employeeIncomeTax||0), net:Number(latestPayroll.netSalary||0) } : null;
  const trackedAttendanceDays = present + absent;
  const attendanceRate = trackedAttendanceDays ? Math.round((present / trackedAttendanceDays) * 100) : 0;
  const recentAttendance = useMemo(() => attendance.slice(0, 8), [attendance]);
  const workSchedules = useMemo(() => schedules.slice(0, 14), [schedules]);
  const currentMonthPayroll = latestPayroll ? Number(latestPayroll.netSalary || 0) : 0;
  const pendingRequests = requests.filter((r) => r.status === "قيد المراجعة").length;
  const approvedLeave = requests.filter((r) => r.status === "مقبول" && String(r.type || "").includes("إجاز")).length;
  const recentEight = attendance.slice(0, 8);
  const previousEight = attendance.slice(8, 16);
  const recentTracked = recentEight.filter((r) => ["حاضر", "متأخر", "مأمورية", "غياب"].includes(String(r.status))).length;
  const previousTracked = previousEight.filter((r) => ["حاضر", "متأخر", "مأمورية", "غياب"].includes(String(r.status))).length;
  const recentPresent = recentEight.filter((r) => ["حاضر", "متأخر", "مأمورية"].includes(String(r.status))).length;
  const previousPresent = previousEight.filter((r) => ["حاضر", "متأخر", "مأمورية"].includes(String(r.status))).length;
  const recentRate = recentTracked ? Math.round((recentPresent / recentTracked) * 100) : attendanceRate;
  const previousRate = previousTracked ? Math.round((previousPresent / previousTracked) * 100) : recentRate;
  const recentLate = recentEight.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0);
  const previousLate = previousEight.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0);
  const attendanceTrend = recentRate - previousRate;
  const lateTrend = recentLate - previousLate;
  const smartInsight = !attendance.length
    ? { tone: "neutral", title: "لسه مفيش بيانات كفاية", text: "أول ما يبدأ تسجيل الحضور والطلبات، الملف هيبدأ يطلع مؤشرات ذكية." }
    : attendanceTrend >= 5
      ? { tone: "positive", title: "الحضور بيتحسن", text: `معدل الحضور في آخر السجلات ${recentRate}% مقابل ${previousRate}% في الفترة السابقة.` }
      : attendanceTrend <= -5
        ? { tone: "attention", title: "محتاج متابعة الحضور", text: `معدل الحضور نزل إلى ${recentRate}% مقارنةً بـ ${previousRate}% في الفترة السابقة.` }
        : lateTrend <= -15
          ? { tone: "positive", title: "التأخير بيتحسن", text: `دقائق التأخير في آخر السجلات أقل بـ ${Math.abs(lateTrend)} دقيقة عن الفترة السابقة.` }
          : pendingRequests > 0
            ? { tone: "attention", title: "في طلبات محتاجة متابعة", text: `يوجد ${pendingRequests} طلب قيد المراجعة على ملف الموظف.` }
            : { tone: "neutral", title: "الأداء مستقر", text: `معدل الحضور الحالي ${attendanceRate}% وإجمالي التأخير ${late} دقيقة.` };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع للموظفين</Text></Pressable>

        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(employee.name)}</Text></View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>EMPLOYEE 360</Text>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={styles.role}>{employee.title || "موظف"} · {employee.department || "—"}</Text>
            <Text style={styles.phone}>{employee.phone || "لا يوجد رقم هاتف"}</Text>            <View style={styles.heroBadges}><Text style={styles.heroBadge}>{employee.active ? "نشط" : "غير نشط"}</Text><Text style={styles.heroBadgeGhost}>{(data as any).staff?.membershipRole === "owner" ? "مالك" : (data as any).staff?.membershipRole === "manager" ? "مدير" : (data as any).staff?.membershipRole === "hr" ? "HR" : (data as any).staff?.membershipRole === "accountant" ? "محاسب" : (data as any).staff?.membershipRole === "supervisor" ? "مشرف" : "موظف"}</Text></View>
          </View>
        </View>

        <View style={styles.smartInsight}>
          <View style={styles.smartInsightIcon}><Text style={styles.smartInsightIconText}>✦</Text></View>
          <View style={styles.smartInsightBody}>
            <Text style={styles.smartInsightEyebrow}>SMART EMPLOYEE INSIGHT</Text>
            <Text style={styles.smartInsightTitle}>{smartInsight.title}</Text>
            <Text style={styles.smartInsightText}>{smartInsight.text}</Text>
          </View>
        </View>

        <View style={[styles.kpis, compact && styles.kpisCompact]}>
          <Kpi label="معدل الحضور" value={`${attendanceRate}%`} />
          <Kpi label="أيام الحضور" value={String(present)} />
          <Kpi label="دقائق التأخير" value={`${late} د`} />
          <Kpi label="آخر صافي راتب" value={latestPayroll ? formatMoney(currentMonthPayroll) : "—"} />
          <Kpi label="طلبات قيد المراجعة" value={String(pendingRequests)} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {([
            ["overview", "نظرة عامة"],
            ["schedule", "الجدول"],
            ["attendance", "الحضور"],
            ["requests", "الطلبات"],
            ["payroll", "الرواتب"],
            ["audit", "سجل العمليات"],
            ["documents", "المستندات"],
          ] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === "overview" && (
          <>
            <View style={[styles.grid, compact && styles.gridCompact]}>
              <Card title="بيانات الموظف">
                <Row label="الهاتف" value={employee.phone || "—"} />
                <Row label="القسم" value={employee.department || "—"} />
                <Row label="الوظيفة" value={employee.title || "—"} />
                <Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} />
              </Card>
              <Card title="ملخص النشاط">
                <Row label="الطلبات المقبولة" value={String(approvedRequests)} />
                <Row label="طلبات قيد المراجعة" value={String(pendingRequests)} />
                <Row label="إجازات معتمدة" value={String(approvedLeave)} />
                <Row label="تعديلات الراتب" value={String(adjustments.length)} />
                <Row label="السلف" value={String(advances.length)} />
              </Card>
            </View>
            <Card title="آخر النشاط">
              {attendance.slice(0, 5).map((r) => <Row key={r.id} label={String(r.date)} value={r.checkIn && r.checkOut ? `${r.checkIn} → ${r.checkOut}` : String(r.status || "—")} />)}
              {!attendance.length && <Empty text="لا يوجد نشاط مسجل حتى الآن." />}
            </Card>
          </>
        )}

        {tab === "schedule" && (
          <>
            <Card title="جدول الموظف">
              {workSchedules.length ? workSchedules.map((r:any) => (
                <Row key={r.id} label={String(r.scheduleDate)} value={r.shift ? `${r.shift.name} · ${r.shift.startTime}–${r.shift.endTime}` : "بدون وردية"} />
              )) : <Empty text="لا يوجد جدول مسجل لهذا الموظف." />}
            </Card>
            <View style={[styles.infoGrid, compact && styles.gridCompact]}>
              <Card title="نظرة سريعة"><Row label="أيام مجدولة" value={String(schedules.length)} /><Row label="أيام الحضور" value={String(present)} /></Card>
              <Card title="الإجازات"><Row label="إجازات معتمدة" value={String(approvedLeave)} /><Row label="طلبات قيد المراجعة" value={String(pendingRequests)} /></Card>
            </View>
          </>
        )}

        {tab === "attendance" && <><View style={[styles.infoGrid, compact && styles.gridCompact]}><Card title="ملخص الحضور"><Row label="أيام الحضور" value={String(present)} /><Row label="أيام الغياب" value={String(absent)} /><Row label="معدل الحضور" value={`${attendanceRate}%`} /><Row label="إجمالي التأخير" value={`${late} دقيقة`} /></Card><Card title="الانضباط"><View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${attendanceRate}%`}]}/></View><Text style={styles.progressText}>{attendanceRate}% حضور فعلي</Text></Card></View><Card title="سجل الحضور">{attendance.length ? attendance.slice(0, 30).map((r) => <Row key={r.id} label={String(r.date)} value={r.checkIn && r.checkOut ? `${r.checkIn} → ${r.checkOut}` : String(r.status || "—")} />) : <Empty text="لا توجد سجلات حضور." />}</Card></>}
        {tab === "requests" && <Card title="الطلبات">{requests.length ? requests.slice(0, 30).map((r) => <Row key={r.id} label={`${r.type} · ${r.fromDate}`} value={String(r.status || "—")} />) : <Empty text="لا توجد طلبات." />}</Card>}
        {tab === "payroll" && (
          <>
            <><View style={[styles.infoGrid, compact && styles.gridCompact]}><Card title="آخر مسير راتب"><Text style={styles.bigMoney}>{payrollSummary ? formatMoney(payrollSummary.net) : "—"}</Text><Text style={styles.mutedSmall}>{latestPayroll ? `شهر ${latestPayroll.month}` : "لا يوجد مسير"}</Text><Row label="الإجمالي قبل الخصم" value={payrollSummary ? formatMoney(payrollSummary.gross) : "—"} /><Row label="الإضافي" value={payrollSummary ? formatMoney(payrollSummary.overtime) : "—"} /></Card><Card title="تفاصيل الخصومات"><Row label="غياب" value={payrollSummary ? formatMoney(payrollSummary.absence) : "—"} /><Row label="تأخير" value={payrollSummary ? formatMoney(payrollSummary.lateDeduction) : "—"} /><Row label="انصراف مبكر" value={payrollSummary ? formatMoney(payrollSummary.earlyDeduction) : "—"} /><Row label="خصومات أخرى" value={payrollSummary ? formatMoney(payrollSummary.other) : "—"} /><Row label="سلف" value={payrollSummary ? formatMoney(payrollSummary.advances) : "—"} /><Row label="تأمينات" value={payrollSummary ? formatMoney(payrollSummary.insurance) : "—"} /><Row label="ضريبة" value={payrollSummary ? formatMoney(payrollSummary.tax) : "—"} /></Card></View><Card title="بيانات الراتب"><Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} /><Row label="تعديلات الراتب" value={String(adjustments.length)} /><Row label="السلف" value={String(advances.length)} /></Card></>
            <Card title="سجل الرواتب">{payroll.length ? payroll.slice(0, 20).map((r) => <Row key={r.id} label={String(r.month)} value={formatMoney(Number(r.netSalary || 0))} />) : <Empty text="لا توجد مسيرات مسجلة." />}</Card>
          </>
        )}
        {tab === "audit" && (
          <Card title="سجل عمليات الموظف">
            {audit.length ? audit.slice(0, 40).map((r:any) => (
              <Row key={r.id} label={r.createdAt ? new Date(r.createdAt).toLocaleString("ar-EG") : "—"} value={String(r.action || "عملية")} />
            )) : <Empty text="لا توجد عمليات مسجلة لهذا الموظف." />}
          </Card>
        )}
        {tab === "documents" && <Card title="مستندات الموظف">{documents.length ? documents.map((d) => <Row key={d.id} label={`${d.type} · ${d.title}`} value={d.expiryDate ? String(d.expiryDate) : "—"} />) : <Empty text="لا توجد مستندات." />}</Card>}
      </ScrollView>
    </Screen>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>;
}
function initials(name: string) { return name.split(" ").slice(0, 2).map((part) => part[0] ?? "").join(""); }
function Loading({ text }: { text: string }) { return <View style={styles.center}><ActivityIndicator size="large" color="#163A63" /><Text style={styles.title}>{text}</Text></View>; }
function Screen({ children }: { children: React.ReactNode }) { return <View style={styles.screen}>{children}</View>; }
function State({ title, message, onBack, retry }: { title: string; message: string; onBack: () => void; retry?: () => void }) {
  return <Screen><View style={styles.center}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{message}</Text>{retry && <Pressable onPress={retry} style={styles.button}><Text style={styles.buttonText}>إعادة المحاولة</Text></Pressable>}<Pressable onPress={onBack}><Text style={styles.back}>رجوع</Text></Pressable></View></Screen>;
}
function Card({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={styles.row}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.muted}>{text}</Text>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { padding: 22, paddingBottom: 70, gap: 14, maxWidth: 1180, width: "100%", alignSelf: "center" },
  back: { color: "#163A63", fontSize: 13, fontWeight: "800", textAlign: "right", paddingVertical: 6 },
  hero: { backgroundColor: "#163A63", borderRadius: 24, padding: 22, flexDirection: "row-reverse", alignItems: "center", gap: 16 },
  heroCompact: { flexDirection: "column", alignItems: "stretch" },
  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#163A63", fontSize: 23, fontWeight: "900" },
  heroText: { flex: 1 },
  kicker: { color: "#D9E6F2", fontSize: 9, fontWeight: "900", textAlign: "right", letterSpacing: 1 },
  name: { color: "#FFFFFF", fontSize: 27, fontWeight: "900", textAlign: "right", marginTop: 4 },
  role: { color: "#D9E6F2", fontSize: 12, textAlign: "right", marginTop: 4 },
  phone: { color: "#FFFFFF", opacity: 0.75, fontSize: 11, textAlign: "right", marginTop: 5 },
  heroBadges:{flexDirection:"row-reverse",gap:7,marginTop:10},heroBadge:{color:"#163A63",backgroundColor:"#FFFFFF",borderRadius:8,paddingHorizontal:9,paddingVertical:4,fontSize:9,fontWeight:"900"},heroBadgeGhost:{color:"#FFFFFF",backgroundColor:"rgba(255,255,255,0.12)",borderRadius:8,paddingHorizontal:9,paddingVertical:4,fontSize:9,fontWeight:"800"},
  smartInsight:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#D9E2EC",borderRadius:18,padding:16,flexDirection:"row-reverse",alignItems:"center",gap:12},
  smartInsightIcon:{width:42,height:42,borderRadius:14,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},
  smartInsightIconText:{color:"#FFFFFF",fontSize:20,fontWeight:"900"},
  smartInsightBody:{flex:1},
  smartInsightEyebrow:{color:"#718096",fontSize:9,fontWeight:"900",letterSpacing:1,textAlign:"right"},
  smartInsightTitle:{color:"#163A63",fontSize:15,fontWeight:"900",textAlign:"right",marginTop:3},
  smartInsightText:{color:"#667085",fontSize:11,fontWeight:"600",textAlign:"right",lineHeight:18,marginTop:3},
  kpis: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 12 },
  kpisCompact: { flexDirection: "column" },
  kpi: { flexGrow: 1, flexBasis: 180, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, padding: 16, minHeight: 88, justifyContent: "center" },
  kpiValue: { color: "#163A63", fontSize: 20, fontWeight: "900", textAlign: "right" },
  kpiLabel: { color: "#667085", fontSize: 11, fontWeight: "700", textAlign: "right", marginTop: 5 },
  tabs: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#F7F9FC", borderRadius: 16, padding: 7, borderWidth: 1, borderColor: "#E4E7EC" },
  tab: { flexGrow: 1, minWidth: 120, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 11, alignItems: "center" },
  tabActive: { backgroundColor: "#163A63" },
  tabText: { color: "#667085", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#FFFFFF" },
  grid: { flexDirection: "row-reverse", gap: 14, flexWrap: "wrap" },
  gridCompact: { flexDirection: "column" },
  infoGrid: { flexDirection: "row-reverse", gap: 14, flexWrap: "wrap" },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, padding: 18, flexGrow: 1, flexBasis: 360 },
  cardTitle: { color: "#172033", fontSize: 16, fontWeight: "900", textAlign: "right", marginBottom: 8 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#E4E7EC", gap: 10 },
  label: { color: "#667085", fontSize: 11 },
  value: { color: "#172033", fontSize: 12, fontWeight: "800", maxWidth: "72%", textAlign: "right" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: "#172033", fontSize: 21, fontWeight: "900", textAlign: "center" },
  muted: { color: "#667085", fontSize: 12, lineHeight: 21, textAlign: "center", paddingVertical: 8 },
  progressTrack:{height:10,borderRadius:8,backgroundColor:"#EEF2F6",overflow:"hidden",marginTop:8},progressFill:{height:"100%",backgroundColor:"#163A63",borderRadius:8},progressText:{color:"#667085",fontSize:10,textAlign:"right",marginTop:9},bigMoney:{color:"#163A63",fontSize:25,fontWeight:"900",textAlign:"right"},mutedSmall:{color:"#98A6B8",fontSize:10,textAlign:"right",marginTop:4},
  button: { backgroundColor: "#163A63", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
});
