import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, SurfaceCard, UI } from "@/components/ui/design-system";
import { exportAttendanceReportPdf, type AttendancePdfReport } from "@/lib/attendance-pdf";
import { showAlert } from "@/lib/alert";
import { trpc } from "@/lib/trpc";

const month = new Date().toISOString().slice(0, 7);

type ReportRecord = { date: string; status: string; lateMinutes: number; checkIn?: string | null; checkOut?: string | null };
type ReportEmployee = { id: number; name: string; department?: string | null; lateMinutes: number; absentDays: number; presentDays: number; records: ReportRecord[] };

type Tone = "blue" | "green" | "orange" | "red" | "purple";
const toneMap: Record<Tone, { bg: string; color: string }> = {
  blue: { bg: "#EFF6FF", color: "#2563EB" },
  green: { bg: "#ECFDF5", color: "#059669" },
  orange: { bg: "#FFF7ED", color: "#EA580C" },
  red: { bg: "#FEF2F2", color: "#DC2626" },
  purple: { bg: "#FAF5FF", color: "#7C3AED" },
};

export default function ReportsScreen() {
  const reportQuery = trpc.reports.month.useQuery({ month });
  const payrollQuery = trpc.payroll.list.useQuery({ month });
  const [exporting, setExporting] = useState(false);

  const report = reportQuery.data;
  const summary = report?.summary ?? { staffCount: 0, presentDays: 0, absentDays: 0, lateMinutes: 0, pendingRequests: 0 };
  const employees = (report?.employees ?? []) as ReportEmployee[];
  const payrollRows = payrollQuery.data ?? [];
  const totalAttendanceDays = summary.presentDays + summary.absentDays;
  const attendanceRate = totalAttendanceDays ? Math.round((summary.presentDays / totalAttendanceDays) * 100) : 0;
  const approvedPayroll = payrollRows.filter((row) => row.status === "approved").length;
  const totalPayroll = payrollRows.reduce((sum, row) => sum + Number(row.netSalary ?? 0), 0);
  const totalAbsenceDeductions = payrollRows.reduce((sum, row) => sum + Number(row.absenceDeduction ?? 0), 0);
  const totalOvertime = payrollRows.reduce((sum, row) => sum + Number(row.overtime ?? 0), 0);

  const allRecords = useMemo(() => employees.flatMap((employee) => employee.records), [employees]);
  const statusStats = useMemo(() => [
    { label: "حاضر", count: allRecords.filter((record) => record.status === "حاضر").length, color: "#10B981" },
    { label: "متأخر", count: allRecords.filter((record) => record.status === "متأخر").length, color: "#F59E0B" },
    { label: "مأمورية", count: allRecords.filter((record) => record.status === "مأمورية").length, color: "#3B82F6" },
    { label: "غياب", count: allRecords.filter((record) => record.status === "غياب").length, color: "#EF4444" },
    { label: "إجازة", count: allRecords.filter((record) => record.status === "إجازة").length, color: "#8B5CF6" },
  ], [allRecords]);
  const maxStatus = Math.max(...statusStats.map((item) => item.count), 1);
  const totalStatusRecords = statusStats.reduce((sum, item) => sum + item.count, 0);

  const weeklyStats = useMemo(() => {
    const groups = new Map<string, { total: number; present: number }>();
    allRecords.forEach((record) => {
      const current = groups.get(record.date) ?? { total: 0, present: 0 };
      current.total += 1;
      if (["حاضر", "متأخر", "مأمورية"].includes(record.status)) current.present += 1;
      groups.set(record.date, current);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([date, value]) => ({
      label: new Intl.DateTimeFormat("ar-EG", { weekday: "short" }).format(new Date(`${date}T00:00:00`)),
      date,
      value: value.total ? Math.round((value.present / value.total) * 100) : 0,
    }));
  }, [allRecords]);
  const maxWeekly = Math.max(...weeklyStats.map((item) => item.value), 1);

  const departmentStats = useMemo(() => {
    const groups = new Map<string, { present: number; absent: number }>();
    employees.forEach((employee) => {
      const department = employee.department || "عام";
      const current = groups.get(department) ?? { present: 0, absent: 0 };
      current.present += employee.presentDays;
      current.absent += employee.absentDays;
      groups.set(department, current);
    });
    return [...groups.entries()].map(([name, value]) => ({ name, rate: value.present + value.absent ? Math.round((value.present / (value.present + value.absent)) * 100) : 0 })).sort((a, b) => b.rate - a.rate).slice(0, 5);
  }, [employees]);

  const topLate = [...employees].sort((a, b) => b.lateMinutes - a.lateMinutes).slice(0, 5);

  if (reportQuery.isLoading) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color={UI.primary} /><Text style={styles.stateText}>جاري تجهيز لوحة المؤشرات...</Text></View></ScreenContainer>;
  }

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportAttendanceReportPdf(report as AttendancePdfReport, { companyName: "الشركة الرئيسية", branchName: "الفرع الرئيسي" });
    } catch (error) {
      showAlert("تعذر تصدير التقرير", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow={`EXECUTIVE DASHBOARD · ${month}`} title="لوحة الحضور والرواتب" subtitle="قراءة تشغيلية مرئية لأداء الفريق وتكلفة الشهر." icon="chart.bar.fill" />
        <View style={styles.toolbar}>
          <View><Text style={styles.toolbarTitle}>نظرة المدير</Text><Text style={styles.toolbarHint}>البيانات محدثة لهذا الشهر</Text></View>
          <Pressable onPress={handleExport} disabled={exporting} style={({ pressed }) => [styles.exportButton, exporting && styles.disabled, pressed && styles.pressed]}>
            <IconSymbol name="arrow.down.doc.fill" size={17} color="#FFFFFF" />
            <Text style={styles.exportText}>{exporting ? "جاري التجهيز..." : "تصدير PDF"}</Text>
          </Pressable>
        </View>

        <SectionTitle title="صحة الحضور" subtitle="مؤشرات الفريق الأساسية" />
        <View style={styles.kpiGrid}>
          <KpiCard label="نسبة الحضور" value={`${attendanceRate}%`} caption="من السجلات المتاحة" tone="blue" icon="chart.bar.fill" />
          <KpiCard label="أيام الحضور" value={summary.presentDays} caption="حضور أو مأمورية" tone="green" icon="checkmark" />
          <KpiCard label="دقائق التأخير" value={summary.lateMinutes} caption="تحتاج متابعة" tone="orange" icon="clock" />
          <KpiCard label="طلبات معلقة" value={summary.pendingRequests} caption="بانتظار المراجعة" tone="purple" icon="doc.text.fill" />
        </View>

        <View style={styles.chartRow}>
          <SurfaceCard style={styles.chartCard}>
            <SectionTitle title="معدل الحضور اليومي" subtitle="آخر 7 أيام مسجلة" />
            <View style={styles.barChart}>
              {weeklyStats.length ? weeklyStats.map((item) => <View key={item.date} style={styles.barColumn}><Text style={styles.barValue}>{item.value}%</Text><View style={styles.barTrack}><View style={[styles.barFill, { height: `${Math.max(8, (item.value / maxWeekly) * 100)}%` }]} /></View><Text style={styles.barLabel}>{item.label}</Text></View>) : <Text style={styles.empty}>لا توجد بيانات كافية للرسم البياني.</Text>}
            </View>
          </SurfaceCard>
          <SurfaceCard style={styles.chartCardSmall}>
            <SectionTitle title="توزيع الحالات" subtitle="حسب السجلات" />
            <View style={styles.distributionBar}>{statusStats.map((item) => <View key={item.label} style={[styles.distributionSegment, { backgroundColor: item.color, width: `${totalStatusRecords ? (item.count / totalStatusRecords) * 100 : 0}%` }]} />)}</View>
            <Text style={styles.distributionNote}>التوزيع الفعلي لكل سجلات الشهر</Text>
            <View style={styles.legend}>{statusStats.map((item) => <View key={item.label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><Text style={styles.legendLabel}>{item.label}</Text><Text style={styles.legendValue}>{item.count}</Text><View style={styles.legendTrack}><View style={[styles.legendFill, { backgroundColor: item.color, width: `${(item.count / maxStatus) * 100}%` }]} /></View></View>)}</View>
          </SurfaceCard>
        </View>

        <SectionTitle title="ملخص الرواتب" subtitle="التكلفة والاعتمادات لهذا الشهر" />
        <View style={styles.payrollGrid}>
          <MetricCard label="صافي الرواتب" value={`${totalPayroll.toLocaleString("ar-EG")} ج.م`} tone="blue" />
          <MetricCard label="خصومات الغياب" value={`${totalAbsenceDeductions.toLocaleString("ar-EG")} ج.م`} tone="red" />
          <MetricCard label="الأوفر تايم" value={`${totalOvertime.toLocaleString("ar-EG")} ج.م`} tone="orange" />
          <MetricCard label="المسيرات المعتمدة" value={`${approvedPayroll} / ${payrollRows.length}`} tone="green" />
        </View>

        <View style={styles.chartRow}>
          <SurfaceCard style={styles.chartCard}>
            <SectionTitle title="الحضور حسب القسم" subtitle="ترتيب الأقسام حسب الالتزام" />
            <View style={styles.departmentList}>{departmentStats.length ? departmentStats.map((item) => <View key={item.name} style={styles.departmentRow}><View style={styles.departmentTop}><Text style={styles.departmentName}>{item.name}</Text><Text style={styles.departmentRate}>{item.rate}%</Text></View><View style={styles.departmentTrack}><View style={[styles.departmentFill, { width: `${item.rate}%` }]} /></View></View>) : <Text style={styles.empty}>لا توجد أقسام مسجلة بعد.</Text>}</View>
          </SurfaceCard>
          <SurfaceCard style={styles.chartCardSmall}>
            <SectionTitle title="الأكثر تأخيرًا" subtitle="للمتابعة الإدارية" />
            <View style={styles.lateList}>{topLate.length ? topLate.map((employee) => <View key={employee.id} style={styles.lateRow}><View style={styles.lateBadge}><Text style={styles.lateBadgeValue}>{employee.lateMinutes}</Text><Text style={styles.lateBadgeLabel}>د</Text></View><View style={styles.lateCopy}><Text style={styles.lateName}>{employee.name}</Text><Text style={styles.lateMeta}>{employee.department || "عام"} · {employee.absentDays} غياب</Text></View></View>) : <Text style={styles.empty}>لا توجد بيانات تأخير.</Text>}</View>
          </SurfaceCard>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function KpiCard({ label, value, caption, tone, icon }: { label: string; value: string | number; caption: string; tone: Tone; icon: string }) {
  const palette = toneMap[tone];
  return <SurfaceCard style={styles.kpiCard}><View style={[styles.kpiIcon, { backgroundColor: palette.bg }]}><IconSymbol name={icon as never} size={17} color={palette.color} /></View><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue}>{value}</Text><Text style={[styles.kpiCaption, { color: palette.color }]}>{caption}</Text></SurfaceCard>;
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const palette = toneMap[tone];
  return <View style={[styles.metricCard, { borderTopColor: palette.color }]}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color: palette.color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1240, width: "100%", alignSelf: "center" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, stateText: { color: UI.muted, fontSize: 13 },
  toolbar: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", backgroundColor: "#EFF6FF", borderRadius: 16, padding: 13, borderWidth: 1, borderColor: "#DBEAFE" },
  toolbarTitle: { color: UI.ink, fontSize: 13, fontWeight: "900", textAlign: "right" }, toolbarHint: { color: UI.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  exportButton: { backgroundColor: UI.primary, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, exportText: { color: "#FFF", fontSize: 11, fontWeight: "900" }, disabled: { backgroundColor: "#94A3B8" }, pressed: { opacity: 0.82 },
  kpiGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" }, kpiCard: { flex: 1, minWidth: 190, minHeight: 142 }, kpiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 }, kpiLabel: { color: UI.muted, fontSize: 11, textAlign: "right" }, kpiValue: { color: UI.ink, fontSize: 25, fontWeight: "900", marginTop: 4, textAlign: "right" }, kpiCaption: { fontSize: 9, fontWeight: "700", marginTop: 8, textAlign: "right" },
  chartRow: { flexDirection: "row-reverse", gap: 12, flexWrap: "wrap" }, chartCard: { flex: 1.55, minWidth: 330 }, chartCardSmall: { flex: 1, minWidth: 290 },
  barChart: { height: 220, flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-around", gap: 8, paddingTop: 22 }, barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 }, barValue: { color: UI.ink, fontSize: 9, fontWeight: "800" }, barTrack: { height: 145, width: 24, backgroundColor: "#F1F5F9", borderRadius: 9, justifyContent: "flex-end", overflow: "hidden" }, barFill: { width: "100%", backgroundColor: UI.primary, borderRadius: 9 }, barLabel: { color: UI.muted, fontSize: 9 }, empty: { color: "#94A3B8", fontSize: 11, textAlign: "center", padding: 20 },
  distributionBar: { height: 18, flexDirection: "row-reverse", borderRadius: 9, overflow: "hidden", backgroundColor: "#F1F5F9", marginVertical: 17 }, distributionSegment: { height: "100%" }, distributionNote: { color: UI.muted, fontSize: 9, textAlign: "center", marginBottom: 14 }, legend: { gap: 8 }, legendRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendLabel: { color: UI.muted, fontSize: 10, flex: 1, textAlign: "right" }, legendValue: { color: UI.ink, fontSize: 10, fontWeight: "800", width: 26, textAlign: "right" }, legendTrack: { flex: 1, height: 5, backgroundColor: "#F1F5F9", borderRadius: 9, overflow: "hidden" }, legendFill: { height: "100%", borderRadius: 9 },
  payrollGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" }, metricCard: { flex: 1, minWidth: 190, backgroundColor: "#FFF", borderWidth: 1, borderColor: UI.border, borderTopWidth: 4, borderRadius: 16, padding: 15 }, metricLabel: { color: UI.muted, fontSize: 10, textAlign: "right" }, metricValue: { fontSize: 17, fontWeight: "900", marginTop: 9, textAlign: "right" },
  departmentList: { gap: 14, marginTop: 12 }, departmentRow: { gap: 6 }, departmentTop: { flexDirection: "row-reverse", justifyContent: "space-between" }, departmentName: { color: UI.ink, fontSize: 11, fontWeight: "800" }, departmentRate: { color: UI.primary, fontSize: 11, fontWeight: "900" }, departmentTrack: { height: 8, backgroundColor: "#EFF6FF", borderRadius: 9, overflow: "hidden" }, departmentFill: { height: "100%", backgroundColor: UI.primary, borderRadius: 9 },
  lateList: { gap: 9, marginTop: 10 }, lateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#F1F5F9", paddingBottom: 9 }, lateBadge: { width: 46, height: 42, borderRadius: 12, backgroundColor: "#FFF7ED", alignItems: "center", justifyContent: "center" }, lateBadgeValue: { color: "#EA580C", fontSize: 14, fontWeight: "900" }, lateBadgeLabel: { color: "#C2410C", fontSize: 8 }, lateCopy: { flex: 1 }, lateName: { color: UI.ink, fontSize: 11, fontWeight: "800", textAlign: "right" }, lateMeta: { color: UI.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
});
