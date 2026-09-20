import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/payroll";

type Tab = "overview" | "attendance" | "requests" | "payroll" | "documents";

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const staffAccountId = Number(rawId);
  const [tab, setTab] = useState<Tab>("overview");

  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const canLoad = (me.data?.role === "manager" || me.data?.role === "supervisor") && Number.isInteger(staffAccountId) && staffAccountId > 0;
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
  const present = attendance.filter((r) => r.status === "حاضر" || r.status === "متأخر").length;
  const absent = attendance.filter((r) => r.status === "غياب").length;
  const late = attendance.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0);
  const approvedRequests = requests.filter((r) => r.status === "مقبول").length;
  const latestPayroll = payroll[0];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ رجوع للموظفين</Text></Pressable>

        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(employee.name)}</Text></View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>EMPLOYEE 360</Text>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={styles.role}>{employee.title || "موظف"} · {employee.department || "—"}</Text>
            <Text style={styles.phone}>{employee.phone || "لا يوجد رقم هاتف"}</Text>
          </View>
        </View>

        <View style={styles.kpis}>
          <Kpi label="الحضور" value={String(present)} />
          <Kpi label="الغياب" value={String(absent)} />
          <Kpi label="التأخير" value={`${late} د`} />
          <Kpi label="آخر صافي راتب" value={latestPayroll ? formatMoney(Number(latestPayroll.netSalary || 0)) : "—"} />
        </View>

        <View style={styles.tabs}>
          {([
            ["overview", "نظرة عامة"],
            ["attendance", "الحضور"],
            ["requests", "الطلبات"],
            ["payroll", "الرواتب"],
            ["documents", "المستندات"],
          ] as const).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabActive]}>
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "overview" && (
          <>
            <View style={styles.grid}>
              <Card title="بيانات الموظف">
                <Row label="الهاتف" value={employee.phone || "—"} />
                <Row label="القسم" value={employee.department || "—"} />
                <Row label="الوظيفة" value={employee.title || "—"} />
                <Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} />
              </Card>
              <Card title="ملخص النشاط">
                <Row label="الطلبات المقبولة" value={String(approvedRequests)} />
                <Row label="كل الطلبات" value={String(requests.length)} />
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

        {tab === "attendance" && <Card title="سجل الحضور">{attendance.length ? attendance.slice(0, 30).map((r) => <Row key={r.id} label={String(r.date)} value={r.checkIn && r.checkOut ? `${r.checkIn} → ${r.checkOut}` : String(r.status || "—")} />) : <Empty text="لا توجد سجلات حضور." />}</Card>}
        {tab === "requests" && <Card title="الطلبات">{requests.length ? requests.slice(0, 30).map((r) => <Row key={r.id} label={`${r.type} · ${r.fromDate}`} value={String(r.status || "—")} />) : <Empty text="لا توجد طلبات." />}</Card>}
        {tab === "payroll" && (
          <>
            <Card title="بيانات الراتب"><Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} /><Row label="تعديلات الراتب" value={String(adjustments.length)} /><Row label="السلف" value={String(advances.length)} /></Card>
            <Card title="سجل الرواتب">{payroll.length ? payroll.slice(0, 20).map((r) => <Row key={r.id} label={String(r.month)} value={formatMoney(Number(r.netSalary || 0))} />) : <Empty text="لا توجد مسيرات مسجلة." />}</Card>
          </>
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
  content: { 22: 24, 70: 24, 14: 24, maxWidth: 1180, width: "100%", alignSelf: "center" },
  back: { color: "#163A63", fontSize: 13, fontWeight: "800", textAlign: "right", 6: 24 },
  hero: { backgroundColor: "#163A63", borderRadius: 24, 22: 24, flexDirection: "row-reverse", alignItems: "center", 16: 24 },
  avatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#163A63", fontSize: 22, fontWeight: "900" },
  heroText: { flex: 1 },
  kicker: { color: "#D9E6F2", fontSize: 10, fontWeight: "900", textAlign: "right", letterSpacing: 1 },
  name: { color: "#FFFFFF", fontSize: 26, fontWeight: "900", textAlign: "right", 4: 24 },
  role: { color: "#D9E6F2", fontSize: 12, textAlign: "right", 4: 24 },
  phone: { color: "#FFFFFF", opacity: 0.75, fontSize: 11, textAlign: "right", 5: 24 },
  kpis: { flexDirection: "row-reverse", flexWrap: "wrap", 12: 24 },
  kpi: { flexGrow: 1, flexBasis: 180, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, 16: 24, minHeight: 88, justifyContent: "center" },
  kpiValue: { color: "#163A63", fontSize: 19, fontWeight: "900", textAlign: "right" },
  kpiLabel: { color: "#667085", fontSize: 11, fontWeight: "700", textAlign: "right", 5: 24 },
  tabs: { flexDirection: "row-reverse", flexWrap: "wrap", 8: 24, backgroundColor: "#F7F9FC", borderRadius: 16, 7: 24, borderWidth: 1, borderColor: "#E4E7EC" },
  tab: { flexGrow: 1, minWidth: 120, 11: 24, 14: 24, borderRadius: 12, alignItems: "center" },
  tabActive: { backgroundColor: "#163A63" },
  tabText: { color: "#667085", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#FFFFFF" },
  grid: { flexDirection: "row-reverse", 14: 24, flexWrap: "wrap" },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, 18: 24, flexGrow: 1, flexBasis: 360 },
  cardTitle: { color: "#172033", fontSize: 15, fontWeight: "900", textAlign: "right", 8: 24 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", 11: 24, borderBottomWidth: 1, borderBottomColor: "#E4E7EC", 10: 24 },
  label: { color: "#667085", fontSize: 11 },
  value: { color: "#172033", fontSize: 12, fontWeight: "800", maxWidth: "72%", textAlign: "right" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", 12: 24, 24: 24 },
  title: { color: "#172033", fontSize: 19, fontWeight: "900", textAlign: "center" },
  muted: { color: "#667085", fontSize: 12, lineHeight: 21, textAlign: "center", 8: 24 },
  button: { backgroundColor: "#163A63", borderRadius: 12, 22: 24, 12: 24 },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
});
