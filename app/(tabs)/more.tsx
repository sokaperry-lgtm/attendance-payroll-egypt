import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";

const items = [
  { key: "self-service", title: "ملفي", icon: "person.fill", roles: ["employee"] },
  { key: "hr-tools", title: "HR Tools", icon: "banknote", roles: ["owner", "manager", "hr"] },
  { key: "schedule", title: "الجدول", icon: "calendar", roles: ["owner", "manager", "hr", "supervisor"] },
  { key: "reports", title: "التقارير", icon: "chart.bar.fill", roles: ["owner", "manager", "hr", "accountant", "supervisor"] },
  { key: "payroll", title: "الرواتب", icon: "banknote", roles: ["owner", "manager", "hr", "accountant"] },
  { key: "employees", title: "الموظفون", icon: "person.2.fill", roles: ["owner", "manager", "hr"] },
  { key: "settings", title: "الإعدادات", icon: "settings", roles: ["owner", "manager"] },
  { key: "logout", title: "تسجيل الخروج", icon: "logout", roles: ["owner", "manager", "hr", "accountant", "supervisor", "employee"] },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { role } = useAppData();
  const visible = items.filter((item) => item.roles.includes(role));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.iconBox}><IconSymbol name="ellipsis.circle" size={24} color={UI.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>WORKSPACE</Text>
            <Text style={styles.title}>كل الأقسام</Text>
            <Text style={styles.sub}>كل التبويبات المتاحة لحسابك موجودة هنا.</Text>
          </View>
        </View>
        <View style={styles.grid}>
          {visible.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(("/" + item.key) as never)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.cardIcon}><IconSymbol name={item.icon} size={22} color={UI.navy} /></View>
              <Text style={styles.cardText}>{item.title}</Text>
              <IconSymbol name="chevron.left" size={16} color={UI.muted} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const UI = { navy: "#163A63", navySoft: "#EEF4FA", text: "#172033", muted: "#667085", border: "#E4E7EC", white: "#FFFFFF" };
const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 50, gap: 14 },
  header: { backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 22, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  iconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: UI.navy, fontSize: 9, fontWeight: "900", textAlign: "right", letterSpacing: 1 },
  title: { color: UI.text, fontSize: 25, fontWeight: "900", textAlign: "right", marginTop: 3 },
  sub: { color: UI.muted, fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 3 },
  grid: { gap: 10 },
  card: { minHeight: 68, backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center" },
  cardText: { flex: 1, color: UI.text, fontSize: 13, fontWeight: "800", textAlign: "right" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
