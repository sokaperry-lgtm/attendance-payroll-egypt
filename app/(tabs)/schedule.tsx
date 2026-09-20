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
      <View style={styles.header}><View><Text style={styles.eyebrow}>{role === "manager" ? "توزيع ورديات الفريق" : "مواعيد عملك"}</Text><Text style={styles.title}>جدول الأسبوع</Text><Text style={styles.subtitle}>اعرف ميعادك قبل بداية كل يوم</Text></View><View style={styles.iconBubble}><IconSymbol name="calendar" size={24} color="#163A63" /></View></View>
      <View style={styles.weekHero}>
        <View style={styles.weekHeroIcon}><IconSymbol name="calendar" size={23} color="#FFFFFF" /></View>
        <View style={styles.weekHeroCopy}><Text style={styles.weekHeroTitle}>أسبوعك جاهز</Text><Text style={styles.weekHeroText}>راجع الورديات والإجازات قبل بداية كل يوم.</Text></View>
        <View style={styles.weekHeroCount}><Text style={styles.weekHeroNumber}>{week.length}</Text><Text style={styles.weekHeroLabel}>أيام</Text></View>
      </View>
      <View style={styles.shiftLegend}><Text style={styles.legendTitle}>الورديات والإجازات المعتمدة</Text><View style={styles.legendRow}>{shiftTemplates.map((shift) => <View key={shift.id} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: shift.kind === "weekly_off" ? "#B77A32" : shift.crossesMidnight ? "#A78BFA" : "#163A63" }]} /><View><Text style={styles.legendName}>{shift.name}</Text><Text style={styles.legendTime}>{shiftLabel(shift)}</Text></View></View>)}</View></View>
      {role === "manager" && <View style={styles.managerPanel}><Text style={styles.panelTitle}>اختار الموظف لتوزيع الأسبوع</Text><FlatList data={staffMembers} horizontal showsHorizontalScrollIndicator={false} keyExtractor={(item) => item.id} contentContainerStyle={styles.employeePicker} renderItem={({ item }) => <Pressable onPress={() => setSelectedEmployee(item.id)} style={[styles.employeeChip, item.id === selectedEmployee && styles.employeeChipActive]}><Text style={[styles.employeeChipText, item.id === selectedEmployee && styles.employeeChipTextActive]}>{item.name}</Text></Pressable>} ListEmptyComponent={<Text style={styles.emptyText}>أضف موظفين أولًا من صفحة المدير.</Text>} />{selectedMember && <Text style={styles.selectedHint}>تعديل جدول: {selectedMember.name}</Text>}</View>}
      {role === "manager" && <View style={styles.assignPanel}><Text style={styles.panelTitle}>تعيين وردية أو إجازة ليوم {week.find((day) => day.key === selectedDay)?.label}</Text><View style={styles.shiftButtons}>{shiftTemplates.map((shift) => <Pressable key={shift.id} disabled={saving} onPress={() => assignShift(shift)} style={[styles.shiftButton, saving && styles.disabled, shift.crossesMidnight && styles.nightButton, shift.kind === "weekly_off" && styles.offButton]}><Text style={styles.shiftButtonName}>{shift.name}</Text><Text style={styles.shiftButtonTime}>{shiftLabel(shift)}</Text><Text style={styles.assignText}>اضغط للتعيين</Text></Pressable>)}</View></View>}
    </>}
    renderItem={({ item }) => { const entry = role === "manager" ? findSchedule(visibleEntries, selectedEmployee, item.key) : visibleEntries.find((schedule) => schedule.scheduleDate === item.key); const isSelected = item.key === selectedDay; return <Pressable onPress={() => role === "manager" && setSelectedDay(item.key)} style={[styles.dayCard, isSelected && role === "manager" && styles.daySelected, item.key === week[0].key && styles.todayCard]}><View style={styles.dayTop}><View style={styles.datePill}><Text style={styles.datePillText}>{item.date}</Text></View><View><Text style={styles.dayName}>{item.label}</Text><Text style={styles.dayHint}>{item.key === week[0].key ? "وردية اليوم" : "جدول العمل"}</Text></View></View><View style={styles.dayDivider} />{entry?.shift ? <View style={styles.assignedRow}><View style={[styles.shiftMarker, { backgroundColor: entry.shift.kind === "weekly_off" ? "#B77A32" : entry.shift.crossesMidnight ? "#A78BFA" : "#163A63" }]} /><View style={styles.assignedCopy}><Text style={styles.assignedName}>{entry.shift.name}</Text><Text style={styles.assignedTime}>{shiftLabel(entry.shift)}</Text></View><IconSymbol name="checkmark" size={22} color="#163A63" /></View> : <View style={styles.unassigned}><IconSymbol name="clock" size={22} color="#667085" /><Text style={styles.unassignedText}>{role === "manager" ? "لم تحدد وردية — اختر اليوم ثم اضغط على وردية" : "لم يتم تحديد وردية لك بعد"}</Text></View>}</Pressable>}}
    ListFooterComponent={<View style={styles.footer}><IconSymbol name="info" size={19} color="#163A63" /><Text style={styles.footerText}>الشيفت المسائي ينتهي الساعة 1:00 بعد منتصف الليل، ويُحسب حضوره على يوم بداية الشيفت.</Text></View>}
  /></ScreenContainer>;
}

