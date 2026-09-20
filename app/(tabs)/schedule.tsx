import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type ScheduleEntry, type ShiftTemplate } from "@/lib/app-data";

const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function makeWeek() { return Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + index); return { key: dateKey(date), label: index === 0 ? "اليوم" : dayNames[date.getDay()], date: new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(date) }; }); }
function shiftLabel(shift: ShiftTemplate | null | undefined) { return !shift ? "لم تحدد بعد" : shift.kind === "weekly_off" ? "مدفوعة · بدون مواعيد" : `${shift.startTime} — ${shift.endTime}${shift.crossesMidnight ? " · يوم جديد" : ""}`; }
function findSchedule(entries: ScheduleEntry[], staffId: string, day: string) { return entries.find((entry) => String(entry.staffAccountId) === staffId && entry.scheduleDate === day); }

export default function ScheduleScreen() {
  const { role, employee, staffMembers, shiftTemplates, schedules, teamSchedules, saveSchedule } = useAppData();
  const week = useMemo(makeWeek, []);
  const [selectedEmployee, setSelectedEmployee] = useState<string>(staffMembers[0]?.id ?? employee.id);
  const [selectedDay, setSelectedDay] = useState(week[0].key);
  const [saving, setSaving] = useState(false);
  const visibleEntries = role === "manager" ? teamSchedules : schedules;
  const selectedMember = staffMembers.find((member) => member.id === selectedEmployee);

  async function assignShift(shift: ShiftTemplate) {
    if (role !== "manager" || !selectedEmployee) return;
    setSaving(true);
    try {
      await saveSchedule({ staffAccountId: Number(selectedEmployee), scheduleDate: selectedDay, shiftTemplateId: shift.id });
      showAlert("تم حفظ الجدول", `${selectedMember?.name ?? "الموظف"} — ${selectedDay}`);
    } catch (error) {
      showAlert("تعذر حفظ الجدول", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally { setSaving(false); }
  }

  return <ScreenContainer><FlatList
    data={week}
    keyExtractor={(item) => item.key}
    contentContainerStyle={styles.content}
    ListHeaderComponent={<>
      <View style={styles.header}><View><Text style={styles.eyebrow}>{role === "manager" ? "توزيع ورديات الفريق" : "مواعيد عملك"}</Text><Text style={styles.title}>جدول الأسبوع</Text><Text style={styles.subtitle}>اعرف ميعادك قبل بداية كل يوم</Text></View><View style={styles.iconBubble}><IconSymbol name="calendar" size={24} color="#4F7D70" /></View></View>
      <View style={styles.weekHero}>
        <View style={styles.weekHeroIcon}><IconSymbol name="calendar" size={23} color="#FFFFFF" /></View>
        <View style={styles.weekHeroCopy}><Text style={styles.weekHeroTitle}>أسبوعك جاهز</Text><Text style={styles.weekHeroText}>راجع الورديات والإجازات قبل بداية كل يوم.</Text></View>
        <View style={styles.weekHeroCount}><Text style={styles.weekHeroNumber}>{week.length}</Text><Text style={styles.weekHeroLabel}>أيام</Text></View>
      </View>
      <View style={styles.shiftLegend}><Text style={styles.legendTitle}>الورديات والإجازات المعتمدة</Text><View style={styles.legendRow}>{shiftTemplates.map((shift) => <View key={shift.id} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: shift.kind === "weekly_off" ? "#B77A32" : shift.crossesMidnight ? "#A78BFA" : "#355C52" }]} /><View><Text style={styles.legendName}>{shift.name}</Text><Text style={styles.legendTime}>{shiftLabel(shift)}</Text></View></View>)}</View></View>
      {role === "manager" && <View style={styles.managerPanel}><Text style={styles.panelTitle}>اختار الموظف لتوزيع الأسبوع</Text><FlatList data={staffMembers} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.employeePicker} renderItem={({ item }) => <Pressable onPress={() => setSelectedEmployee(item.id)} style={[styles.employeeChip, item.id === selectedEmployee && styles.employeeChipActive]}><Text style={[styles.employeeChipText, item.id === selectedEmployee && styles.employeeChipTextActive]}>{item.name}</Text></Pressable>} ListEmptyComponent={<Text style={styles.emptyText}>أضف موظفين أولًا من صفحة المدير.</Text>} />{selectedMember && <Text style={styles.selectedHint}>تعديل جدول: {selectedMember.name}</Text>}</View>}
      {role === "manager" && <View style={styles.assignPanel}><Text style={styles.panelTitle}>تعيين وردية أو إجازة ليوم {week.find((day) => day.key === selectedDay)?.label}</Text><View style={styles.shiftButtons}>{shiftTemplates.map((shift) => <Pressable key={shift.id} disabled={saving} onPress={() => assignShift(shift)} style={[styles.shiftButton, saving && styles.disabled, shift.crossesMidnight && styles.nightButton, shift.kind === "weekly_off" && styles.offButton]}><Text style={styles.shiftButtonName}>{shift.name}</Text><Text style={styles.shiftButtonTime}>{shiftLabel(shift)}</Text><Text style={styles.assignText}>اضغط للتعيين</Text></Pressable>)}</View></View>}
    </>}
    renderItem={({ item }) => { const entry = role === "manager" ? findSchedule(visibleEntries, selectedEmployee, item.key) : visibleEntries.find((schedule) => schedule.scheduleDate === item.key); const isSelected = item.key === selectedDay; return <Pressable onPress={() => role === "manager" && setSelectedDay(item.key)} style={[styles.dayCard, isSelected && role === "manager" && styles.daySelected, item.key === week[0].key && styles.todayCard]}><View style={styles.dayTop}><View style={styles.datePill}><Text style={styles.datePillText}>{item.date}</Text></View><View><Text style={styles.dayName}>{item.label}</Text><Text style={styles.dayHint}>{item.key === week[0].key ? "وردية اليوم" : "جدول العمل"}</Text></View></View><View style={styles.dayDivider} />{entry?.shift ? <View style={styles.assignedRow}><View style={[styles.shiftMarker, { backgroundColor: entry.shift.kind === "weekly_off" ? "#B77A32" : entry.shift.crossesMidnight ? "#A78BFA" : "#355C52" }]} /><View style={styles.assignedCopy}><Text style={styles.assignedName}>{entry.shift.name}</Text><Text style={styles.assignedTime}>{shiftLabel(entry.shift)}</Text></View><IconSymbol name="checkmark" size={22} color="#2E7D68" /></View> : <View style={styles.unassigned}><IconSymbol name="clock" size={22} color="#92989F" /><Text style={styles.unassignedText}>{role === "manager" ? "لم تحدد وردية — اختر اليوم ثم اضغط على وردية" : "لم يتم تحديد وردية لك بعد"}</Text></View>}</Pressable>}}
    ListFooterComponent={<View style={styles.footer}><IconSymbol name="info" size={19} color="#4F7D70" /><Text style={styles.footerText}>الشيفت المسائي ينتهي الساعة 1:00 بعد منتصف الليل، ويُحسب حضوره على يوم بداية الشيفت.</Text></View>}
  /></ScreenContainer>;
}

