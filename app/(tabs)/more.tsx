import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";

const items = [
  { key: "self-service", title: "ملفي", hint: "بياناتك ورصيدك", icon: "person.fill", roles: ["employee"] },
  { key: "hr-tools", title: "HR Tools", hint: "إدارة الموارد البشرية", icon: "banknote", roles: ["owner", "manager", "hr"] },
  { key: "schedule", title: "الجدول", hint: "الورديات والتغطية", icon: "calendar", roles: ["owner", "manager", "hr", "supervisor"] },
  { key: "reports", title: "التقارير", hint: "الحضور والأداء", icon: "chart.bar.fill", roles: ["owner", "manager", "hr", "accountant", "supervisor"] },
  { key: "payroll", title: "الرواتب", hint: "المراجعة والاعتماد", icon: "banknote", roles: ["owner", "manager", "hr", "accountant"] },
  { key: "employees", title: "الموظفون", hint: "دليل الفريق", icon: "person.2.fill", roles: ["owner", "manager", "hr"] },
  { key: "settings", title: "الإعدادات", hint: "الشركة والصلاحيات", icon: "settings", roles: ["owner", "manager"] },
  { key: "logout", title: "تسجيل الخروج", hint: "إنهاء الجلسة بأمان", icon: "logout", roles: ["owner", "manager", "hr", "accountant", "supervisor", "employee"] },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { role } = useAppData();
  const { width } = useWindowDimensions();
  const compact = width < 420;
  const visible = items.filter((item) => item.roles.includes(role));
  const management = ["owner", "manager", "hr", "accountant"].includes(role);

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <IconSymbol name="ellipsis.circle" size={25} color={UI.navy} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>WORKSPACE</Text>
            <Text style={styles.title}>كل الأقسام</Text>
            <Text style={styles.sub}>وصول سريع لكل الأدوات المتاحة لحسابك.</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          <View style={styles.quickCard}>
            <View style={styles.quickIcon}><IconSymbol name="shield.fill" size={17} color={UI.navy} /></View>
            <Text style={styles.quickLabel}>الصلاحية</Text>
            <Text style={styles.quickValue}>{role === "owner" ? "مالك النظام" : role === "manager" ? "مدير" : role === "hr" ? "HR" : role === "accountant" ? "محاسب" : role === "supervisor" ? "مشرف" : "موظف"}</Text>
          </View>
          <View style={styles.quickCard}>
            <View style={styles.quickIcon}><IconSymbol name="sparkles" size={17} color={UI.navy} /></View>
            <Text style={styles.quickLabel}>تجربة الهاتف</Text>
            <Text style={styles.quickValue}>{management ? "إدارة كاملة" : "خدمة ذاتية"}</Text>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>الأدوات</Text>
            <Text style={styles.sectionHint}>{visible.length} أقسام متاحة</Text>
          </View>
        </View>

        <View style={[styles.grid, compact && styles.gridCompact]}>
          {visible.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(("/" + item.key) as never)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}><IconSymbol name={item.icon} size={21} color={UI.navy} /></View>
                <IconSymbol name="chevron.left" size={15} color={UI.muted} />
              </View>
              <Text style={styles.cardText}>{item.title}</Text>
              <Text style={styles.cardHint}>{item.hint}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const UI = { navy: "#163A63", navySoft: "#EEF4FA", text: "#172033", muted: "#667085", border: "#E4E7EC", white: "#FFFFFF", surface: "#F7F9FC" };

const styles = StyleSheet.create({
  content: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 34, gap: 12 },
  header: { backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 22, padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  headerIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { color: UI.navy, fontSize: 9, fontWeight: "900", textAlign: "right", letterSpacing: 1 },
  title: { color: UI.text, fontSize: 23, fontWeight: "900", textAlign: "right", marginTop: 2 },
  sub: { color: UI.muted, fontSize: 10, lineHeight: 16, textAlign: "right", marginTop: 3 },
  quickRow: { flexDirection: "row", gap: 9 },
  quickCard: { flex: 1, backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 12, minHeight: 84 },
  quickIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center", marginBottom: 7 },
  quickLabel: { color: UI.muted, fontSize: 9, fontWeight: "700", textAlign: "right" },
  quickValue: { color: UI.text, fontSize: 11, fontWeight: "900", textAlign: "right", marginTop: 2 },
  sectionHead: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 2, marginTop: 3 },
  sectionTitle: { color: UI.text, fontSize: 15, fontWeight: "900", textAlign: "right" },
  sectionHint: { color: UI.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  gridCompact: { gap: 8 },
  card: { width: "48.7%", minHeight: 126, backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 13 },
  cardCompact: { width: "48.2%", minHeight: 116, padding: 11 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center" },
  cardText: { color: UI.text, fontSize: 13, fontWeight: "900", textAlign: "right", marginTop: 14 },
  cardHint: { color: UI.muted, fontSize: 9, lineHeight: 14, textAlign: "right", marginTop: 3 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
