import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/payroll";

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const staffAccountId = Number(rawId);

  // This route lives outside /(tabs), so it must NOT use useAppData().
  // Read the session directly, then load the real Employee 360 record.
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const canLoad = (me.data?.role === "manager" || me.data?.role === "supervisor")
    && Number.isInteger(staffAccountId)
    && staffAccountId > 0;

  const profile = trpc.hrTools.employee360.useQuery(
    { staffAccountId },
    { enabled: canLoad, retry: false }
  );

  if (me.isLoading) {
    return <Screen><Loading text="جاري التحقق من صلاحية الحساب..." /></Screen>;
  }

  if (!me.data) {
    return <State title="انتهت جلسة الدخول" message="سجل الدخول مرة أخرى ثم افتح ملف الموظف." onBack={() => router.replace("/login" as never)} />;
  }

  if (!canLoad) {
    return <State title="رابط الموظف غير صحيح" message="تعذر تحديد الموظف المطلوب أو لا تملك صلاحية عرضه." onBack={() => router.back()} />;
  }

  if (profile.isLoading) {
    return <Screen><Loading text="جاري تحميل بيانات الموظف..." /></Screen>;
  }

  if (profile.isError) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.title}>تعذر تحميل التفاصيل</Text>
          <Text style={styles.muted}>{profile.error?.message || "حدث خطأ أثناء تحميل بيانات الموظف."}</Text>
          <Pressable onPress={() => profile.refetch()} style={styles.button}>
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.back}>رجوع للموظفين</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const data = profile.data;
  const employee = data?.staff;
  if (!employee) {
    return <State title="الموظف غير موجود" message={`رقم الموظف: ${String(rawId || "غير معروف")}`} onBack={() => router.back()} />;
  }

  const attendance = data.attendance ?? [];
  const requests = data.requests ?? [];
  const payroll = data.payroll ?? [];
  const documents = data.documents ?? [];
  const adjustments = data.adjustments ?? [];
  const advances = data.advances ?? [];

  const present = attendance.filter((r) => r.status === "حاضر" || r.status === "متأخر").length;
  const absent = attendance.filter((r) => r.status === "غياب").length;
  const late = attendance.reduce((sum, r) => sum + Number(r.lateMinutes || 0), 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>‹ رجوع للموظفين</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(employee.name)}</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>EMPLOYEE 360</Text>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={styles.role}>{employee.title || "موظف"} · {employee.department || "—"}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <Card title="بيانات الموظف">
            <Row label="الهاتف" value={employee.phone || "—"} />
            <Row label="القسم" value={employee.department || "—"} />
            <Row label="الوظيفة" value={employee.title || "—"} />
            <Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} />
          </Card>

          <Card title="ملخص الحضور">
            <Row label="أيام الحضور" value={String(present)} />
            <Row label="أيام الغياب" value={String(absent)} />
            <Row label="دقائق التأخير" value={String(late)} />
            <Row label="سجلات الحضور" value={String(attendance.length)} />
          </Card>
        </View>

        <Card title="الحضور">
          {attendance.length
            ? attendance.slice(0, 20).map((r) => (
                <Row key={r.id} label={String(r.date)} value={r.checkIn && r.checkOut ? `${r.checkIn} → ${r.checkOut}` : String(r.status || "—")} />
              ))
            : <Empty text="لا توجد سجلات حضور." />}
        </Card>

        <Card title="الطلبات">
          {requests.length
            ? requests.slice(0, 12).map((r) => (
                <Row key={r.id} label={`${r.type} · ${r.fromDate}`} value={String(r.status || "—")} />
              ))
            : <Empty text="لا توجد طلبات." />}
        </Card>

        <Card title="الرواتب">
          {payroll.length
            ? payroll.slice(0, 12).map((r) => (
                <Row key={r.id} label={String(r.month)} value={formatMoney(Number(r.netSalary || 0))} />
              ))
            : <Empty text="لا توجد مسيرات مسجلة." />}
        </Card>

        <Card title="التعديلات والسلف">
          <Row label="تعديلات الراتب" value={String(adjustments.length)} />
          <Row label="السلف" value={String(advances.length)} />
        </Card>

        <Card title="المستندات">
          {documents.length
            ? documents.map((d) => (
                <Row key={d.id} label={`${d.type} · ${d.title}`} value={d.expiryDate ? String(d.expiryDate) : "—"} />
              ))
            : <Empty text="لا توجد مستندات." />}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((part) => part[0] ?? "").join("");
}

function Loading({ text }: { text: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#163A63" />
      <Text style={styles.title}>{text}</Text>
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

function State({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>{message}</Text>
        <Pressable onPress={onBack} style={styles.button}>
          <Text style={styles.buttonText}>رجوع</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.muted}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1180, width: "100%", alignSelf: "center" },
  back: { color: "#163A63", fontSize: 13, fontWeight: "800", textAlign: "right", paddingVertical: 6 },
  hero: { backgroundColor: "#163A63", borderRadius: 24, padding: 22, flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#163A63", fontSize: 22, fontWeight: "900" },
  heroText: { flex: 1 },
  kicker: { color: "#D9E6F2", fontSize: 9, fontWeight: "900", textAlign: "right" },
  name: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "right", marginTop: 4 },
  role: { color: "#D9E6F2", fontSize: 12, textAlign: "right", marginTop: 4 },
  grid: { flexDirection: "row-reverse", gap: 14 },
  card: { flex: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, padding: 18 },
  cardTitle: { color: "#172033", fontSize: 16, fontWeight: "900", textAlign: "right", marginBottom: 8 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#E4E7EC", gap: 10 },
  label: { color: "#667085", fontSize: 11 },
  value: { color: "#172033", fontSize: 12, fontWeight: "800", maxWidth: "70%", textAlign: "right" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: "#172033", fontSize: 21, fontWeight: "900", textAlign: "center" },
  muted: { color: "#667085", fontSize: 12, lineHeight: 21, textAlign: "center" },
  button: { backgroundColor: "#163A63", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
});
