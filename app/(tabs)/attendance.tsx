import { FlatList, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, StatusBadge, UI } from "@/components/ui/design-system";
import { useAppData } from "@/lib/app-data";
import { formatDate } from "@/lib/payroll";

const statusColors: Record<string, { bg: string; text: string }> = {
  حاضر: { bg: "#EAF1F8", text: "#163A63" },
  متأخر: { bg: "#EEF4FB", text: "#31577F" },
  إجازة: { bg: "#EEF4FB", text: "#31577F" },
  غياب: { bg: "#E6EDF5", text: "#0F2742" },
  مأمورية: { bg: "#EEF4FB", text: "#31577F" },
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
                <IconSymbol name="chart.bar.fill" size={18} color="#163A63" />
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
  eyebrow: { color: "#667085", fontSize: 13, textAlign: "right" },
  title: {
    color: "#172033",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "right",
  },
  subtitle: {
    color: "#667085",
    fontSize: 12,
    marginTop: 5,
    textAlign: "right",
  },
  calendarIcon: {
    backgroundColor: "#EEF4FB",
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 19, flexDirection: "row-reverse", alignItems: "center", gap: 13, overflow: "hidden" },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroLabel: { color: "#31577F", fontSize: 11, textAlign: "right" },
  heroValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 2 },
  heroHint: { color: "#667085", fontSize: 10, marginTop: 2, textAlign: "right" },
  heroRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 7, borderColor: "#163A63", alignItems: "center", justifyContent: "center" },
  heroRingText: { color: "#FFFFFF", fontSize: 18, fontWeight: "800" },
  heroRingLabel: { color: "#667085", fontSize: 9, marginTop: 1 },
  summary: {
    backgroundColor: "#163A63",
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
    color: "#D9E6F2",
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
    backgroundColor: "#F2F5F8",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#D9E6F2",
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  insightIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EEF4FB",
    alignItems: "center",
    justifyContent: "center",
  },
  insightCopy: { flex: 1 },
  insightTitle: {
    color: "#31577F",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  insightText: {
    color: "#667085",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    textAlign: "right",
  },
  sectionTitle: {
    color: "#172033",
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
    borderColor: "#F2F5F8",
  },
  dateBox: {
    width: 43,
    height: 48,
    backgroundColor: "#F7F9FC",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { color: "#172033", fontWeight: "800", fontSize: 18 },
  dateMonth: { color: "#667085", fontSize: 10, marginTop: 1 },
  rowMain: { flex: 1 },
  rowDate: {
    color: "#98A6B8",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
  },
  rowTime: {
    color: "#667085",
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
  lateText: { color: "#31577F", fontSize: 9, marginTop: 2 },
  empty: { color: "#667085", textAlign: "center", padding: 30 },
});
