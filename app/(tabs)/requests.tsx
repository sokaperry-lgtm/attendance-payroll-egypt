import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { ScreenContainer } from "@/components/screen-container";
import { useAppData, type RequestType } from "@/lib/app-data";

const requestPalette: Record<string, { bg: string; text: string }> = { "قيد المراجعة": { bg: "#FEF3C7", text: "#92400E" }, مقبول: { bg: "#DCFCE7", text: "#166534" }, مرفوض: { bg: "#FEE2E2", text: "#991B1B" } };

export default function RequestsScreen() {
  const { requests, submitRequest } = useAppData();
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<RequestType>("إجازة");
  const [from, setFrom] = useState("2026-09-20");
  const [to, setTo] = useState("2026-09-20");
  const [reason, setReason] = useState("");

  async function saveRequest() {
    if (!reason.trim()) { showAlert("بيانات ناقصة", "اكتب سبب الطلب أولًا."); return; }
    try {
      await submitRequest({ type, from, to, reason });
    } catch (error) {
      showAlert("تعذر إرسال الطلب", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
      return;
    }
    setReason(""); setModalOpen(false);
    showAlert("تم إرسال الطلب", "سيظهر للمدير للمراجعة والاعتماد.");
  }

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>طلباتك وموافقاتك</Text><Text style={styles.title}>الطلبات</Text><Text style={styles.subtitle}>إجازات، أذونات ومأموريات</Text></View><Pressable onPress={() => setModalOpen(true)} style={styles.addButton}><Text style={styles.addButtonText}>+ طلب جديد</Text></Pressable></View>
    <View style={styles.requestsHero}>
      <View style={styles.requestsHeroIcon}><IconSymbol name="doc.text" size={22} color="#FFFFFF" /></View>
      <View style={styles.requestsHeroCopy}><Text style={styles.requestsHeroTitle}>مركز الطلبات</Text><Text style={styles.requestsHeroText}>قدّم طلبك وتابع حالته من مكان واحد.</Text></View>
      <View style={styles.requestsHeroBadge}><Text style={styles.requestsHeroNumber}>{requests.length}</Text><Text style={styles.requestsHeroLabel}>طلبات</Text></View>
    </View>
    <View style={styles.info}><Text style={styles.infoTitle}>رصيد الإجازات المدفوعة</Text><Text style={styles.infoValue}>4 <Text style={styles.infoUnit}>أيام متاحة</Text></Text><Text style={styles.infoHint}>حسب سياسة الشركة: 26 يوم عمل + 4 أيام إجازة مدفوعة</Text></View>
    <Text style={styles.sectionTitle}>طلباتك السابقة</Text>
    {requests.map((request) => { const palette = requestPalette[request.status]; return <View key={request.id} style={styles.requestCard}><View style={styles.requestTop}><View style={[styles.statusBadge, { backgroundColor: palette.bg }]}><Text style={[styles.statusText, { color: palette.text }]}>{request.status}</Text></View><Text style={styles.requestType}>{request.type}</Text></View><Text style={styles.requestDates}>{request.from} {request.to !== request.from ? `— ${request.to}` : ""}</Text><Text style={styles.reason}>{request.reason}</Text></View>; })}
    {requests.length === 0 && <Text style={styles.empty}>لم ترسل أي طلبات بعد.</Text>}
  </ScrollView>
  <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}><View style={styles.modalBackdrop}><View style={styles.modal}><View style={styles.modalHeader}><Pressable onPress={() => setModalOpen(false)}><Text style={styles.close}>إلغاء</Text></Pressable><Text style={styles.modalTitle}>طلب جديد</Text></View><Text style={styles.fieldLabel}>نوع الطلب</Text><View style={styles.typeRow}>{(["إجازة", "إذن", "مأمورية"] as RequestType[]).map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.typeChip, type === item && styles.typeChipActive]}><Text style={[styles.typeChipText, type === item && styles.typeChipTextActive]}>{item}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>من</Text><TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.fieldLabel}>إلى</Text><TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" style={styles.input} /><Text style={styles.fieldLabel}>السبب</Text><TextInput value={reason} onChangeText={setReason} placeholder="اكتب سبب الطلب" multiline style={[styles.input, styles.textArea]} /><Pressable onPress={saveRequest} style={styles.submitButton}><Text style={styles.submitText}>إرسال للمراجعة</Text></Pressable></View></View></Modal>
  </ScreenContainer>;
}

const styles = StyleSheet.create({
  requestsHero: { backgroundColor: "#0B1220", borderRadius: 23, padding: 18, flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  requestsHeroIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" },
  requestsHeroCopy: { flex: 1 },
  requestsHeroTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800", textAlign: "right" },
  requestsHeroText: { color: "#94A3B8", fontSize: 10, marginTop: 3, textAlign: "right" },
  requestsHeroBadge: { alignItems: "center" },
  requestsHeroNumber: { color: "#C4B5FD", fontSize: 24, fontWeight: "900" },
  requestsHeroLabel: { color: "#94A3B8", fontSize: 9 },
  content: { padding: 20, paddingBottom: 40, gap: 17 }, header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: "#64748B", fontSize: 13, textAlign: "right" }, title: { color: "#0F172A", fontSize: 27, fontWeight: "800", marginTop: 5, textAlign: "right" }, subtitle: { color: "#64748B", fontSize: 12, marginTop: 5, textAlign: "right" }, addButton: { backgroundColor: "#2563EB", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 }, addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" }, info: { backgroundColor: "#EFF6FF", borderRadius: 18, padding: 17, borderWidth: 1, borderColor: "#BFDBFE" }, infoTitle: { color: "#1E40AF", fontSize: 13, textAlign: "right" }, infoValue: { color: "#2563EB", fontSize: 30, fontWeight: "800", textAlign: "right", marginTop: 4 }, infoUnit: { color: "#1E40AF", fontSize: 12, fontWeight: "500" }, infoHint: { color: "#2563EB", fontSize: 11, marginTop: 4, textAlign: "right" }, sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", textAlign: "right" }, requestCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18, padding: 15 }, requestTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, requestType: { color: "#0F172A", fontSize: 15, fontWeight: "800" }, statusBadge: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5 }, statusText: { fontSize: 10, fontWeight: "800" }, requestDates: { color: "#475569", fontSize: 12, marginTop: 12, textAlign: "right" }, reason: { color: "#64748B", fontSize: 12, marginTop: 6, lineHeight: 19, textAlign: "right" }, empty: { color: "#64748B", textAlign: "center", padding: 25 }, modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" }, modal: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 35 }, modalHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }, close: { color: "#64748B", fontSize: 13 }, modalTitle: { color: "#0F172A", fontSize: 20, fontWeight: "800" }, fieldLabel: { color: "#334155", fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 6, textAlign: "right" }, typeRow: { flexDirection: "row-reverse", gap: 8 }, typeChip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9 }, typeChipActive: { backgroundColor: "#DBEAFE", borderColor: "#2563EB" }, typeChipText: { color: "#64748B", fontSize: 12 }, typeChipTextActive: { color: "#2563EB", fontWeight: "800" }, input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: "#0F172A", textAlign: "right", fontSize: 13 }, textArea: { height: 68, textAlignVertical: "top" }, submitButton: { backgroundColor: "#2563EB", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 18 }, submitText: { color: "#FFFFFF", fontWeight: "800" },
});
