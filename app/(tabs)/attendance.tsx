import { FlatList, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { formatDate } from "@/lib/payroll";

const statusColors: Record<string, { bg: string; text: string }> = {
  حاضر: { bg: "#DCFCE7", text: "#166534" },
  متأخر: { bg: "#FEF3C7", text: "#92400E" },
  إجازة: { bg: "#DBEAFE", text: "#075985" },
  غياب: { bg: "#FEE2E2", text: "#991B1B" },
  مأمورية: { bg: "#EDE9FE", text: "#5B21B6" },
};

export default function AttendanceScreen() {
  const { records, employee } = useAppData();
  const present = records.filter(
    (record) => record.status === "حاضر" || record.status === "متأخر",
  ).length;
  const late = records.filter((record) => record.status === "متأخر").length;
  const absent = records.filter((record) => record.status === "غياب").length;

  return (
    <ScreenContainer>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>حساب الموظف</Text>
                <Text style={styles.title}>سجل الحضور</Text>
                <Text style={styles.subtitle}>{employee.name} · سبتمبر 2026</Text>
              </View>
              <View style={styles.calendarIcon}>
                <IconSymbol name="calendar" size={25} color="#2563EB" />
              </View>
            </View>

            <View style={styles.heroCard}>
              <View style={styles.heroIcon}><IconSymbol name="chart.bar.fill" size={23} color="#FFFFFF" /></View>
              <View style={styles.heroCopy}>
                <Text style={styles.heroLabel}>معدل الالتزام</Text>
                <Text style={styles.heroValue}>{records.length ? Math.round((present / records.length) * 100) : 0}%</Text>
                <Text style={styles.heroHint}>بناءً على سجلاتك الحالية</Text>
              </View>
              <View style={styles.heroRing}><Text style={styles.heroRingText}>{present}</Text><Text style={styles.heroRingLabel}>حاضر</Text></View>
            </View>
            <View style={styles.summary}>
              <View>
                <Text style={styles.summaryValue}>{present}</Text>
                <Text style={styles.summaryLabel}>أيام حضور</Text>
              </View>
              <View style={styles.divider} />
              <View>
                <Text style={styles.summaryValue}>{late}</Text>
                <Text style={styles.summaryLabel}>أيام تأخير</Text>
              </View>
              <View style={styles.divider} />
              <View>
                <Text style={styles.summaryValue}>{26 - present}</Text>
                <Text style={styles.summaryLabel}>متبقي</Text>
              </View>
            </View>

            <View style={styles.insightCard}>
              <View style={styles.insightIcon}>
                <IconSymbol name="chart.bar.fill" size={18} color="#2563EB" />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>ملخص سريع</Text>
                <Text style={styles.insightText}>
                  {late === 0
                    ? "ممتاز، لا يوجد تأخير مسجل."
                    : `لديك ${late} يوم تأخير مسجل.`}{" "}
                  {absent > 0
                    ? `والغياب المسجل ${absent} يوم.`
                    : "ولا يوجد غياب مسجل."}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>آخر السجلات</Text>
          </>
        }
        renderItem={({ item }) => {
          const palette = statusColors[item.status];
          return (
            <View style={styles.row}>
              <View style={styles.dateBox}>
                <Text style={styles.dateDay}>{new Date(item.date).getDate()}</Text>
                <Text style={styles.dateMonth}>
                  {formatDate(item.date).split(" ").slice(-1)[0]}
                </Text>
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{formatDate(item.date)}</Text>
                <Text style={styles.rowTime}>
                  {item.checkIn ? `دخول ${item.checkIn}` : "بدون تسجيل دخول"}
                  {item.checkOut ? `  ·  خروج ${item.checkOut}` : ""}
                </Text>
              </View>
              <View
                style={[styles.badge, { backgroundColor: palette.bg }]}
              >
                <Text style={[styles.badgeText, { color: palette.text }]}>
                  {item.status}
                </Text>
                {item.lateMinutes > 0 && (
                  <Text style={styles.lateText}>{item.lateMinutes} د</Text>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>لا يوجد سجل حضور بعد.</Text>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 35, gap: 16 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  eyebrow: { color: "#64748B", fontSize: 13, textAlign: "right" },
  title: {
    color: "#0F172A",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 5,
    textAlign: "right",
  },
  calendarIcon: {
    backgroundColor: "#DBEAFE",
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: { backgroundColor: "#0B1220", borderRadius: 24, padding: 19, flexDirection: "row-reverse", alignItems: "center", gap: 13, overflow: "hidden" },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroLabel: { color: "#93C5FD", fontSize: 11, textAlign: "right" },
  heroValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 2 },
  heroHint: { color: "#94A3B8", fontSize: 10, marginTop: 2, textAlign: "right" },
  heroRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 7, borderColor: "#60A5FA", alignItems: "center", justifyContent: "center" },
  heroRingText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  heroRingLabel: { color: "#CBD5E1", fontSize: 9, marginTop: 1 },
  summary: {
    backgroundColor: "#1D4ED8",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryValue: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  summaryLabel: {
    color: "#DBEAFE",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  divider: {
    height: 36,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  insightCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  insightCopy: { flex: 1 },
  insightTitle: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  insightText: {
    color: "#475569",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    textAlign: "right",
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 4,
  },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dateBox: {
    width: 43,
    height: 48,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { color: "#0F172A", fontWeight: "800", fontSize: 18 },
  dateMonth: { color: "#64748B", fontSize: 10, marginTop: 1 },
  rowMain: { flex: 1 },
  rowDate: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  rowTime: {
    color: "#94A3B8",
    fontSize: 11,
    marginTop: 5,
    textAlign: "right",
  },
  badge: {
    minWidth: 58,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 7,
    alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "800" },
  lateText: { color: "#B45309", fontSize: 9, marginTop: 2 },
  empty: { color: "#64748B", textAlign: "center", padding: 30 },
});
