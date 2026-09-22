import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type ScheduleEntry, type ShiftTemplate } from "@/lib/app-data";

const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function makeWeek(weekOffset = 0) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const saturdayOffset = (today.getDay() + 1) % 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - saturdayOffset + (weekOffset * 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    return {
      key: dateKey(d),
      label: dayNames[d.getDay()],
      date: new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "short" }).format(d),
      day: d.getDate(),
      isToday: dateKey(d) === dateKey(today),
    };
  });
}
function findSchedule(entries: ScheduleEntry[], staffId: string, day: string) {
  return entries.find(e => String(e.staffAccountId) === staffId && e.scheduleDate === day);
}
function shiftLabel(s: ShiftTemplate | null | undefined) {
  if (!s) return "غير محدد";
  if (s.kind === "weekly_off") return "إجازة";
  return `${s.startTime} — ${s.endTime}`;
}
function tone(s: ShiftTemplate | null | undefined, paletteIndex?: number) {
  if (!s) return { bg: "#F6F8FA", accent: "#A1ACBA", text: "#667085" };
  if (s.kind === "weekly_off") return { bg: "#FFF0E1", accent: "#E05A33", text: "#A33A20" };
  if (s.crossesMidnight) return { bg: "#EEE8FF", accent: "#7655D6", text: "#5135A8" };
  const palettes = [
    { bg: "#E2F0FF", accent: "#1677D2", text: "#0D4F93" },
    { bg: "#E3F8EF", accent: "#149A67", text: "#08704A" },
    { bg: "#FFF0F0", accent: "#D94A5B", text: "#9F2638" },
    { bg: "#FFF3D6", accent: "#D58A00", text: "#965E00" },
    { bg: "#EDE8FF", accent: "#7655D6", text: "#5135A8" },
  ];
  const index = paletteIndex ?? 0;
  return palettes[index % palettes.length];
}

