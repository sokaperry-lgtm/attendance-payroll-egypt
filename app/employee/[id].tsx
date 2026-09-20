import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { staffMembers } = useAppData();
  const employee = staffMembers.find((item) => String(item.id) === String(id));

  if (!employee) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={styles.title}>الموظف غير موجود</Text>
          <Text style={styles.muted}>رقم الموظف: {String(id || "غير معروف")}</Text>
          <Pressable onPress={() => router.back()} style={styles.button}>
            <Text style={styles.buttonText}>رجوع</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹ رجوع للموظفين</Text>
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{employee.initials || "م"}</Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.kicker}>EMPLOYEE PROFILE</Text>
            <Text style={styles.name}>{employee.name}</Text>
            <Text style={styles.role}>{employee.title || "موظف"} · {employee.department || "—"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>بيانات الموظف</Text>
          <Row label="الاسم" value={employee.name} />
          <Row label="رقم الهاتف" value={employee.phone || "—"} />
          <Row label="القسم" value={employee.department || "—"} />
          <Row label="المسمى الوظيفي" value={employee.title || "—"} />
          <Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)} />
          <Row label="الحالة" value={employee.active === false ? "غير نشط" : "نشط"} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>ملف الموظف</Text>
          <Text style={styles.muted}>
            تم فتح ملف الموظف بنجاح. سيتم تحميل تفاصيل الحضور والطلبات والرواتب والمستندات بعد التأكد من سلامة صفحة الملف.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
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

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1180, width: "100%", alignSelf: "center" },
  back: { paddingVertical: 6 },
  backText: { color: "#163A63", fontSize: 13, fontWeight: "800", textAlign: "right" },
  hero: { backgroundColor: "#163A63", borderRadius: 24, padding: 22, flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  avatar: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#163A63", fontSize: 22, fontWeight: "900" },
  heroText: { flex: 1 },
  kicker: { color: "#D9E6F2", fontSize: 9, fontWeight: "900", textAlign: "right" },
  name: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "right", marginTop: 4 },
  role: { color: "#D9E6F2", fontSize: 12, textAlign: "right", marginTop: 4 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, padding: 18 },
  cardTitle: { color: "#172033", fontSize: 16, fontWeight: "900", textAlign: "right", marginBottom: 8 },
  row: { flexDirection: "row-reverse", justifyContent: "space-between", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#E4E7EC" },
  label: { color: "#667085", fontSize: 11 },
  value: { color: "#172033", fontSize: 12, fontWeight: "800", maxWidth: "65%", textAlign: "right" },
  muted: { color: "#667085", fontSize: 12, lineHeight: 21, textAlign: "right" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { color: "#172033", fontSize: 21, fontWeight: "900" },
  button: { backgroundColor: "#163A63", borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
});
