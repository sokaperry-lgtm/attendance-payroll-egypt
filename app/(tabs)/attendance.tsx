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
  const present = records.filter((record) => record.status === "حاضر" || record.status === "متأخر").length;
  const late = records.filter((record) => record.status === "متأخر").length;
  return (
    <ScreenContainer>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={styles.header}><View><Text style={styles.eyebrow}>حساب الموظف</Text><Text style={styles.title}>سجل الحضور</Text><Text style={styles.subtitle}>{employee.name} · سبتمبر 2026</Text></View><View style={styles.calendarIcon}><IconSymbol name="calendar" size={25} color="#2563EB" /></View></View>
          <View style={styles.summary}><View><Text style={styles.summaryValue}>{present}</Text><Text style={styles.summaryLabel}>أيام حضور</Text></View><View style={styles.divider} /><View><Text style={styles.summaryValue}>{late}</Text><Text style={styles.summaryLabel}>أيام تأخير</Text></View><View style={styles.divider} /><View><Text style={styles.summaryValue}>{26 - present}</Text><Text style={styles.summaryLabel}>متبقي</Text></View></View>
          <Text style={styles.sectionTitle}>آخر السجلات</Text>
        </>}
        renderItem={({ item }) => {
          const palette = statusColors[item.status];
          return <View style={styles.row}><View style={styles.dateBox}><Text style={styles.dateDay}>{new Date(item.date).getDate()}</Text><Text style={styles.dateMonth}>{formatDate(item.date).split(" ").slice(-1)[0]}</Text></View><View style={styles.rowMain}><Text style={styles.rowDate}>{formatDate(item.date)}</Text><Text style={styles.rowTime}>{item.checkIn ? `دخول ${item.checkIn}` : "بدون تسجيل دخول"}{item.checkOut ? `  ·  خروج ${item.checkOut}` : ""}</Text></View><View style={[styles.badge, { backgroundColor: palette.bg }]}><Text style={[styles.badgeText, { color: palette.text }]}>{item.status}</Text>{item.lateMinutes > 0 && <Text style={styles.lateText}>{item.lateMinutes} د</Text>}</View></View>;
        }}
        ListEmptyComponent={<Text style={styles.empty}>لا يوجد سجل حضور بعد.</Text>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 35, gap: 16 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  eyebrow: { color: "#64748B", fontSize: 13, textAlign: "right" },
  title: { color: "#0F172A", fontSize: 27, fontWeight: "800", marginTop: 5, textAlign: "right" },
  subtitle: { color: "#64748B", fontSize: 12, marginTop: 5, textAlign: "right" },
  calendarIcon: { backgroundColor: "#DBEAFE", width: 48, height: 48, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  summary: { backgroundColor: "#1D4ED8", borderRadius: 20, padding: 18, flexDirection: "row-reverse", justifyContent: "space-around", alignItems: "center" },
  summaryValue: { color: "#FFFFFF", fontSize: 25, fontWeight: "800", textAlign: "center" },
  summaryLabel: { color: "#DBEAFE", fontSize: 11, marginTop: 4, textAlign: "center" },
  divider: { height: 36, width: 1, backgroundColor: "rgba(255,255,255,0.25)" },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", textAlign: "right", marginTop: 4 },
  row: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 11, borderWidth: 1, borderColor: "#E2E8F0" },
  dateBox: { width: 43, height: 48, backgroundColor: "#F1F5F9", borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dateDay: { color: "#0F172A", fontWeight: "800", fontSize: 18 },
  dateMonth: { color: "#64748B", fontSize: 10, marginTop: 1 },
  rowMain: { flex: 1 },
  rowDate: { color: "#334155", fontSize: 14, fontWeight: "700", textAlign: "right" },
  rowTime: { color: "#94A3B8", fontSize: 11, marginTop: 5, textAlign: "right" },
  badge: { minWidth: 58, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 7, alignItems: "center" },
  badgeText: { fontSize: 11, fontWeight: "800" },
  lateText: { color: "#B45309", fontSize: 9, marginTop: 2 },
  empty: { color: "#64748B", textAlign: "center", padding: 30 },
});