export default function ScheduleScreen() {
  const { role, employee, records, staffMembers, shiftTemplates, schedules, teamSchedules, teamAttendance, saveSchedule } = useAppData();
  const router = useRouter();
  const updateAttendance = trpc.attendance.managerUpdate.useMutation();
  const [weekOffset, setWeekOffset] = useState(0);
  const week = useMemo(() => makeWeek(weekOffset), [weekOffset]);
  const [selectedEmployee, setSelectedEmployee] = useState(staffMembers[0]?.id ?? employee.id);
  const [selectedDay, setSelectedDay] = useState(week[0].key);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "حاضر" | "متأخر" | "غياب" | "إجازة" | "فارغ">("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailForm, setDetailForm] = useState({ checkIn: "", checkOut: "", lateMinutes: "0", status: "حاضر" as "حاضر" | "متأخر" | "غياب" | "إجازة" | "مأمورية", note: "" });
  const weekRange = `${week[0]?.date ?? ""} — ${week[6]?.date ?? ""}`;
  const adminRole = role === "owner" || adminRole;
  const visible = adminRole ? teamSchedules : schedules;
  const attendanceVisible = adminRole ? teamAttendance : records;
  const weekDayStats = useMemo(() => week.map((day) => ({
    ...day,
    scheduled: visible.filter((entry) => entry.scheduleDate === day.key).length,
    off: visible.filter((entry) => entry.scheduleDate === day.key && entry.shift?.kind === "weekly_off").length,
  })), [week, visible]);
  const member = staffMembers.find(m => m.id === selectedEmployee);
  const selectedEntry = findSchedule(visible, selectedEmployee, selectedDay);
  const selectedAttendance = attendanceFor(selectedEmployee, selectedDay);
  const todayKeyValue = dateKey(new Date());
  const workforceStats = useMemo(() => {
    const people = adminRole ? staffMembers : [employee];
    const cells = people.flatMap(person => week.map(day => ({ person, day, entry: findSchedule(visible, person.id, day.key), attendance: attendanceFor(person.id, day.key) })));
    return {
      scheduled: cells.filter(x => x.entry?.shift && x.entry.shift.kind !== "weekly_off").length,
      present: cells.filter(x => x.attendance?.status === "حاضر").length,
      late: cells.filter(x => x.attendance?.status === "متأخر").length,
      absent: cells.filter(x => x.attendance?.status === "غياب").length,
      leave: cells.filter(x => x.attendance?.status === "إجازة" || x.entry?.shift?.kind === "weekly_off").length,
    };
  }, [role, staffMembers, employee, week, visible, attendanceVisible]);
  const cellMatchesFilter = (personId: string, day: string, entry: ScheduleEntry | undefined) => {
    if (statusFilter === "all") return true;
    const attendance = attendanceFor(personId, day);
    if (statusFilter === "فارغ") return !entry?.shift;
    if (statusFilter === "إجازة") return attendance?.status === "إجازة" || entry?.shift?.kind === "weekly_off";
    return attendance?.status === statusFilter;
  };

  function attendanceFor(personId: string, day: string) {
    return attendanceVisible.find((record: any) => String(record.staffAccountId ?? (role === "employee" ? employee.id : "")) === personId && record.date === day);
  }
  function attendanceTone(status?: string) {
    if (status === "حاضر") return { bg: "#E7F7EF", text: "#08704A", dot: "#149A67" };
    if (status === "متأخر") return { bg: "#FFF4DB", text: "#9A6400", dot: "#D58A00" };
    if (status === "غياب") return { bg: "#FFF0F0", text: "#9F2638", dot: "#D94A5B" };
    if (status === "إجازة") return { bg: "#EAF3FF", text: "#2F6DB3", dot: "#1677D2" };
    if (status === "مأمورية") return { bg: "#EEE8FF", text: "#5135A8", dot: "#7655D6" };
    return { bg: "#F5F7F9", text: "#7B8798", dot: "#A1ACBA" };
  }

  const stats = useMemo(() => {
    const source = adminRole ? teamSchedules : schedules;
    const total = source.filter(e => week.some(d => d.key === e.scheduleDate)).length;
    const work = source.filter(e => week.some(d => d.key === e.scheduleDate) && e.shift?.kind !== "weekly_off").length;
    const off = source.filter(e => week.some(d => d.key === e.scheduleDate) && e.shift?.kind === "weekly_off").length;
    return { total, work, off, open: Math.max(0, staffMembers.length * 7 - total) };
  }, [role, teamSchedules, schedules, week, staffMembers.length]);

  const statusCounts = { all: staffMembers.length * 7, حاضر: workforceStats.present, متأخر: workforceStats.late, غياب: workforceStats.absent, إجازة: workforceStats.leave, فارغ: Math.max(0, stats.open) };

  function openDayDetail(personId: string, day: string) {
    if (!adminRole) return;
    setSelectedEmployee(personId);
    setSelectedDay(day);
    const attendance = attendanceFor(personId, day);
    setDetailForm({
      checkIn: attendance?.checkIn ?? "",
      checkOut: attendance?.checkOut ?? "",
      lateMinutes: String(attendance?.lateMinutes ?? 0),
      status: attendance?.status ?? "حاضر",
      note: attendance?.note ?? "",
    });
    setDetailOpen(true);
  }

  async function saveAttendanceDetail() {
    if (!member || !selectedDay) return;
    setDetailSaving(true);
    try {
      await updateAttendance.mutateAsync({
        staffAccountId: Number(selectedEmployee),
        date: selectedDay,
        checkIn: detailForm.checkIn.trim() || null,
        checkOut: detailForm.checkOut.trim() || null,
        status: detailForm.status,
        lateMinutes: Math.max(0, Number(detailForm.lateMinutes) || 0),
        note: detailForm.note.trim() || null,
      });
      showAlert("تم تحديث الحضور", member.name + " — " + selectedDay);
      setDetailOpen(false);
    } catch (error) {
      showAlert("تعذر تحديث الحضور", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setDetailSaving(false);
    }
  }

  async function assignShift(shift: ShiftTemplate) {
    if (!adminRole || !selectedEmployee) return;
    setSaving(true);
    try {
      await saveSchedule({ staffAccountId: Number(selectedEmployee), scheduleDate: selectedDay, shiftTemplateId: shift.id });
      showAlert("تم تحديث الجدول", `${member?.name ?? "الموظف"} — ${week.find(d => d.key === selectedDay)?.label ?? ""}`);
    } catch (error) {
      showAlert("تعذر حفظ الجدول", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally { setSaving(false); }
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIcon}><IconSymbol name="calendar" size={24} color="#FFF" /></View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{adminRole ? "WORKFORCE SCHEDULE" : "MY WORK SCHEDULE"}</Text>
            <Text style={styles.title}>الجدول</Text>
            <Text style={styles.subtitle}>{adminRole ? "شوف الفريق كله في جدول واحد وحدد الورديات من نفس الشاشة." : "جدول أسبوعك بالكامل بشكل واضح وسريع."}</Text>
          </View>
        </View>

        <View style={styles.weekNavigator}>
          <Pressable style={styles.weekNavButton} onPress={() => setWeekOffset(v => v + 1)}>
            <IconSymbol name="chevron.left" size={17} color="#163A63" />
            <Text style={styles.weekNavText}>التالي</Text>
          </Pressable>
          <Pressable style={styles.weekCurrentButton} onPress={() => setWeekOffset(0)}>
            <Text style={styles.weekCurrentText}>{weekOffset === 0 ? "هذا الأسبوع" : "العودة للحالي"}</Text>
            <Text style={styles.weekRangeText}>{weekRange}</Text>
          </Pressable>
          <Pressable style={styles.weekNavButton} onPress={() => setWeekOffset(v => v - 1)}>
            <Text style={styles.weekNavText}>السابق</Text>
            <IconSymbol name="chevron.right" size={17} color="#163A63" />
          </Pressable>
        </View>

        <View style={styles.dayStrip}>
          {weekDayStats.map((day) => (
            <Pressable key={day.key} onPress={() => adminRole && setSelectedDay(day.key)} style={[styles.dayMini, day.isToday && styles.dayMiniToday, day.key === selectedDay && adminRole && styles.dayMiniSelected]}>
              <Text style={styles.dayMiniLabel}>{day.label.slice(0, 2)}</Text>
              <Text style={styles.dayMiniDate}>{day.day}</Text>
              <Text style={styles.dayMiniCount}>{day.scheduled} {day.scheduled === 1 ? "وردية" : "ورديات"}</Text>
            </Pressable>
          ))}
        </View>

        {adminRole && <View style={styles.workforceSummary}>
          <View style={styles.summaryTitleRow}><View><Text style={styles.sectionTitle}>ملخص التشغيل</Text><Text style={styles.sectionHint}>حالة الفريق خلال الأسبوع المحدد</Text></View><View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View></View>
          <View style={styles.summaryGrid}>
            {[{key:"scheduled",label:"أيام عمل",value:workforceStats.scheduled,bg:"#EEF6FF",color:"#1677D2"},{key:"present",label:"حاضر",value:workforceStats.present,bg:"#E7F7EF",color:"#08704A"},{key:"late",label:"متأخر",value:workforceStats.late,bg:"#FFF4DB",color:"#9A6400"},{key:"absent",label:"غياب",value:workforceStats.absent,bg:"#FFF0F0",color:"#9F2638"},{key:"leave",label:"إجازة",value:workforceStats.leave,bg:"#EAF3FF",color:"#2F6DB3"}].map(item => <View key={item.key} style={[styles.summaryCard,{backgroundColor:item.bg}]}><Text style={[styles.summaryValue,{color:item.color}]}>{item.value}</Text><Text style={[styles.summaryLabel,{color:item.color}]}>{item.label}</Text></View>)}
          </View>
        </View>}

        {adminRole && <View style={styles.filterBar}>
          <Text style={styles.filterTitle}>تصفية الجدول</Text>
          <ScrollView horizontal inverted showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {(["all","حاضر","متأخر","غياب","إجازة","فارغ"] as const).map(filter => <Pressable key={filter} onPress={() => setStatusFilter(filter)} style={[styles.filterChip,statusFilter===filter&&styles.filterChipActive]}><Text style={[styles.filterChipText,statusFilter===filter&&styles.filterChipTextActive]}>{filter === "all" ? "الكل" : filter} · {statusCounts[filter]}</Text></Pressable>)}
          </ScrollView>
        </View>}

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.weekPill}><Text style={styles.weekPillText}>السبت → الجمعة</Text></View>
            <View><Text style={styles.heroKicker}>WEEKLY ROSTER · SAT → FRI</Text><Text style={styles.heroTitle}>{adminRole ? "خطة تشغيل الفريق" : "خطة عملك"}</Text></View>
          </View>
          <View style={styles.heroStats}>
            <View><Text style={styles.heroStatValue}>{stats.total}</Text><Text style={styles.heroStatLabel}>مجدول</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroStatValue}>{stats.work}</Text><Text style={styles.heroStatLabel}>أيام عمل</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroStatValue}>{stats.off}</Text><Text style={styles.heroStatLabel}>إجازات</Text></View>
            {adminRole && <><View style={styles.heroDivider} /><View><Text style={styles.heroStatValue}>{stats.open}</Text><Text style={styles.heroStatLabel}>فارغ</Text></View></>}
          </View>
        </View>

        {adminRole && (
          <View style={styles.teamBar}>
            <View style={styles.teamBarTop}>
              <View><Text style={styles.sectionTitle}>فريق العمل</Text><Text style={styles.sectionHint}>اختار موظفًا لفتح خلايا جدوله وتعديلها</Text></View>
              <Text style={styles.count}>{staffMembers.length}</Text>
            </View>
            <ScrollView horizontal inverted showsHorizontalScrollIndicator={false} contentContainerStyle={styles.teamScroll}>
              {staffMembers.map(item => (
                <Pressable key={item.id} onPress={() => setSelectedEmployee(item.id)} style={[styles.employeeChip, item.id === selectedEmployee && styles.employeeChipActive]}>
                  <View style={[styles.avatar, item.id === selectedEmployee && styles.avatarActive]}><Text style={[styles.avatarText, item.id === selectedEmployee && styles.avatarTextActive]}>{item.name.slice(0, 1)}</Text></View>
                  <Text style={[styles.employeeName, item.id === selectedEmployee && styles.employeeNameActive]} numberOfLines={1}>{item.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.rosterCard}>
          <View style={styles.rosterHeader}><View style={styles.attendanceLegend}><Text style={styles.legendTitle}>الحضور</Text>{[["#149A67","حاضر"],["#D58A00","متأخر"],["#D94A5B","غياب"],["#1677D2","إجازة"]].map(([color,label]) => <View key={label} style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:color}]} /><Text>{label}</Text></View>)}</View>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#1677D2" }]} /><Text>وردية</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#B7791F" }]} /><Text>إجازة</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#A1ACBA" }]} /><Text>فارغ</Text></View>
            </View>
            <View><Text style={styles.sectionTitle}>جدول الأسبوع</Text><Text style={styles.sectionHint}>{adminRole ? "اضغط أي خلية لتحديد الموظف واليوم" : "مواعيدك اليومية في عرض واحد"}</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
            <View>
              <View style={styles.gridRow}>
                {adminRole && <View style={[styles.nameHeader, styles.corner]}><Text style={styles.nameHeaderText}>الموظف</Text></View>}
                {week.map(d => (
                  <Pressable key={d.key} onPress={() => adminRole && setSelectedDay(d.key)} style={[styles.dayHeader, d.isToday && styles.dayHeaderToday, d.key === selectedDay && adminRole && styles.dayHeaderSelected]}>
                    <Text style={styles.dayHeaderLabel}>{d.label}</Text>
                    <Text style={styles.dayHeaderDate}>{d.day}</Text>
                  </Pressable>
                ))}
              </View>

              {(adminRole ? staffMembers : [employee]).filter(person => role !== "manager" || week.some(d => cellMatchesFilter(person.id, d.key, findSchedule(visible, person.id, d.key)))).map(person => (
                <View key={person.id} style={styles.gridRow}>
                  {adminRole && (
                    <Pressable onPress={() => setSelectedEmployee(person.id)} style={[styles.nameCell, person.id === selectedEmployee && styles.nameCellSelected]}>
                      <View style={styles.nameAvatar}><Text style={styles.nameAvatarText}>{person.name.slice(0, 1)}</Text></View>
                      <View style={styles.nameCopy}><Text style={styles.nameText} numberOfLines={1}>{person.name}</Text><Text style={styles.nameRole} numberOfLines={1}>{person.jobTitle ?? "موظف"}</Text></View>
                    </Pressable>
                  )}
                  {week.map(d => {
                    const entry = findSchedule(visible, person.id, d.key);
                    const shiftIndex = entry?.shift ? shiftTemplates.findIndex(s => String(s.id) === String(entry.shift?.id)) : -1;
                    const t = tone(entry?.shift, shiftIndex >= 0 ? shiftIndex : 0);
                    const selected = adminRole && person.id === selectedEmployee && d.key === selectedDay;
                    return (
                      <Pressable key={d.key} onPress={() => { if (adminRole) openDayDetail(person.id, d.key); }} style={[styles.gridCell, selected && styles.gridCellSelected]}>
                        {(() => {
                          const attendance = attendanceFor(person.id, d.key);
                          const a = attendanceTone(attendance?.status);
                          return entry?.shift ? (
                            <View style={[styles.shiftCell, { backgroundColor: t.bg, borderLeftColor: t.accent }]}>
                              <Text style={[styles.cellShiftName, { color: t.text }]} numberOfLines={1}>{entry.shift.name}</Text>
                              <Text style={[styles.cellShiftTime, { color: t.text }]} numberOfLines={1}>{shiftLabel(entry.shift)}</Text>
                              {attendance?.status && (
                                <View style={[styles.attendanceBadge, { backgroundColor: a.bg }]}>
                                  <View style={[styles.attendanceDot, { backgroundColor: a.dot }]} />
                                  <Text style={[styles.attendanceBadgeText, { color: a.text }]}>{attendance.status}</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <View style={styles.emptyCell}>
                              <IconSymbol name="clock" size={15} color="#A1ACBA" />
                              <Text style={styles.emptyCellText}>فارغ</Text>
                              {attendance?.status && <Text style={[styles.emptyStatus, { color: a.text }]}>{attendance.status}</Text>}
                            </View>
                          );
                        })()}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.gridHint}>{adminRole ? "اسحب الجدول يمينًا ويسارًا على الشاشات الصغيرة. اضغط الخلية ثم اختر الوردية من لوحة التعيين." : "يمكنك مراجعة الجدول الأسبوعي بالكامل من نفس الشاشة."}</Text>
        </View>

        {adminRole && member && (
          <View style={styles.assignCard}>
            <View style={styles.assignHeader}>
              <View style={styles.selectedDayPill}><Text style={styles.selectedDayPillText}>{week.find(d => d.key === selectedDay)?.label} · {week.find(d => d.key === selectedDay)?.date}</Text></View>
              <View><Text style={styles.sectionTitle}>تعديل الوردية</Text><Text style={styles.sectionHint}>{member.name}</Text></View>
            </View>
            <View style={styles.shiftGrid}>
              {shiftTemplates.map((s, index) => {
                const t = tone(s, index);
                return (
                  <Pressable key={s.id} disabled={saving} onPress={() => assignShift(s)} style={[styles.shiftOption, { backgroundColor: t.bg, borderColor: t.accent }, saving && styles.disabled]}>
                    <View style={[styles.shiftDot, { backgroundColor: t.accent }]} />
                    <Text style={[styles.shiftOptionName, { color: t.text }]}>{s.name}</Text>
                    <Text style={[styles.shiftOptionTime, { color: t.text }]}>{shiftLabel(s)}</Text>
                    <Text style={[styles.shiftAction, { color: t.accent }]}>{saving ? "جارٍ..." : "تعيين"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.note}><IconSymbol name="checkmark" size={16} color="#2F6DB3" /><Text style={styles.noteText}>الجدول هنا هو مصدر التشغيل للوردية؛ وأي وردية تتجاوز منتصف الليل تُحسب على يوم بدايتها.</Text></View>
      {adminRole && member && (
        <Modal visible={detailOpen} animationType="slide" transparent onRequestClose={() => !detailSaving && setDetailOpen(false)}>
          <View style={styles.detailBackdrop}>
            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <View style={{flex:1}}>
                  <Text style={styles.detailEyebrow}>EMPLOYEE DAY DETAIL</Text>
                  <Text style={styles.detailTitle}>{member.name}</Text>
                  <Text style={styles.detailSub}>{week.find(d => d.key === selectedDay)?.label} · {week.find(d => d.key === selectedDay)?.date} · {member.jobTitle ?? "موظف"}</Text>
                </View>
                <Pressable disabled={detailSaving} onPress={() => setDetailOpen(false)} style={styles.detailClose}><Text style={styles.detailCloseText}>×</Text></Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.detailBody} keyboardShouldPersistTaps="handled">
                <View style={styles.detailHero}>
                  <View style={styles.detailHeroIcon}><Text style={styles.detailHeroInitial}>{member.name.slice(0,1)}</Text></View>
                  <View style={{flex:1}}><Text style={styles.detailHeroName}>{member.name}</Text><Text style={styles.detailHeroRole}>{member.jobTitle ?? "موظف"} · {member.department ?? "عام"}</Text></View>
                  <View style={styles.detailStatusPill}><Text style={styles.detailStatusText}>{selectedAttendance?.status ?? "لا يوجد تسجيل"}</Text></View>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailInfo}><Text style={styles.detailLabel}>الوردية</Text><Text style={styles.detailValue}>{selectedEntry?.shift ? shiftLabel(selectedEntry.shift) : "بدون وردية"}</Text></View>
                  <View style={styles.detailInfo}><Text style={styles.detailLabel}>حالة اليوم</Text><Text style={styles.detailValue}>{selectedAttendance?.status ?? "غير مسجل"}</Text></View>
                  <View style={styles.detailInfo}><Text style={styles.detailLabel}>دخول</Text><Text style={styles.detailValue}>{selectedAttendance?.checkIn ?? "—"}</Text></View>
                  <View style={styles.detailInfo}><Text style={styles.detailLabel}>خروج</Text><Text style={styles.detailValue}>{selectedAttendance?.checkOut ?? "—"}</Text></View>
                </View>

                <View style={styles.detailSection}><Text style={styles.detailSectionTitle}>تحديث الحضور</Text>
                  <View style={styles.detailInputsRow}>
                    <View style={styles.detailField}><Text style={styles.detailLabel}>وقت الدخول</Text><TextInput style={styles.detailInput} value={detailForm.checkIn} onChangeText={v=>setDetailForm(f=>({...f,checkIn:v}))} placeholder="09:00" textAlign="right"/></View>
                    <View style={styles.detailField}><Text style={styles.detailLabel}>وقت الخروج</Text><TextInput style={styles.detailInput} value={detailForm.checkOut} onChangeText={v=>setDetailForm(f=>({...f,checkOut:v}))} placeholder="18:00" textAlign="right"/></View>
                  </View>
                  <View style={styles.statusOptions}>
                    {(["حاضر","متأخر","غياب","إجازة","مأمورية"] as const).map(s=><Pressable key={s} onPress={()=>setDetailForm(f=>({...f,status:s}))} style={[styles.statusOption,detailForm.status===s&&styles.statusOptionActive]}><Text style={[styles.statusOptionText,detailForm.status===s&&styles.statusOptionTextActive]}>{s}</Text></Pressable>)}
                  </View>
                  <View style={styles.detailField}><Text style={styles.detailLabel}>دقائق التأخير</Text><TextInput style={styles.detailInput} value={detailForm.lateMinutes} onChangeText={v=>setDetailForm(f=>({...f,lateMinutes:v.replace(/[^0-9]/g,"")}))} keyboardType="numeric" textAlign="right"/></View>
                  <View style={styles.detailField}><Text style={styles.detailLabel}>ملاحظة</Text><TextInput style={[styles.detailInput,styles.detailNoteInput]} value={detailForm.note} onChangeText={v=>setDetailForm(f=>({...f,note:v}))} placeholder="اكتب ملاحظة تشغيلية..." multiline textAlign="right"/></View>
                </View>

                <View style={styles.detailActions}>
                  <Pressable style={styles.employee360Button} onPress={()=>{setDetailOpen(false);router.push(("/employee/"+selectedEmployee) as never);}}><IconSymbol name="person.fill" size={17} color="#163A63"/><Text style={styles.employee360Text}>فتح Employee 360</Text></Pressable>
                  <Pressable disabled={detailSaving} style={[styles.saveAttendanceButton,detailSaving&&styles.disabled]} onPress={saveAttendanceDetail}>{detailSaving?<ActivityIndicator color="#FFF"/>:<><IconSymbol name="checkmark" size={17} color="#FFF"/><Text style={styles.saveAttendanceText}>حفظ الحضور</Text></>}</Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content:{padding:20,paddingBottom:50,gap:14},
  weekNavigator:{flexDirection:"row",alignItems:"stretch",justifyContent:"space-between",gap:8},
  weekNavButton:{flex:1,minHeight:52,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E1E7EF",borderRadius:15,paddingHorizontal:10,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:5},
  weekNavText:{color:"#163A63",fontSize:10,fontWeight:"800"},
  weekCurrentButton:{flex:1.35,minHeight:52,backgroundColor:"#EEF5FB",borderWidth:1,borderColor:"#C9DCEC",borderRadius:15,alignItems:"center",justifyContent:"center",paddingHorizontal:8},
  weekCurrentText:{color:"#163A63",fontSize:11,fontWeight:"900"},
  weekRangeText:{color:"#667085",fontSize:9,marginTop:2,fontWeight:"700"},
  dayStrip:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:8,flexDirection:"row-reverse",gap:6},dayMini:{flex:1,minWidth:42,minHeight:68,borderRadius:12,backgroundColor:"#F7F9FC",alignItems:"center",justifyContent:"center",paddingVertical:7},dayMiniToday:{backgroundColor:"#EEF6FF",borderWidth:1,borderColor:"#C7DFF5"},dayMiniSelected:{backgroundColor:"#DDEEFF",borderWidth:1,borderColor:"#76A9D8"},dayMiniLabel:{color:"#7B8798",fontSize:8,fontWeight:"800"},dayMiniDate:{color:"#172033",fontSize:15,fontWeight:"900",marginTop:2},dayMiniCount:{color:"#667085",fontSize:7,fontWeight:"700",marginTop:4},header:{flexDirection:"row-reverse",alignItems:"center",gap:12},
  headerIcon:{width:52,height:52,borderRadius:17,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},
  headerCopy:{flex:1},eyebrow:{color:"#7B8798",fontSize:9,fontWeight:"900",textAlign:"right",letterSpacing:1},title:{color:"#172033",fontSize:29,fontWeight:"900",textAlign:"right",marginTop:3},subtitle:{color:"#667085",fontSize:11,lineHeight:18,textAlign:"right",marginTop:4},
  hero:{backgroundColor:"#102A47",borderRadius:22,padding:18,gap:18},heroTop:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-start"},weekPill:{backgroundColor:"#1D4268",borderRadius:10,paddingHorizontal:10,paddingVertical:6},weekPillText:{color:"#B9D9F5",fontSize:9,fontWeight:"900"},heroKicker:{color:"#8EA7BE",fontSize:8,fontWeight:"900",textAlign:"right",letterSpacing:1},heroTitle:{color:"#FFF",fontSize:19,fontWeight:"900",textAlign:"right",marginTop:4},heroStats:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between"},heroStatValue:{color:"#72B5EF",fontSize:21,fontWeight:"900",textAlign:"center"},heroStatLabel:{color:"#B8C9D8",fontSize:8,textAlign:"center",marginTop:3},heroDivider:{width:1,height:28,backgroundColor:"#2A4B69"},
  teamBar:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:14},teamBarTop:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},sectionTitle:{color:"#172033",fontSize:15,fontWeight:"900",textAlign:"right"},sectionHint:{color:"#98A6B8",fontSize:9,textAlign:"right",marginTop:3},count:{minWidth:30,textAlign:"center",color:"#163A63",backgroundColor:"#EEF4FB",borderRadius:9,padding:7,fontSize:10,fontWeight:"900"},teamScroll:{gap:8,paddingTop:13},
  employeeChip:{minWidth:105,maxWidth:145,flexDirection:"row-reverse",alignItems:"center",gap:7,borderWidth:1,borderColor:"#E1E7ED",backgroundColor:"#FAFBFC",borderRadius:12,paddingHorizontal:9,paddingVertical:8},employeeChipActive:{backgroundColor:"#EEF4FB",borderColor:"#5A91C5"},avatar:{width:27,height:27,borderRadius:9,backgroundColor:"#E8EDF3",alignItems:"center",justifyContent:"center"},avatarActive:{backgroundColor:"#163A63"},avatarText:{color:"#667085",fontSize:10,fontWeight:"900"},avatarTextActive:{color:"#FFF"},employeeName:{flex:1,color:"#667085",fontSize:9,fontWeight:"700",textAlign:"right"},employeeNameActive:{color:"#163A63",fontWeight:"900"},
  rosterCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:20,paddingTop:15,overflow:"hidden"},rosterHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",paddingHorizontal:15,paddingBottom:13},legend:{flexDirection:"row",gap:10,alignItems:"center"},legendItem:{flexDirection:"row-reverse",alignItems:"center",gap:4},legendItemText:{color:"#667085",fontSize:8},legendDot:{width:7,height:7,borderRadius:4},gridScroll:{paddingHorizontal:10,paddingBottom:2},gridRow:{flexDirection:"row-reverse",borderBottomWidth:1,borderBottomColor:"#EDF0F3"},corner:{backgroundColor:"#F7F9FC"},nameHeader:{width:165,height:58,justifyContent:"center",paddingHorizontal:12,borderLeftWidth:1,borderLeftColor:"#E7EBEF"},nameHeaderText:{color:"#667085",fontSize:9,fontWeight:"900",textAlign:"right"},dayHeader:{width:112,height:58,backgroundColor:"#F7F9FC",alignItems:"center",justifyContent:"center",borderLeftWidth:1,borderLeftColor:"#E7EBEF"},dayHeaderToday:{backgroundColor:"#EEF6FF"},dayHeaderSelected:{backgroundColor:"#DDEEFF"},dayHeaderLabel:{color:"#667085",fontSize:9,fontWeight:"800"},dayHeaderDate:{color:"#172033",fontSize:15,fontWeight:"900",marginTop:2},nameCell:{width:165,minHeight:78,flexDirection:"row-reverse",alignItems:"center",gap:9,paddingHorizontal:10,borderLeftWidth:1,borderLeftColor:"#E7EBEF",backgroundColor:"#FFF"},nameCellSelected:{backgroundColor:"#F3F8FD"},nameAvatar:{width:34,height:34,borderRadius:11,backgroundColor:"#EAF0F5",alignItems:"center",justifyContent:"center"},nameAvatarText:{color:"#31577F",fontSize:12,fontWeight:"900"},nameCopy:{flex:1},nameText:{color:"#172033",fontSize:10,fontWeight:"900",textAlign:"right"},nameRole:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:3},gridCell:{width:112,minHeight:78,padding:6,borderLeftWidth:1,borderLeftColor:"#E7EBEF",justifyContent:"center",backgroundColor:"#FFF"},gridCellSelected:{backgroundColor:"#F1F7FD"},shiftCell:{minHeight:64,borderRadius:10,borderLeftWidth:3,paddingHorizontal:8,paddingVertical:7,justifyContent:"center"},attendanceBadge:{marginTop:5,borderRadius:7,paddingHorizontal:5,paddingVertical:3,flexDirection:"row-reverse",alignItems:"center",alignSelf:"flex-start",gap:4},attendanceDot:{width:5,height:5,borderRadius:3},attendanceBadgeText:{fontSize:7,fontWeight:"900"},cellShiftName:{fontSize:9,fontWeight:"900",textAlign:"right"},cellShiftTime:{fontSize:8,marginTop:5,textAlign:"right"},emptyCell:{minHeight:54,borderRadius:10,backgroundColor:"#F7F8FA",alignItems:"center",justifyContent:"center",gap:4},emptyCellText:{color:"#A1ACBA",fontSize:8,fontWeight:"700"},emptyStatus:{fontSize:7,fontWeight:"900",marginTop:3},gridHint:{color:"#98A6B8",fontSize:8,textAlign:"right",paddingHorizontal:15,paddingVertical:11,backgroundColor:"#FAFBFC"},
  assignCard:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#E1E7EE",borderRadius:18,padding:15},assignHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},selectedDayPill:{backgroundColor:"#EAF3FF",borderRadius:9,paddingHorizontal:9,paddingVertical:6},selectedDayPillText:{color:"#2F6DB3",fontSize:8,fontWeight:"900"},shiftGrid:{flexDirection:"row-reverse",gap:8,marginTop:13},shiftOption:{flex:1,minHeight:95,borderRadius:14,borderWidth:1,padding:10},shiftDot:{width:8,height:8,borderRadius:4,marginBottom:7},shiftOptionName:{fontSize:10,fontWeight:"900",textAlign:"right"},shiftOptionTime:{fontSize:8,marginTop:5,textAlign:"right"},shiftAction:{fontSize:8,fontWeight:"900",marginTop:9,textAlign:"right"},disabled:{opacity:.55},
  note:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#E1E7EE",borderRadius:15,padding:13,flexDirection:"row-reverse",alignItems:"center",gap:8},noteText:{flex:1,color:"#667085",fontSize:9,lineHeight:16,textAlign:"right"},
  detailBackdrop:{flex:1,backgroundColor:"rgba(8,24,40,.55)",justifyContent:"flex-end"},detailCard:{backgroundColor:"#F7F9FC",borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"92%",padding:18},detailHeader:{flexDirection:"row-reverse",alignItems:"flex-start",gap:12},detailEyebrow:{color:"#7B8798",fontSize:8,fontWeight:"900",textAlign:"right",letterSpacing:1},detailTitle:{color:"#172033",fontSize:22,fontWeight:"900",textAlign:"right",marginTop:3},detailSub:{color:"#667085",fontSize:9,textAlign:"right",marginTop:4},detailClose:{width:38,height:38,borderRadius:12,backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},detailCloseText:{fontSize:25,color:"#667085",lineHeight:27},detailBody:{paddingTop:14,paddingBottom:25,gap:12},detailHero:{backgroundColor:"#102A47",borderRadius:18,padding:14,flexDirection:"row-reverse",alignItems:"center",gap:10},detailHeroIcon:{width:45,height:45,borderRadius:14,backgroundColor:"#2D5276",alignItems:"center",justifyContent:"center"},detailHeroInitial:{color:"#FFF",fontSize:16,fontWeight:"900"},detailHeroName:{color:"#FFF",fontSize:14,fontWeight:"900",textAlign:"right"},detailHeroRole:{color:"#B8C9D8",fontSize:9,textAlign:"right",marginTop:3},detailStatusPill:{backgroundColor:"#EAF8F1",borderRadius:9,paddingHorizontal:8,paddingVertical:6},detailStatusText:{color:"#08704A",fontSize:8,fontWeight:"900"},detailGrid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:8},detailInfo:{flexGrow:1,flexBasis:"46%",backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:13,padding:11},detailLabel:{color:"#98A6B8",fontSize:8,fontWeight:"800",textAlign:"right"},detailValue:{color:"#172033",fontSize:11,fontWeight:"900",textAlign:"right",marginTop:4},detailSection:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:16,padding:13,gap:10},detailSectionTitle:{color:"#172033",fontSize:13,fontWeight:"900",textAlign:"right"},detailInputsRow:{flexDirection:"row-reverse",gap:8},detailField:{flex:1,gap:5},detailInput:{minHeight:42,borderWidth:1,borderColor:"#DDE4EB",borderRadius:11,backgroundColor:"#F9FBFC",paddingHorizontal:10,color:"#172033",fontSize:11},detailNoteInput:{minHeight:70,textAlignVertical:"top",paddingTop:10},statusOptions:{flexDirection:"row-reverse",flexWrap:"wrap",gap:6},statusOption:{backgroundColor:"#F5F7FA",borderWidth:1,borderColor:"#E1E7EE",borderRadius:10,paddingHorizontal:10,paddingVertical:8},statusOptionActive:{backgroundColor:"#163A63",borderColor:"#163A63"},statusOptionText:{color:"#667085",fontSize:9,fontWeight:"800"},statusOptionTextActive:{color:"#FFF"},detailActions:{flexDirection:"row-reverse",gap:8},employee360Button:{flex:1,minHeight:46,borderWidth:1,borderColor:"#C9D8E7",backgroundColor:"#EEF4FB",borderRadius:12,alignItems:"center",justifyContent:"center",flexDirection:"row-reverse",gap:6},employee360Text:{color:"#163A63",fontSize:10,fontWeight:"900"},saveAttendanceButton:{flex:1,minHeight:46,borderRadius:12,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center",flexDirection:"row-reverse",gap:6},saveAttendanceText:{color:"#FFF",fontSize:10,fontWeight:"900"}
});