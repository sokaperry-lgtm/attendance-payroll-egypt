import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, SurfaceCard, UI } from "@/components/ui/design-system";
import { exportAttendanceReportPdf, type AttendancePdfReport } from "@/lib/attendance-pdf";
import { showAlert } from "@/lib/alert";
import { buildDepartmentStats, buildStatusStats, buildWeeklyStats, calculateAttendanceRate, summarizePayroll } from "@/lib/dashboard-utils";
import { trpc } from "@/lib/trpc";
import { useAppData } from "@/lib/app-data";

function shiftMonth(value: string, delta: number) { const [y, m] = value.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

type ReportRecord = { date: string; status: string; lateMinutes: number; checkIn?: string | null; checkOut?: string | null };
type ReportEmployee = { id: number; name: string; department?: string | null; lateMinutes: number; absentDays: number; presentDays: number; pendingRequests?: number; records: ReportRecord[] };

type Tone = "blue" | "green" | "orange" | "red" | "purple";
const toneMap: Record<Tone, { bg: string; color: string }> = {
  blue: { bg: "#EAF3FB", color: "#163A63" },
  green: { bg: "#EEF4FA", color: "#245A86" },
  orange: { bg: "#F7F1E7", color: "#8A6420" },
  red: { bg: "#F7ECEC", color: "#8B3D3D" },
  purple: { bg: "#F1F4F7", color: "#3E5872" },
};

export default function ReportsScreen() {
  const { role } = useAppData();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const [month, setMonth] = useState(() => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return values.year + "-" + values.month;
  });
  const payrollAccess = ["owner", "manager", "hr", "accountant"].includes(role);
  const adminPayrollView = ["owner", "manager", "hr", "accountant"].includes(role);
  const reportQuery = trpc.reports.month.useQuery({ month });
  const payrollQuery = trpc.payroll.list.useQuery({ month }, { enabled: payrollAccess, retry: false });
  const [exporting, setExporting] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | "all">("all");

  const report = reportQuery.data;
  const allEmployees = (report?.employees ?? []) as ReportEmployee[];
  const allPayrollRows = payrollQuery.data ?? [];
  const employees = selectedEmployeeId === "all" ? allEmployees : allEmployees.filter((employee) => employee.id === selectedEmployeeId);
  const payrollRows = selectedEmployeeId === "all" ? allPayrollRows : allPayrollRows.filter((row) => Number(row.staffAccountId) === selectedEmployeeId);
  const summary = { staffCount: employees.length, presentDays: employees.reduce((sum, employee) => sum + employee.presentDays, 0), absentDays: employees.reduce((sum, employee) => sum + employee.absentDays, 0), lateMinutes: employees.reduce((sum, employee) => sum + employee.lateMinutes, 0), pendingRequests: employees.reduce((sum, employee) => sum + (employee.pendingRequests ?? 0), 0) };
  const attendanceRate = calculateAttendanceRate(summary);
  const payrollSummary = summarizePayroll(payrollRows);

  const allRecords = useMemo(() => employees.flatMap((employee) => employee.records), [employees]);
  const statusStats = useMemo(() => buildStatusStats(allRecords), [allRecords]);
  const maxStatus = Math.max(...statusStats.map((item) => item.count), 1);
  const totalStatusRecords = statusStats.reduce((sum, item) => sum + item.count, 0);

  const weeklyStats = useMemo(() => buildWeeklyStats(allRecords), [allRecords]);
  const maxWeekly = Math.max(...weeklyStats.map((item) => item.value), 1);

  const departmentStats = useMemo(() => buildDepartmentStats(employees), [employees]);

  const topLate = [...employees].sort((a, b) => b.lateMinutes - a.lateMinutes).slice(0, 5);

  if (reportQuery.isLoading) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color={UI.primary} /><Text style={styles.stateText}>جاري تجهيز لوحة المؤشرات...</Text></View></ScreenContainer>;
  }

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const exportReport = { ...report, employees, summary };
      await exportAttendanceReportPdf(exportReport as AttendancePdfReport, { companyName: "الشركة الرئيسية", branchName: "الفرع الرئيسي" });
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
        <View style={[styles.toolbar, compact && styles.toolbarCompact]}>
          <View><Text style={styles.toolbarTitle}>{role === "owner" || role === "manager" ? "لوحة الإدارة" : "لوحة الفريق"}</Text><Text style={styles.toolbarHint}>تقرير شهر {month}</Text></View>
          <View style={[styles.toolbarActions, compact && styles.toolbarActionsCompact]}><View style={styles.monthPicker}><Pressable onPress={() => setMonth(shiftMonth(month, 1))}><Text style={styles.monthArrow}>‹</Text></Pressable><Text style={styles.monthValue}>{month}</Text><Pressable onPress={() => setMonth(shiftMonth(month, -1))}><Text style={styles.monthArrow}>›</Text></Pressable></View>
            <Pressable onPress={() => setFilterOpen(true)} style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
              <IconSymbol name="line.3.horizontal.decrease" size={16} color={UI.primary} />
              <Text style={styles.filterText}>{selectedEmployeeId === "all" ? "كل الموظفين" : employees[0]?.name || "موظف"}</Text>
            </Pressable>
            <Pressable onPress={handleExport} disabled={exporting} style={({ pressed }) => [styles.exportButton, exporting && styles.disabled, pressed && styles.pressed]}>
              <IconSymbol name="arrow.down.doc.fill" size={17} color="#FFFFFF" />
              <Text style={styles.exportText}>{exporting ? "جاري التجهيز..." : "تصدير PDF"}</Text>
            </Pressable>
          </View>
        </View>

        <SectionTitle title="صحة الحضور" subtitle="مؤشرات الفريق الأساسية" />
        <View style={styles.kpiGrid}>
          <KpiCard label="نسبة الحضور" value={`${attendanceRate}%`} caption="من السجلات المتاحة" tone="blue" icon="chart.bar.fill" />
          <KpiCard label="أيام الحضور" value={summary.presentDays} caption="حضور أو مأمورية" tone="green" icon="checkmark" />
          <KpiCard label="دقائق التأخير" value={summary.lateMinutes} caption="تحتاج متابعة" tone="orange" icon="clock" />
          <KpiCard label="طلبات معلقة" value={summary.pendingRequests} caption="بانتظار المراجعة" tone="purple" icon="doc.text.fill" />
        </View>}

        <View style={[styles.chartRow, compact && styles.chartRowCompact]}>
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

        {adminPayrollView && <SectionTitle title="ملخص الرواتب" subtitle="التكلفة والاعتمادات لهذا الشهر" />}
        {adminPayrollView && <View style={styles.payrollGrid}>
          <MetricCard label="صافي الرواتب" value={`${payrollSummary.totalPayroll.toLocaleString("ar-EG")} ج.م`} tone="blue" />
          <MetricCard label="خصومات الحضور" value={`${payrollSummary.totalAttendanceDeductions.toLocaleString("ar-EG")} ج.م`} tone="red" />
          <MetricCard label="الأوفر تايم" value={`${payrollSummary.totalOvertime.toLocaleString("ar-EG")} ج.م`} tone="orange" />
          <MetricCard label="المسيرات المعتمدة" value={`${payrollSummary.approvedPayroll} / ${payrollSummary.totalPayrollRows}`} tone="green" />
        </View>}

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
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>تصفية التقرير</Text><Text style={styles.sheetSubtitle}>اختر نطاق التقرير المطلوب</Text></View><Pressable onPress={() => setFilterOpen(false)}><Text style={styles.closeText}>إغلاق</Text></Pressable></View>
            <Pressable style={[styles.employeeOption, selectedEmployeeId === "all" && styles.employeeOptionActive]} onPress={() => { setSelectedEmployeeId("all"); setFilterOpen(false); }}><View style={styles.optionAvatar}><Text style={styles.optionAvatarText}>كل</Text></View><View style={styles.optionCopy}><Text style={styles.optionName}>كل الموظفين</Text><Text style={styles.optionMeta}>{allEmployees.length} موظف في التقرير</Text></View>{selectedEmployeeId === "all" && <Text style={styles.selectedMark}>✓</Text>}</Pressable>
            <ScrollView style={styles.employeeOptions} contentContainerStyle={styles.employeeOptionsContent}>{allEmployees.map((employee) => <Pressable key={employee.id} style={[styles.employeeOption, selectedEmployeeId === employee.id && styles.employeeOptionActive]} onPress={() => { setSelectedEmployeeId(employee.id); setFilterOpen(false); }}><View style={styles.optionAvatar}><Text style={styles.optionAvatarText}>{employee.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</Text></View><View style={styles.optionCopy}><Text style={styles.optionName}>{employee.name}</Text><Text style={styles.optionMeta}>{employee.department || "عام"} · {employee.presentDays} حضور · {employee.absentDays} غياب</Text></View>{selectedEmployeeId === employee.id && <Text style={styles.selectedMark}>✓</Text>}</Pressable>)}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  toolbarCompact: { flexDirection: "column", alignItems: "stretch" }, toolbar: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 13, borderWidth: 1, borderColor: "#D6E2DC" }, toolbarActionsCompact: { flexWrap: "wrap", justifyContent: "stretch" }, toolbarActions: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  monthPicker: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F6F8FA", borderRadius: 11, paddingHorizontal: 8, paddingVertical: 5 }, monthArrow: { color: UI.primary, fontSize: 20, fontWeight: "900", lineHeight: 20 }, monthValue: { color: UI.ink, fontSize: 10, fontWeight: "900", minWidth: 58, textAlign: "center" },
  toolbarTitle: { color: UI.ink, fontSize: 13, fontWeight: "900", textAlign: "right" }, toolbarHint: { color: UI.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  filterButton: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D6E2DC", borderRadius: 11, paddingVertical: 9, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", gap: 6, maxWidth: 170 }, filterText: { color: UI.primary, fontSize: 10, fontWeight: "900" }, exportButton: { backgroundColor: UI.primary, borderRadius: 11, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, exportText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" }, disabled: { backgroundColor: "#2A3346" }, pressed: { opacity: 0.82 },
  kpiGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" }, kpiCard: { flex: 1, minWidth: 190, minHeight: 142 }, kpiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 12 }, kpiLabel: { color: UI.muted, fontSize: 11, textAlign: "right" }, kpiValue: { color: UI.ink, fontSize: 25, fontWeight: "900", marginTop: 4, textAlign: "right" }, kpiCaption: { fontSize: 9, fontWeight: "700", marginTop: 8, textAlign: "right" },
  chartRowCompact: { flexDirection: "column" }, chartRow: { flexDirection: "row-reverse", gap: 12, flexWrap: "wrap" }, chartCard: { flex: 1.55, minWidth: 330 }, chartCardSmall: { flex: 1, minWidth: 290 },
  barChart: { height: 220, flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-around", gap: 8, paddingTop: 22 }, barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 }, barValue: { color: UI.ink, fontSize: 9, fontWeight: "800" }, barTrack: { height: 145, width: 24, backgroundColor: "#F3F0EA", borderRadius: 9, justifyContent: "flex-end", overflow: "hidden" }, barFill: { width: "100%", backgroundColor: UI.primary, borderRadius: 9 }, barLabel: { color: UI.muted, fontSize: 9 }, empty: { color: "#8A918D", fontSize: 11, textAlign: "center", padding: 20 },
  distributionBar: { height: 18, flexDirection: "row-reverse", borderRadius: 9, overflow: "hidden", backgroundColor: "#F3F0EA", marginVertical: 17 }, distributionSegment: { height: "100%" }, distributionNote: { color: UI.muted, fontSize: 9, textAlign: "center", marginBottom: 14 }, legend: { gap: 8 }, legendRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 }, legendDot: { width: 8, height: 8, borderRadius: 4 }, legendLabel: { color: UI.muted, fontSize: 10, flex: 1, textAlign: "right" }, legendValue: { color: UI.ink, fontSize: 10, fontWeight: "800", width: 26, textAlign: "right" }, legendTrack: { flex: 1, height: 5, backgroundColor: "#F3F0EA", borderRadius: 9, overflow: "hidden" }, legendFill: { height: "100%", borderRadius: 9 },
  payrollGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" }, metricCard: { flex: 1, minWidth: 190, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: UI.border, borderTopWidth: 4, borderRadius: 16, padding: 15 }, metricLabel: { color: UI.muted, fontSize: 10, textAlign: "right" }, metricValue: { fontSize: 17, fontWeight: "900", marginTop: 9, textAlign: "right" },
  departmentList: { gap: 14, marginTop: 12 }, departmentRow: { gap: 6 }, departmentTop: { flexDirection: "row-reverse", justifyContent: "space-between" }, departmentName: { color: UI.ink, fontSize: 11, fontWeight: "800" }, departmentRate: { color: UI.primary, fontSize: 11, fontWeight: "900" }, departmentTrack: { height: 8, backgroundColor: "#FFFFFF", borderRadius: 9, overflow: "hidden" }, departmentFill: { height: "100%", backgroundColor: UI.primary, borderRadius: 9 },
  lateList: { gap: 9, marginTop: 10 }, lateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: "#F3F0EA", paddingBottom: 9 }, lateBadge: { width: 46, height: 42, borderRadius: 12, backgroundColor: "#F7EBDD", alignItems: "center", justifyContent: "center" }, lateBadgeValue: { color: "#FB923C", fontSize: 14, fontWeight: "900" }, lateBadgeLabel: { color: "#FB923C", fontSize: 8 }, lateCopy: { flex: 1 }, lateName: { color: UI.ink, fontSize: 11, fontWeight: "800", textAlign: "right" }, lateMeta: { color: UI.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.42)", justifyContent: "flex-end" }, filterSheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: "82%", width: "100%" }, sheetHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 13 }, sheetTitle: { color: UI.ink, fontSize: 18, fontWeight: "900", textAlign: "right" }, sheetSubtitle: { color: UI.muted, fontSize: 10, marginTop: 4, textAlign: "right" }, closeText: { color: UI.primary, fontSize: 11, fontWeight: "800", padding: 5 }, employeeOptions: { maxHeight: 390 }, employeeOptionsContent: { gap: 8, paddingBottom: 8 }, employeeOption: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderColor: UI.border, borderRadius: 15, padding: 11 }, employeeOptionActive: { borderColor: "#93C5FD", backgroundColor: "#FFFFFF" }, optionAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#E8EEE9", alignItems: "center", justifyContent: "center" }, optionAvatarText: { color: UI.primary, fontSize: 11, fontWeight: "900" }, optionCopy: { flex: 1 }, optionName: { color: UI.ink, fontSize: 12, fontWeight: "900", textAlign: "right" }, optionMeta: { color: UI.muted, fontSize: 9, marginTop: 3, textAlign: "right" }, selectedMark: { color: UI.primary, fontSize: 18, fontWeight: "900" },
});