const styles = StyleSheet.create({
  weekHero: { backgroundColor: "#FFFFFF", borderRadius: 23, 18: 24, flexDirection: "row-reverse", alignItems: "center", 12: 24 },
  weekHeroIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" },
  weekHeroCopy: { flex: 1 },
  weekHeroTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", textAlign: "right" },
  weekHeroText: { color: "#667085", fontSize: 10, lineHeight: 16, 3: 24, textAlign: "right" },
  weekHeroCount: { alignItems: "center" },
  weekHeroNumber: { color: "#60A5FA", fontSize: 22, fontWeight: "900" },
  weekHeroLabel: { color: "#667085", fontSize: 10 },
  content: { 20: 24, 45: 24, 14: 24 }, header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", 3: 24 }, eyebrow: { color: "#667085", fontSize: 13, textAlign: "right" }, title: { color: "#172033", fontSize: 26, fontWeight: "800", 5: 24, textAlign: "right" }, subtitle: { color: "#667085", fontSize: 12, 5: 24, textAlign: "right" }, iconBubble: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#EEF4FB", alignItems: "center", justifyContent: "center" }, shiftLegend: { backgroundColor: "#2E5FD9", borderRadius: 20, 16: 24 }, legendTitle: { color: "#BFDBFE", fontSize: 12, fontWeight: "700", textAlign: "right", 12: 24 }, legendRow: { flexDirection: "row-reverse", 10: 24 }, legendItem: { flex: 1, flexDirection: "row-reverse", alignItems: "center", 7: 24 }, legendDot: { width: 9, height: 9, borderRadius: 8 }, legendName: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }, legendTime: { color: "#BFDBFE", fontSize: 10, 3: 24, textAlign: "right" }, managerPanel: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, 15: 24 }, panelTitle: { color: "#172033", fontSize: 13, fontWeight: "800", textAlign: "right", 11: 24 }, employeePicker: { flexDirection: "row-reverse", 8: 24 }, employeeChip: { borderWidth: 1, borderColor: "#8B96A8", borderRadius: 12, 12: 24, 9: 24 }, employeeChipActive: { backgroundColor: "#EEF4FB", borderColor: "#163A63" }, employeeChipText: { color: "#667085", fontSize: 11 }, employeeChipTextActive: { color: "#163A63", fontWeight: "800" }, selectedHint: { color: "#163A63", fontSize: 11, textAlign: "right", 11: 24 }, assignPanel: { backgroundColor: "#FFFFFF", borderRadius: 18, 14: 24 }, shiftButtons: { flexDirection: "row-reverse", 9: 24 }, shiftButton: { flex: 1, backgroundColor: "#163A63", borderRadius: 12, 11: 24, minHeight: 83 }, nightButton: { backgroundColor: "#2A1B45" }, offButton: { backgroundColor: "#2B2410" }, disabled: { opacity: 0.55 }, shiftButtonName: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", textAlign: "right" }, shiftButtonTime: { color: "#BFDBFE", fontSize: 10, 5: 24, textAlign: "right" }, assignText: { color: "#BFDBFE", fontSize: 10, 8: 24, textAlign: "right" }, dayCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E4E7EC", 15: 24 }, todayCard: { borderColor: "#D9E6F2" }, daySelected: { borderColor: "#163A63", borderWidth: 2 }, dayTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, dayName: { color: "#172033", fontSize: 15, fontWeight: "800", textAlign: "right" }, dayHint: { color: "#667085", fontSize: 10, 3: 24, textAlign: "right" }, datePill: { backgroundColor: "#E4E7EC", borderRadius: 12, 10: 24, 7: 24 }, datePillText: { color: "#667085", fontSize: 11, fontWeight: "700" }, dayDivider: { height: 1, backgroundColor: "#E4E7EC", 13: 24 }, assignedRow: { flexDirection: "row-reverse", alignItems: "center", 10: 24 }, shiftMarker: { width: 10, height: 40, borderRadius: 8 }, assignedCopy: { flex: 1 }, assignedName: { color: "#172033", fontSize: 13, fontWeight: "800", textAlign: "right" }, assignedTime: { color: "#667085", fontSize: 12, 4: 24, textAlign: "right" }, unassigned: { flexDirection: "row-reverse", alignItems: "center", 9: 24 }, unassignedText: { color: "#667085", fontSize: 11, flex: 1, textAlign: "right", lineHeight: 18 }, footer: { backgroundColor: "#FFFFFF", borderRadius: 16, 13: 24, flexDirection: "row-reverse", alignItems: "center", 8: 24, borderWidth: 1, borderColor: "#D6E2DC" }, footerText: { color: "#D9E6F2", fontSize: 11, flex: 1, textAlign: "right", lineHeight: 18 }, emptyText: { color: "#667085", fontSize: 11, textAlign: "right" } });