const styles = StyleSheet.create({
  weekHero: { backgroundColor: "#263A36", borderRadius: 23, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  weekHeroIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#355C52", alignItems: "center", justifyContent: "center" },
  weekHeroCopy: { flex: 1 },
  weekHeroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", textAlign: "right" },
  weekHeroText: { color: "#92989F", fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: "right" },
  weekHeroCount: { alignItems: "center" },
  weekHeroNumber: { color: "#60A5FA", fontSize: 24, fontWeight: "900" },
  weekHeroLabel: { color: "#92989F", fontSize: 9 },
  content: { padding: 20, paddingBottom: 45, gap: 14 }, header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }, eyebrow: { color: "#7A8088", fontSize: 13, textAlign: "right" }, title: { color: "#20262E", fontSize: 28, fontWeight: "800", marginTop: 5, textAlign: "right" }, subtitle: { color: "#7A8088", fontSize: 12, marginTop: 5, textAlign: "right" }, iconBubble: { width: 50, height: 50, borderRadius: 17, backgroundColor: "#E8EEE9", alignItems: "center", justifyContent: "center" }, shiftLegend: { backgroundColor: "#2E5FD9", borderRadius: 20, padding: 16 }, legendTitle: { color: "#BFDBFE", fontSize: 12, fontWeight: "700", textAlign: "right", marginBottom: 12 }, legendRow: { flexDirection: "row-reverse", gap: 10 }, legendItem: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 7 }, legendDot: { width: 9, height: 9, borderRadius: 5 }, legendName: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }, legendTime: { color: "#BFDBFE", fontSize: 10, marginTop: 3, textAlign: "right" }, managerPanel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E6E1D8", borderRadius: 18, padding: 15 }, panelTitle: { color: "#20262E", fontSize: 13, fontWeight: "800", textAlign: "right", marginBottom: 11 }, employeePicker: { flexDirection: "row-reverse", gap: 8 }, employeeChip: { borderWidth: 1, borderColor: "#8B96A8", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }, employeeChipActive: { backgroundColor: "#E8EEE9", borderColor: "#4F7D70" }, employeeChipText: { color: "#7A8088", fontSize: 11 }, employeeChipTextActive: { color: "#4F7D70", fontWeight: "800" }, selectedHint: { color: "#4F7D70", fontSize: 11, textAlign: "right", marginTop: 11 }, assignPanel: { backgroundColor: "#10161F", borderRadius: 18, padding: 14 }, shiftButtons: { flexDirection: "row-reverse", gap: 9 }, shiftButton: { flex: 1, backgroundColor: "#355C52", borderRadius: 13, padding: 11, minHeight: 83 }, nightButton: { backgroundColor: "#2A1B45" }, offButton: { backgroundColor: "#2B2410" }, disabled: { opacity: 0.55 }, shiftButtonName: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }, shiftButtonTime: { color: "#BFDBFE", fontSize: 10, marginTop: 5, textAlign: "right" }, assignText: { color: "#BFDBFE", fontSize: 9, marginTop: 8, textAlign: "right" }, dayCard: { backgroundColor: "#FFFFFF", borderRadius: 19, borderWidth: 1, borderColor: "#E6E1D8", padding: 15 }, todayCard: { borderColor: "#93C5FD" }, daySelected: { borderColor: "#4F7D70", borderWidth: 2 }, dayTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, dayName: { color: "#20262E", fontSize: 15, fontWeight: "800", textAlign: "right" }, dayHint: { color: "#92989F", fontSize: 10, marginTop: 3, textAlign: "right" }, datePill: { backgroundColor: "#F3F0EA", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 }, datePillText: { color: "#92989F", fontSize: 11, fontWeight: "700" }, dayDivider: { height: 1, backgroundColor: "#F3F0EA", marginVertical: 13 }, assignedRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 }, shiftMarker: { width: 10, height: 40, borderRadius: 5 }, assignedCopy: { flex: 1 }, assignedName: { color: "#20262E", fontSize: 13, fontWeight: "800", textAlign: "right" }, assignedTime: { color: "#7A8088", fontSize: 12, marginTop: 4, textAlign: "right" }, unassigned: { flexDirection: "row-reverse", alignItems: "center", gap: 9 }, unassignedText: { color: "#92989F", fontSize: 11, flex: 1, textAlign: "right", lineHeight: 18 }, footer: { backgroundColor: "#FFFFFF", borderRadius: 15, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#243352" }, footerText: { color: "#93C5FD", fontSize: 11, flex: 1, textAlign: "right", lineHeight: 18 }, emptyText: { color: "#92989F", fontSize: 11, textAlign: "right" } });
