import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type ScheduleEntry, type ShiftTemplate } from "@/lib/app-data";

const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function makeWeek() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const saturdayOffset = (today.getDay() + 1) % 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() - saturdayOffset);
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
  const { role, employee, staffMembers, shiftTemplates, schedules, teamSchedules, saveSchedule } = useAppData();
  const week = useMemo(makeWeek, []);
  const [selectedEmployee, setSelectedEmployee] = useState(staffMembers[0]?.id ?? employee.id);
  const [selectedDay, setSelectedDay] = useState(week[0].key);
  const [saving, setSaving] = useState(false);
  const visible = role === "manager" ? teamSchedules : schedules;
  const member = staffMembers.find(m => m.id === selectedEmployee);

  const stats = useMemo(() => {
    const source = role === "manager" ? teamSchedules : schedules;
    const total = source.filter(e => week.some(d => d.key === e.scheduleDate)).length;
    const work = source.filter(e => week.some(d => d.key === e.scheduleDate) && e.shift?.kind !== "weekly_off").length;
    const off = source.filter(e => week.some(d => d.key === e.scheduleDate) && e.shift?.kind === "weekly_off").length;
    return { total, work, off, open: Math.max(0, staffMembers.length * 7 - total) };
  }, [role, teamSchedules, schedules, week, staffMembers.length]);

  async function assignShift(shift: ShiftTemplate) {
    if (role !== "manager" || !selectedEmployee) return;
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
            <Text style={styles.eyebrow}>{role === "manager" ? "WORKFORCE SCHEDULE" : "MY WORK SCHEDULE"}</Text>
            <Text style={styles.title}>الجدول</Text>
            <Text style={styles.subtitle}>{role === "manager" ? "شوف الفريق كله في جدول واحد وحدد الورديات من نفس الشاشة." : "جدول أسبوعك بالكامل بشكل واضح وسريع."}</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.weekPill}><Text style={styles.weekPillText}>السبت → الجمعة</Text></View>
            <View><Text style={styles.heroKicker}>WEEKLY ROSTER · SAT → FRI</Text><Text style={styles.heroTitle}>{role === "manager" ? "خطة تشغيل الفريق" : "خطة عملك"}</Text></View>
          </View>
          <View style={styles.heroStats}>
            <View><Text style={styles.heroStatValue}>{stats.total}</Text><Text style={styles.heroStatLabel}>مجدول</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroStatValue}>{stats.work}</Text><Text style={styles.heroStatLabel}>أيام عمل</Text></View>
            <View style={styles.heroDivider} />
            <View><Text style={styles.heroStatValue}>{stats.off}</Text><Text style={styles.heroStatLabel}>إجازات</Text></View>
            {role === "manager" && <><View style={styles.heroDivider} /><View><Text style={styles.heroStatValue}>{stats.open}</Text><Text style={styles.heroStatLabel}>فارغ</Text></View></>}
          </View>
        </View>

        {role === "manager" && (
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
          <View style={styles.rosterHeader}>
            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#1677D2" }]} /><Text>وردية</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#B7791F" }]} /><Text>إجازة</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#A1ACBA" }]} /><Text>فارغ</Text></View>
            </View>
            <View><Text style={styles.sectionTitle}>جدول الأسبوع</Text><Text style={styles.sectionHint}>{role === "manager" ? "اضغط أي خلية لتحديد الموظف واليوم" : "مواعيدك اليومية في عرض واحد"}</Text></View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
            <View>
              <View style={styles.gridRow}>
                {role === "manager" && <View style={[styles.nameHeader, styles.corner]}><Text style={styles.nameHeaderText}>الموظف</Text></View>}
                {week.map(d => (
                  <Pressable key={d.key} onPress={() => role === "manager" && setSelectedDay(d.key)} style={[styles.dayHeader, d.isToday && styles.dayHeaderToday, d.key === selectedDay && role === "manager" && styles.dayHeaderSelected]}>
                    <Text style={styles.dayHeaderLabel}>{d.label}</Text>
                    <Text style={styles.dayHeaderDate}>{d.day}</Text>
                  </Pressable>
                ))}
              </View>

              {(role === "manager" ? staffMembers : [employee]).map(person => (
                <View key={person.id} style={styles.gridRow}>
                  {role === "manager" && (
                    <Pressable onPress={() => setSelectedEmployee(person.id)} style={[styles.nameCell, person.id === selectedEmployee && styles.nameCellSelected]}>
                      <View style={styles.nameAvatar}><Text style={styles.nameAvatarText}>{person.name.slice(0, 1)}</Text></View>
                      <View style={styles.nameCopy}><Text style={styles.nameText} numberOfLines={1}>{person.name}</Text><Text style={styles.nameRole} numberOfLines={1}>{person.jobTitle ?? "موظف"}</Text></View>
                    </Pressable>
                  )}
                  {week.map(d => {
                    const entry = findSchedule(visible, person.id, d.key);
                    const shiftIndex = entry?.shift ? shiftTemplates.findIndex(s => String(s.id) === String(entry.shift?.id)) : -1;
                    const t = tone(entry?.shift, shiftIndex >= 0 ? shiftIndex : 0);
                    const selected = role === "manager" && person.id === selectedEmployee && d.key === selectedDay;
                    return (
                      <Pressable key={d.key} onPress={() => { if (role === "manager") { setSelectedEmployee(person.id); setSelectedDay(d.key); } }} style={[styles.gridCell, selected && styles.gridCellSelected]}>
                        {entry?.shift ? (
                          <View style={[styles.shiftCell, { backgroundColor: t.bg, borderLeftColor: t.accent }]}>
                            <Text style={[styles.cellShiftName, { color: t.text }]} numberOfLines={1}>{entry.shift.name}</Text>
                            <Text style={[styles.cellShiftTime, { color: t.text }]} numberOfLines={1}>{shiftLabel(entry.shift)}</Text>
                          </View>
                        ) : (
                          <View style={styles.emptyCell}><IconSymbol name="clock" size={15} color="#A1ACBA" /><Text style={styles.emptyCellText}>فارغ</Text></View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.gridHint}>{role === "manager" ? "اسحب الجدول يمينًا ويسارًا على الشاشات الصغيرة. اضغط الخلية ثم اختر الوردية من لوحة التعيين." : "يمكنك مراجعة الجدول الأسبوعي بالكامل من نفس الشاشة."}</Text>
        </View>

        {role === "manager" && member && (
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
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content:{padding:20,paddingBottom:50,gap:14},
  header:{flexDirection:"row-reverse",alignItems:"center",gap:12},
  headerIcon:{width:52,height:52,borderRadius:17,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},
  headerCopy:{flex:1},eyebrow:{color:"#7B8798",fontSize:9,fontWeight:"900",textAlign:"right",letterSpacing:1},title:{color:"#172033",fontSize:29,fontWeight:"900",textAlign:"right",marginTop:3},subtitle:{color:"#667085",fontSize:11,lineHeight:18,textAlign:"right",marginTop:4},
  hero:{backgroundColor:"#102A47",borderRadius:22,padding:18,gap:18},heroTop:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-start"},weekPill:{backgroundColor:"#1D4268",borderRadius:10,paddingHorizontal:10,paddingVertical:6},weekPillText:{color:"#B9D9F5",fontSize:9,fontWeight:"900"},heroKicker:{color:"#8EA7BE",fontSize:8,fontWeight:"900",textAlign:"right",letterSpacing:1},heroTitle:{color:"#FFF",fontSize:19,fontWeight:"900",textAlign:"right",marginTop:4},heroStats:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between"},heroStatValue:{color:"#72B5EF",fontSize:21,fontWeight:"900",textAlign:"center"},heroStatLabel:{color:"#B8C9D8",fontSize:8,textAlign:"center",marginTop:3},heroDivider:{width:1,height:28,backgroundColor:"#2A4B69"},
  teamBar:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:18,padding:14},teamBarTop:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},sectionTitle:{color:"#172033",fontSize:15,fontWeight:"900",textAlign:"right"},sectionHint:{color:"#98A6B8",fontSize:9,textAlign:"right",marginTop:3},count:{minWidth:30,textAlign:"center",color:"#163A63",backgroundColor:"#EEF4FB",borderRadius:9,padding:7,fontSize:10,fontWeight:"900"},teamScroll:{gap:8,paddingTop:13},
  employeeChip:{minWidth:105,maxWidth:145,flexDirection:"row-reverse",alignItems:"center",gap:7,borderWidth:1,borderColor:"#E1E7ED",backgroundColor:"#FAFBFC",borderRadius:12,paddingHorizontal:9,paddingVertical:8},employeeChipActive:{backgroundColor:"#EEF4FB",borderColor:"#5A91C5"},avatar:{width:27,height:27,borderRadius:9,backgroundColor:"#E8EDF3",alignItems:"center",justifyContent:"center"},avatarActive:{backgroundColor:"#163A63"},avatarText:{color:"#667085",fontSize:10,fontWeight:"900"},avatarTextActive:{color:"#FFF"},employeeName:{flex:1,color:"#667085",fontSize:9,fontWeight:"700",textAlign:"right"},employeeNameActive:{color:"#163A63",fontWeight:"900"},
  rosterCard:{backgroundColor:"#FFF",borderWidth:1,borderColor:"#E5EAF0",borderRadius:20,paddingTop:15,overflow:"hidden"},rosterHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",paddingHorizontal:15,paddingBottom:13},legend:{flexDirection:"row",gap:10,alignItems:"center"},legendItem:{flexDirection:"row-reverse",alignItems:"center",gap:4},legendItemText:{color:"#667085",fontSize:8},legendDot:{width:7,height:7,borderRadius:4},gridScroll:{paddingHorizontal:10,paddingBottom:2},gridRow:{flexDirection:"row-reverse",borderBottomWidth:1,borderBottomColor:"#EDF0F3"},corner:{backgroundColor:"#F7F9FC"},nameHeader:{width:165,height:58,justifyContent:"center",paddingHorizontal:12,borderLeftWidth:1,borderLeftColor:"#E7EBEF"},nameHeaderText:{color:"#667085",fontSize:9,fontWeight:"900",textAlign:"right"},dayHeader:{width:112,height:58,backgroundColor:"#F7F9FC",alignItems:"center",justifyContent:"center",borderLeftWidth:1,borderLeftColor:"#E7EBEF"},dayHeaderToday:{backgroundColor:"#EEF6FF"},dayHeaderSelected:{backgroundColor:"#DDEEFF"},dayHeaderLabel:{color:"#667085",fontSize:9,fontWeight:"800"},dayHeaderDate:{color:"#172033",fontSize:15,fontWeight:"900",marginTop:2},nameCell:{width:165,minHeight:78,flexDirection:"row-reverse",alignItems:"center",gap:9,paddingHorizontal:10,borderLeftWidth:1,borderLeftColor:"#E7EBEF",backgroundColor:"#FFF"},nameCellSelected:{backgroundColor:"#F3F8FD"},nameAvatar:{width:34,height:34,borderRadius:11,backgroundColor:"#EAF0F5",alignItems:"center",justifyContent:"center"},nameAvatarText:{color:"#31577F",fontSize:12,fontWeight:"900"},nameCopy:{flex:1},nameText:{color:"#172033",fontSize:10,fontWeight:"900",textAlign:"right"},nameRole:{color:"#98A6B8",fontSize:8,textAlign:"right",marginTop:3},gridCell:{width:112,minHeight:78,padding:6,borderLeftWidth:1,borderLeftColor:"#E7EBEF",justifyContent:"center",backgroundColor:"#FFF"},gridCellSelected:{backgroundColor:"#F1F7FD"},shiftCell:{minHeight:54,borderRadius:10,borderLeftWidth:3,paddingHorizontal:8,paddingVertical:7,justifyContent:"center"},cellShiftName:{fontSize:9,fontWeight:"900",textAlign:"right"},cellShiftTime:{fontSize:8,marginTop:5,textAlign:"right"},emptyCell:{minHeight:54,borderRadius:10,backgroundColor:"#F7F8FA",alignItems:"center",justifyContent:"center",gap:4},emptyCellText:{color:"#A1ACBA",fontSize:8,fontWeight:"700"},gridHint:{color:"#98A6B8",fontSize:8,textAlign:"right",paddingHorizontal:15,paddingVertical:11,backgroundColor:"#FAFBFC"},
  assignCard:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#E1E7EE",borderRadius:18,padding:15},assignHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},selectedDayPill:{backgroundColor:"#EAF3FF",borderRadius:9,paddingHorizontal:9,paddingVertical:6},selectedDayPillText:{color:"#2F6DB3",fontSize:8,fontWeight:"900"},shiftGrid:{flexDirection:"row-reverse",gap:8,marginTop:13},shiftOption:{flex:1,minHeight:95,borderRadius:14,borderWidth:1,padding:10},shiftDot:{width:8,height:8,borderRadius:4,marginBottom:7},shiftOptionName:{fontSize:10,fontWeight:"900",textAlign:"right"},shiftOptionTime:{fontSize:8,marginTop:5,textAlign:"right"},shiftAction:{fontSize:8,fontWeight:"900",marginTop:9,textAlign:"right"},disabled:{opacity:.55},
  note:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#E1E7EE",borderRadius:15,padding:13,flexDirection:"row-reverse",alignItems:"center",gap:8},noteText:{flex:1,color:"#667085",fontSize:9,lineHeight:16,textAlign:"right"}
});