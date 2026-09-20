import { FlatList, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, StatusBadge, UI } from "@/components/ui/design-system";
import { useAppData } from "@/lib/app-data";
import { formatDate } from "@/lib/payroll";

const statusColors: Record<string, { bg: string; text: string }> = {
  حاضر: { bg: "#122A1E", text: "#4ADE80" },
  متأخر: { bg: "#2B2410", text: "#FBBF24" },
  إجازة: { bg: "#1B2A45", text: "#7DD3FC" },
  غياب: { bg: "#2B1618", text: "#FCA5A5" },
  مأمورية: { bg: "#211A38", text: "#C4B5FD" },
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
            <PageHeader eyebrow="حساب الموظف" title="سجل الحضور" subtitle={`${employee.name} · سبتمبر 2026`} icon="calendar" />

            <View style={styles.heroCard}>
              <View style={styles.heroIcon}><IconSymbol name="chart.bar.fill" size={23} color="#F5F7FA" /></View>
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
                <IconSymbol name="chart.bar.fill" size={18} color="#5B9BFF" />
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

            <SectionTitle title="آخر السجلات" subtitle="مراجعة يومية للحضور والانصراف" />
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
              <View>
                <StatusBadge label={item.status} tone={item.status === "حاضر" ? "success" : item.status === "متأخر" ? "warning" : item.status === "غياب" ? "danger" : "neutral"} />
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
  eyebrow: { color: "#97A3B6", fontSize: 13, textAlign: "right" },
  title: {
    color: "#EEF2F8",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },
  subtitle: {
    color: "#97A3B6",
    fontSize: 12,
    marginTop: 5,
    textAlign: "right",
  },
  calendarIcon: {
    backgroundColor: "#1B2A45",
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: { backgroundColor: "#0B1220", borderRadius: 24, padding: 19, flexDirection: "row-reverse", alignItems: "center", gap: 13, overflow: "hidden" },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroLabel: { color: "#93C5FD", fontSize: 11, textAlign: "right" },
  heroValue: { color: "#F5F7FA", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 2 },
  heroHint: { color: "#8592A6", fontSize: 10, marginTop: 2, textAlign: "right" },
  heroRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 7, borderColor: "#3B82F6", alignItems: "center", justifyContent: "center" },
  heroRingText: { color: "#F5F7FA", fontSize: 18, fontWeight: "800" },
  heroRingLabel: { color: "#8B96A8", fontSize: 9, marginTop: 1 },
  summary: {
    backgroundColor: "#2E5FD9",
    borderRadius: 20,
    padding: 18,
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    alignItems: "center",
  },
  summaryValue: {
    color: "#F5F7FA",
    fontSize: 25,
    fontWeight: "800",
    textAlign: "center",
  },
  summaryLabel: {
    color: "#BFDBFE",
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
    backgroundColor: "#15243D",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#243352",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#1B2A45",
    alignItems: "center",
    justifyContent: "center",
  },
  insightCopy: { flex: 1 },
  insightTitle: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  insightText: {
    color: "#8592A6",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    textAlign: "right",
  },
  sectionTitle: {
    color: "#EEF2F8",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
    marginTop: 4,
  },
  row: {
    backgroundColor: "#131A24",
    borderRadius: 18,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#232C3A",
  },
  dateBox: {
    width: 43,
    height: 48,
    backgroundColor: "#1A212C",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { color: "#EEF2F8", fontWeight: "800", fontSize: 18 },
  dateMonth: { color: "#97A3B6", fontSize: 10, marginTop: 1 },
  rowMain: { flex: 1 },
  rowDate: {
    color: "#AAB4C4",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  rowTime: {
    color: "#8592A6",
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
  lateText: { color: "#FBBF24", fontSize: 9, marginTop: 2 },
  empty: { color: "#97A3B6", textAlign: "center", padding: 30 },
});
