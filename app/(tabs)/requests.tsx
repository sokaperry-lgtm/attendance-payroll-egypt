import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type RequestType } from "@/lib/app-data";
import { trpc } from "@/lib/trpc";

const requestPalette: Record<string, { bg: string; text: string }> = { "قيد المراجعة": { bg: "#EEF4FB", text: "#31577F" }, مقبول: { bg: "#EAF1F8", text: "#163A63" }, مرفوض: { bg: "#E6EDF5", text: "#0F2742" } };

export default function RequestsScreen() {
  const { requests, submitRequest } = useAppData();
  const leaveBalance = trpc.leave.balance.useQuery({year:new Date().getFullYear()});
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<RequestType>("إجازة");
  const [from, setFrom] = useState("2026-09-20");
  const [to, setTo] = useState("2026-09-20");
  const [hours, setHours] = useState("2");
  const [reason, setReason] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<(typeof requests)[number] | null>(null);
  const isOvertime = type === "أوفر تايم";

  async function saveRequest() {
    if (!reason.trim()) { showAlert("بيانات ناقصة", "اكتب سبب الطلب أولًا."); return; }
    const hoursValue = Number(hours);
    if (isOvertime && (!Number.isFinite(hoursValue) || hoursValue <= 0)) { showAlert("بيانات ناقصة", "اكتب عدد ساعات الأوفر تايم."); return; }
    try {
      await submitRequest({ type, from, to: isOvertime ? from : to, reason, hours: isOvertime ? hoursValue : undefined });
    } catch (error) {
      showAlert("تعذر إرسال الطلب", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
      return;
    }
    setReason(""); setModalOpen(false);
    showAlert("تم إرسال الطلب", isOvertime ? "سيظهر للمدير للموافقة قبل احتسابه في المرتب." : "سيظهر للمدير للمراجعة والاعتماد.");
  }

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>طلباتك وموافقاتك</Text><Text style={styles.title}>الطلبات</Text><Text style={styles.subtitle}>إجازات، أذونات ومأموريات</Text></View><Pressable onPress={() => setModalOpen(true)} style={styles.addButton}><Text style={styles.addButtonText}>+ طلب جديد</Text></Pressable></View>
    <View style={styles.requestsHero}>
      <View style={styles.requestsHeroIcon}><IconSymbol name="doc.text" size={22} color="#FFFFFF" /></View>
      <View style={styles.requestsHeroCopy}><Text style={styles.requestsHeroTitle}>مركز الطلبات</Text><Text style={styles.requestsHeroText}>قدّم طلبك وتابع حالته من مكان واحد.</Text></View>
      <View style={styles.requestsHeroBadge}><Text style={styles.requestsHeroNumber}>{requests.length}</Text><Text style={styles.requestsHeroLabel}>طلبات</Text></View>
    </View>
    <View style={styles.infoRow}>
      <View style={[styles.info, styles.infoHalf]}><Text style={styles.infoTitle}>رصيد الإجازات المدفوعة</Text><Text style={styles.infoValue}>{Math.max(0,(leaveBalance.data?.annualDays??21)-(leaveBalance.data?.annualUsed??0))} <Text style={styles.infoUnit}>أيام</Text></Text><Text style={styles.infoHint}>الرصيد السنوي المتاح.</Text></View>
      <View style={[styles.info, styles.infoHalf, styles.infoSick]}><Text style={[styles.infoTitle, styles.infoTitleSick]}>رصيد الإجازات المرضية</Text><Text style={[styles.infoValue, styles.infoValueSick]}>{Math.max(0,(leaveBalance.data?.sickDays??14)-(leaveBalance.data?.sickUsed??0))} <Text style={[styles.infoUnit, styles.infoUnitSick]}>أيام</Text></Text><Text style={[styles.infoHint, styles.infoHintSick]}>الرصيد السنوي المتاح.</Text></View>
    </View>
    <Text style={styles.sectionTitle}>طلباتك السابقة</Text>
    {requests.map((request) => { const palette = requestPalette[request.status] ?? requestPalette["قيد المراجعة"]; return <Pressable key={request.id} onPress={() => setSelectedRequest(request)} style={styles.requestCard}><View style={styles.requestTop}><View style={[styles.statusBadge, { backgroundColor: palette.bg }]}><Text style={[styles.statusText, { color: palette.text }]}>{request.status}</Text></View><Text style={styles.requestType}>{request.type}</Text></View><Text style={styles.requestDates}>{request.type === "أوفر تايم" ? `${request.from} · ${request.hours ?? 0} ساعة` : `${request.from} ${request.to !== request.from ? `— ${request.to}` : ""}`}</Text><Text style={styles.reason}>{request.reason}</Text></Pressable>; })}
    {requests.length === 0 && <Text style={styles.empty}>لم ترسل أي طلبات بعد.</Text>}
  </ScrollView>
  <Modal visible={Boolean(selectedRequest)} transparent animationType="slide" onRequestClose={() => setSelectedRequest(null)}><View style={styles.modalBackdrop}><View style={styles.detailModal}><View style={styles.detailHead}><Text style={styles.detailTitle}>تفاصيل الطلب</Text><Pressable onPress={() => setSelectedRequest(null)}><Text style={styles.closeText}>إغلاق</Text></Pressable></View>{selectedRequest && <><Text style={styles.detailType}>{selectedRequest.type}</Text><Text style={styles.detailDates}>{selectedRequest.type === "أوفر تايم" ? `${selectedRequest.from} · ${selectedRequest.hours ?? 0} ساعة` : `${selectedRequest.from} إلى ${selectedRequest.to}`}</Text><View style={styles.detailStatus}><Text style={styles.detailStatusText}>{selectedRequest.status}</Text></View><Text style={styles.detailLabel}>سبب الطلب</Text><Text style={styles.detailReason}>{selectedRequest.reason}</Text><View style={styles.timeline}><Text style={styles.timelineTitle}>حالة المعالجة</Text><Text style={styles.timelineText}>{selectedRequest.status === "قيد المراجعة" ? "الطلب في انتظار مراجعة المدير." : selectedRequest.status === "مقبول" ? "تمت مراجعة الطلب واعتماده." : "تمت مراجعة الطلب ورفضه."}</Text></View></>}</View></View></Modal>
  <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeader}><Pressable onPress={() => setModalOpen(false)}><Text style={styles.close}>إلغاء</Text></Pressable><Text style={styles.modalTitle}>طلب جديد</Text></View><Text style={styles.fieldLabel}>نوع الطلب</Text><View style={styles.typeRow}>{(["إجازة", "إذن", "مأمورية", "أوفر تايم", "إجازة مرضية"] as RequestType[]).map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.typeChip, type === item && styles.typeChipActive]}><Text style={[styles.typeChipText, type === item && styles.typeChipTextActive]}>{item}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>{isOvertime ? "تاريخ اليوم" : "من"}</Text><TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={styles.input} />{isOvertime ? <><Text style={styles.fieldLabel}>عدد الساعات</Text><TextInput value={hours} onChangeText={setHours} placeholder="مثال: 2" keyboardType="numeric" style={styles.input} /></> : <><Text style={styles.fieldLabel}>إلى</Text><TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={styles.input} /></>}<Text style={styles.fieldLabel}>السبب</Text><TextInput value={reason} onChangeText={setReason} placeholder="اكتب سبب الطلب" multiline style={[styles.input, styles.textArea]} /><Pressable onPress={saveRequest} style={styles.submitButton}><Text style={styles.submitText}>إرسال للمراجعة</Text></Pressable></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  detailModal:{backgroundColor:"#FFFFFF",borderTopLeftRadius:26,borderTopRightRadius:26,20: 24,10: 24},detailHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},detailTitle:{color:"#172033",fontSize: 19,fontWeight:"900"},closeText:{color:"#163A63",fontSize: 11},detailType:{color:"#163A63",fontSize: 17,fontWeight:"800",textAlign:"right"},detailDates:{color:"#667085",fontSize: 12,textAlign:"right"},detailStatus:{alignSelf:"flex-end",backgroundColor:"#EEF4FB",borderRadius: 99,12: 24,6: 24},detailStatusText:{color:"#31577F",fontSize: 10,fontWeight:"800"},detailLabel:{color:"#667085",fontSize: 10,fontWeight:"700",textAlign:"right",10: 24},detailReason:{color:"#172033",fontSize: 13,lineHeight:20,textAlign:"right"},timeline:{backgroundColor:"#172033",borderRadius: 16,13: 24,8: 24},timelineTitle:{color:"#172033",fontSize: 12,fontWeight:"800",textAlign:"right"},timelineText:{color:"#667085",fontSize: 11,lineHeight:18,textAlign:"right",4: 24},
  requestsHero: { backgroundColor: "#FFFFFF", borderRadius: 23, 18: 24, flexDirection: "row-reverse", alignItems: "center", 12: 24 },
  requestsHeroIcon: { width: 45, height: 45, borderRadius: 16, backgroundColor: "#163A63", alignItems: "center", justifyContent: "center" },
  requestsHeroCopy: { flex: 1 },
  requestsHeroTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", textAlign: "right" },
  requestsHeroText: { color: "#667085", fontSize: 10, 3: 24, textAlign: "right" },
  requestsHeroBadge: { alignItems: "center" },
  requestsHeroNumber: { color: "#31577F", fontSize: 22, fontWeight: "900" },
  requestsHeroLabel: { color: "#667085", fontSize: 10 },
  content: { 20: 24, 40: 24, 17: 24 }, header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: "#667085", fontSize: 13, textAlign: "right" }, title: { color: "#172033", fontSize: 26, fontWeight: "800", 5: 24, textAlign: "right" }, subtitle: { color: "#667085", fontSize: 12, 5: 24, textAlign: "right" }, addButton: { backgroundColor: "#163A63", borderRadius: 16, 14: 24, 11: 24 }, addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, info: { backgroundColor: "#E4E7EC", borderRadius: 18, 17: 24, borderWidth: 1, borderColor: "#D9E6F2" }, infoRow: { flexDirection: "row-reverse", 10: 24 }, infoHalf: { flex: 1 }, infoSick: { backgroundColor: "#E6EDF5", borderColor: "#0F2742" }, infoTitleSick: { color: "#0F2742" }, infoValueSick: { color: "#0F2742" }, infoUnitSick: { color: "#0F2742" }, infoHintSick: { color: "#0F2742" }, infoTitle: { color: "#31577F", fontSize: 13, textAlign: "right" }, infoValue: { color: "#163A63", fontSize: 30, fontWeight: "800", textAlign: "right", 4: 24 }, infoUnit: { color: "#31577F", fontSize: 12, fontWeight: "500" }, infoHint: { color: "#163A63", fontSize: 11, 4: 24, textAlign: "right" }, sectionTitle: { color: "#172033", fontSize: 17, fontWeight: "800", textAlign: "right" }, requestCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4E7EC", borderRadius: 18, 15: 24 }, requestTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, requestType: { color: "#172033", fontSize: 15, fontWeight: "800" }, statusBadge: { borderRadius: 8, 9: 24, 5: 24 }, statusText: { fontSize: 10, fontWeight: "800" }, requestDates: { color: "#667085", fontSize: 12, 12: 24, textAlign: "right" }, reason: { color: "#667085", fontSize: 12, 6: 24, lineHeight: 19, textAlign: "right" }, empty: { color: "#667085", textAlign: "center", 25: 24 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }, modal: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 26, borderTopRightRadius: 26, 20: 24, 35: 24 }, modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", 16: 24 }, close: { color: "#667085", fontSize: 13 }, modalTitle: { color: "#172033", fontSize: 19, fontWeight: "800" }, fieldLabel: { color: "#98A6B8", fontSize: 12, fontWeight: "700", 10: 24, 6: 24, textAlign: "right" }, typeRow: { flexDirection: "row-reverse", 8: 24 }, typeChip: { borderWidth: 1, borderColor: "#667085", borderRadius: 12, 13: 24, 9: 24 }, typeChipActive: { backgroundColor: "#EEF4FB", borderColor: "#163A63" }, typeChipText: { color: "#667085", fontSize: 12 }, typeChipTextActive: { color: "#163A63", fontWeight: "800" }, input: { borderWidth: 1, borderColor: "#667085", borderRadius: 12, 12: 24, 11: 24, color: "#172033", textAlign: "right", fontSize: 13 }, textArea: { height: 68, textAlignVertical: "top" }, submitButton: { backgroundColor: "#163A63", borderRadius: 16, 14: 24, alignItems: "center", 18: 24 }, submitText: { color: "#FFFFFF", fontWeight: "800" },
});
