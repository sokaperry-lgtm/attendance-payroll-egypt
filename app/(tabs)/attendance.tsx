import { FlatList, StyleSheet, Text, View, Pressable } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, StatusBadge } from "@/components/ui/design-system";
import { useAppData } from "@/lib/app-data";
import { formatDate } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

const statusTone: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  حاضر: "success",
  متأخر: "warning",
  غياب: "danger",
  إجازة: "neutral",
  مأمورية: "neutral",
  مستثنى: "neutral",
};

export default function AttendanceScreen() {
  const { records, employee, role, refresh } = useAppData();
  const attendanceReview = trpc.requests.reviewAttendanceException.useMutation();
  const managerRequests = trpc.requests.list.useQuery(undefined, { enabled: (role === "owner" || role === "manager") || role === "supervisor", retry: false });
  const pendingAbsences = (managerRequests.data ?? []).filter((item: any) => item.source === "attendance" && item.exceptionKind === "absence" && item.status === "قيد المراجعة");
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = now.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  const workSummary = trpc.attendance.workSummary.useQuery({ month });
  const syncAttendance = trpc.attendance.sync.useMutation({ onSuccess: () => workSummary.refetch() });
  const mySummary = workSummary.data?.employees?.find((x: any) => x.staffAccountId === employee.id);
  const workHours = mySummary?.workHours ?? 0;
  const overtimeHours = mySummary?.overtimeHours ?? 0;

  const present = records.filter(r => r.status === "حاضر" || r.status === "متأخر").length;
  const late = records.filter(r => r.status === "متأخر").length;
  const absent = records.filter(r => r.status === "غياب").length;
  const totalLateMinutes = records.reduce((sum, r) => sum + (r.lateMinutes || 0), 0);
  const rate = records.length ? Math.round((present / records.length) * 100) : 0;

  return (
    <ScreenContainer>
      <FlatList
        data={records}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <PageHeader
              eyebrow="حساب الموظف"
              title="الحضور والانصراف"
              subtitle={`${employee.name} · ${monthLabel}`}
              icon="calendar"
            />

            <View style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.heroIcon}>
                  <IconSymbol name="chart.bar.fill" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={styles.heroEyebrow}>معدل الحضور</Text>
                  <Text style={styles.heroValue}>{rate}%</Text>
                  <Text style={styles.heroHint}>نسبة الالتزام من إجمالي السجلات</Text>
                </View>
                <View style={styles.rateCircle}>
                  <Text style={styles.rateNumber}>{rate}%</Text>
                  <Text style={styles.rateLabel}>التزام</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${rate}%` }]} />
              </View>
            </View>

            <View style={styles.kpiGrid}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{present}</Text>
                <Text style={styles.kpiLabel}>أيام حضور</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{late}</Text>
                <Text style={styles.kpiLabel}>أيام تأخير</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{totalLateMinutes}</Text>
                <Text style={styles.kpiLabel}>دقائق تأخير</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{absent}</Text>
                <Text style={styles.kpiLabel}>غياب</Text>
              </View>
            </View>

            <View style={styles.reviewPanel}>
  <View style={styles.reviewHeader}>
    <View style={styles.reviewBadge}><Text style={styles.reviewBadgeText}>{pendingAbsences.length}</Text></View>
    <View style={styles.reviewCopy}>
      <Text style={styles.reviewTitle}>مراجعة الغياب</Text>
      <Text style={styles.reviewText}>الغياب التلقائي لا يُخصم من الراتب إلا بعد اعتماد المدير.</Text>
    </View>
    <IconSymbol name="person.crop.circle.badge.exclamationmark" size={24} color="#163A63" />
  </View>
  {pendingAbsences.length === 0 ? (
    <Text style={styles.reviewEmpty}>لا توجد حالات غياب بانتظار القرار.</Text>
  ) : pendingAbsences.slice(0, 5).map((item: any) => (
    <View key={String(item.id)} style={styles.absenceCard}>
      <View style={styles.absenceInfo}>
        <Text style={styles.absenceName}>{item.staffName ?? "موظف"}</Text>
        <Text style={styles.absenceDate}>{item.fromDate} · غياب تلقائي</Text>
      </View>
      <View style={styles.absenceActions}>
        <Pressable
          disabled={attendanceReview.isPending}
          onPress={async () => {
            try {
              await attendanceReview.mutateAsync({ staffAccountId: Number(item.staffAccountId), date: String(item.fromDate), kind: "absence", action: "approve" });
              await managerRequests.refetch();
              await refresh();
            } catch {}
          }}
          style={styles.approveAbsence}
        ><Text style={styles.approveAbsenceText}>{attendanceReview.isPending ? "..." : "اعتماد"}</Text></Pressable>
        <Pressable
          disabled={attendanceReview.isPending}
          onPress={async () => {
            try {
              await attendanceReview.mutateAsync({ staffAccountId: Number(item.staffAccountId), date: String(item.fromDate), kind: "absence", action: "cancel" });
              await managerRequests.refetch();
              await refresh();
            } catch {}
          }}
          style={styles.cancelAbsence}
        ><Text style={styles.cancelAbsenceText}>إلغاء</Text></Pressable>
      </View>
    </View>
  ))}
</View>

<View style={styles.insight}>
              <View style={styles.insightIcon}>
                <IconSymbol name={late > 0 ? "clock" : "checkmark"} size={18} color="#163A63" />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{late > 0 ? "مراجعة التأخير" : "حالة ممتازة"}</Text>
                <Text style={styles.insightText}>
                  {late > 0
                    ? `تم تسجيل ${late} ${late === 1 ? "يوم" : "أيام"} تأخير بإجمالي ${totalLateMinutes} دقيقة.`
                    : "لا توجد أيام تأخير مسجلة في الفترة الحالية."}
                </Text>
              </View>
            </View>

            <View style={styles.syncRow}>
<View style={styles.syncCopy}>
<Text style={styles.syncTitle}>مزامنة الحضور</Text>
<Text style={styles.syncText}>تسجيل الغياب التلقائي وتحديث ساعات العمل والإضافي.</Text>
</View>
<Pressable style={styles.syncButton} onPress={() => syncAttendance.mutate({ month })} disabled={syncAttendance.isPending}>
<Text style={styles.syncButtonText}>{syncAttendance.isPending ? "جاري..." : "مزامنة الآن"}</Text>
</Pressable>
</View>
<SectionTitle title="سجل الأيام" subtitle="آخر تسجيلات الحضور والانصراف" />
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.dateBox}>
              <Text style={styles.dateDay}>{new Date(item.date).getDate()}</Text>
              <Text style={styles.dateMonth}>سبتمبر</Text>
            </View>
            <View style={styles.rowMain}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowDate}>{formatDate(item.date)}</Text>
                <StatusBadge
                  label={item.status === "غياب" && !(item.note || "").includes("تم اعتماد الغياب") && !(item.note || "").includes("تم إلغاء الغياب") ? "غياب · بانتظار الاعتماد" : item.status === "مستثنى" ? "مستثنى من الغياب" : item.status}
                  tone={item.status === "غياب" && !(item.note || "").includes("تم اعتماد الغياب") && !(item.note || "").includes("تم إلغاء الغياب") ? "warning" : statusTone[item.status] || "neutral"}
                />
              </View>
              <Text style={styles.rowTime}>
                {item.checkIn ? `دخول ${item.checkIn}` : "بدون تسجيل دخول"}
                {item.checkOut ? `  ·  خروج ${item.checkOut}` : ""}
              </Text>
              {item.lateMinutes > 0 && (
                <Text style={styles.lateText}>تأخير {item.lateMinutes} دقيقة</Text>
              )}
              {((role === "owner" || role === "manager") || role === "supervisor") &&
                item.status === "غياب" &&
                !(item.note || "").includes("تم اعتماد الغياب") &&
                !(item.note || "").includes("تم إلغاء الغياب") ? (
                <View style={styles.inlineAbsenceReview}>
                  <Text style={styles.inlineAbsenceHint}>هذا غياب تلقائي — القرار مطلوب قبل خصم الراتب</Text>
                  <View style={styles.inlineAbsenceActions}>
                    <Pressable
                      disabled={attendanceReview.isPending}
                      onPress={async () => {
                        try {
                          await attendanceReview.mutateAsync({ staffAccountId: Number((item as any).staffAccountId ?? employee.id), date: String(item.date), kind: "absence", action: "approve" });
                          await managerRequests.refetch();
                          await refresh();
                        } catch {}
                      }}
                      style={styles.inlineApprove}
                    ><Text style={styles.inlineApproveText}>{attendanceReview.isPending ? "..." : "اعتماد الغياب"}</Text></Pressable>
                    <Pressable
                      disabled={attendanceReview.isPending}
                      onPress={async () => {
                        try {
                          await attendanceReview.mutateAsync({ staffAccountId: Number((item as any).staffAccountId ?? employee.id), date: String(item.date), kind: "absence", action: "cancel" });
                          await managerRequests.refetch();
                          await refresh();
                        } catch {}
                      }}
                      style={styles.inlineCancel}
                    ><Text style={styles.inlineCancelText}>استثناء من الغياب</Text></Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <IconSymbol name="calendar" size={28} color="#98A6B8" />
            <Text style={styles.emptyTitle}>لا يوجد سجل حضور بعد</Text>
            <Text style={styles.emptyText}>ستظهر هنا تفاصيل أيام الحضور والانصراف.</Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  inlineAbsenceReview: { marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: "#FFF8ED", borderWidth: 1, borderColor: "#F4D7A1", gap: 8 },
  inlineAbsenceHint: { color: "#8A5A00", fontSize: 9, fontWeight: "800", textAlign: "right" },
  inlineAbsenceActions: { flexDirection: "row-reverse", gap: 7 },
  inlineApprove: { flex: 1, backgroundColor: "#163A63", borderRadius: 9, paddingVertical: 8, alignItems: "center" },
  inlineApproveText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  inlineCancel: { flex: 1, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E6F2", borderRadius: 9, paddingVertical: 8, alignItems: "center" },
  inlineCancelText: { color: "#31577F", fontSize: 9, fontWeight: "900" },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  hero: {
    backgroundColor: "#163A63",
    borderRadius: 24,
    padding: 20,
    overflow: "hidden",
  },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 13 },
  heroIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
  },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: "#D9E6F2", fontSize: 11, textAlign: "right" },
  heroValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", textAlign: "right", marginTop: 2 },
  heroHint: { color: "#BFD0E1", fontSize: 10, textAlign: "right", marginTop: 2 },
  rateCircle: {
    width: 70, height: 70, borderRadius: 35, borderWidth: 5,
    borderColor: "#9CC5E8", alignItems: "center", justifyContent: "center",
  },
  rateNumber: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  rateLabel: { color: "#D9E6F2", fontSize: 8, marginTop: 1 },
  progressTrack: { height: 7, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 4, marginTop: 18, overflow: "hidden" },
  progressFill: { height: 7, backgroundColor: "#9CC5E8", borderRadius: 4 },
  kpiGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10 },
  kpi: {
    width: "48%", backgroundColor: "#FFFFFF", borderRadius: 18,
    padding: 15, borderWidth: 1, borderColor: "#E8EDF3",
  },
  kpiValue: { color: "#172033", fontSize: 23, fontWeight: "900", textAlign: "right" },
  kpiLabel: { color: "#667085", fontSize: 11, fontWeight: "700", textAlign: "right", marginTop: 3 },
  reviewPanel: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 15, borderWidth: 1, borderColor: "#D9E6F2", gap: 10 },
  reviewHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  reviewBadge: { minWidth: 32, height: 32, borderRadius: 10, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" },
  reviewBadgeText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  reviewCopy: { flex: 1 },
  reviewTitle: { color: "#172033", fontSize: 13, fontWeight: "900", textAlign: "right" },
  reviewText: { color: "#667085", fontSize: 10, lineHeight: 16, marginTop: 2, textAlign: "right" },
  reviewEmpty: { color: "#98A6B8", fontSize: 10, textAlign: "right", paddingVertical: 5 },
  absenceCard: { backgroundColor: "#F7F9FC", borderRadius: 14, padding: 11, flexDirection: "row-reverse", alignItems: "center", gap: 9 },
  absenceInfo: { flex: 1 },
  absenceName: { color: "#172033", fontSize: 12, fontWeight: "800", textAlign: "right" },
  absenceDate: { color: "#667085", fontSize: 10, marginTop: 3, textAlign: "right" },
  absenceActions: { flexDirection: "row-reverse", gap: 6 },
  approveAbsence: { backgroundColor: "#163A63", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11 },
  approveAbsenceText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  cancelAbsence: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D9E6F2", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11 },
  cancelAbsenceText: { color: "#31577F", fontSize: 10, fontWeight: "800" },
  insight: {
    backgroundColor: "#F2F5F8", borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: "#D9E6F2",
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
  },
  insightIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  insightCopy: { flex: 1 },
  insightTitle: { color: "#163A63", fontSize: 12, fontWeight: "800", textAlign: "right" },
  insightText: { color: "#667085", fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: "right" },
  row: {
    backgroundColor: "#FFFFFF", borderRadius: 18, padding: 13,
    flexDirection: "row-reverse", alignItems: "center", gap: 11,
    borderWidth: 1, borderColor: "#E8EDF3",
  },
  dateBox: {
    width: 46, height: 50, backgroundColor: "#F7F9FC", borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  dateDay: { color: "#172033", fontWeight: "900", fontSize: 18 },
  dateMonth: { color: "#98A6B8", fontSize: 9, marginTop: 1 },
  rowMain: { flex: 1 },
  rowHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowDate: { color: "#172033", fontSize: 13, fontWeight: "800", textAlign: "right", flex: 1 },
  rowTime: { color: "#667085", fontSize: 11, marginTop: 7, textAlign: "right" },
  lateText: { color: "#31577F", fontSize: 10, fontWeight: "700", marginTop: 4, textAlign: "right" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 7 },
  emptyTitle: { color: "#172033", fontSize: 15, fontWeight: "800" },
  emptyText: { color: "#98A6B8", fontSize: 11 },
  syncRow: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#E8EDF3", flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  syncCopy: { flex: 1 },
  syncTitle: { color: "#172033", fontSize: 12, fontWeight: "800", textAlign: "right" },
  syncText: { color: "#667085", fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: "right" },
  syncButton: { backgroundColor: "#163A63", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 13 },
  syncButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
});
