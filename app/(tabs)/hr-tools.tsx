import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { formatMoney } from "@/lib/payroll";

type Role = "owner" | "manager" | "hr" | "supervisor" | "accountant" | "employee";

export default function HrToolsScreen() {
  const me = trpc.auth.me.useQuery(undefined, { retry: false });
  const role = (me.data?.membershipRole || me.data?.role || "employee") as Role;
  const canOpen = role === "owner" || role === "manager" || role === "hr";
  const canManageMoney = role === "owner" || role === "manager";
  const staff = trpc.staff.list.useQuery(undefined, { enabled: canOpen, retry: false });
  const employees = Array.isArray(staff.data) ? staff.data : [];
  const [selectedStaff, setSelectedStaff] = useState("");
  const selectedId = Number(selectedStaff);
  const hasSelected = Number.isInteger(selectedId) && selectedId > 0;

  const docs = trpc.hrTools.documents.useQuery(
    { staffAccountId: selectedId },
    { enabled: canOpen && hasSelected, retry: false }
  );
  const addDoc = trpc.hrTools.addDocument.useMutation({ onSuccess: () => docs.refetch() });
  const deleteDoc = trpc.hrTools.deleteDocument.useMutation({ onSuccess: () => docs.refetch() });

  const month = new Date().toISOString().slice(0, 7);
  const adjustments = trpc.hrTools.adjustments.useQuery(
    { month },
    { enabled: canManageMoney, retry: false }
  );
  const advances = trpc.hrTools.advances.useQuery(
    undefined,
    { enabled: canManageMoney, retry: false }
  );
  const addAdjustment = trpc.hrTools.addAdjustment.useMutation({ onSuccess: () => adjustments.refetch() });
  const addAdvance = trpc.hrTools.addAdvance.useMutation({ onSuccess: () => advances.refetch() });

  const [doc, setDoc] = useState({ type: "بطاقة شخصية", title: "", number: "", expiry: "", note: "" });
  const [money, setMoney] = useState({ type: "incentive" as "incentive" | "bonus" | "penalty" | "deduction", title: "", amount: "" });
  const [advance, setAdvance] = useState({ amount: "", installment: "" });

  if (!canOpen) {
    return <ScreenContainer><View style={styles.center}><Text style={styles.deniedTitle}>أدوات الموارد البشرية غير متاحة</Text><Text style={styles.muted}>تحتاج صلاحية مدير أو HR للوصول إلى هذه الصفحة.</Text></View></ScreenContainer>;
  }

  const selectedName = employees.find((x: any) => Number(x.id) === selectedId)?.name || "الموظف المحدد";
  const docRows = Array.isArray(docs.data) ? docs.data : [];
  const adjustmentRows = Array.isArray(adjustments.data) ? adjustments.data : [];
  const advanceRows = Array.isArray(advances.data) ? advances.data : [];

  async function saveDocument() {
    if (!doc.title.trim()) return Alert.alert("بيانات ناقصة", "اكتب اسم المستند.");
    try {
      await addDoc.mutateAsync({
        staffAccountId: selectedId,
        type: doc.type,
        title: doc.title.trim(),
        documentNumber: doc.number.trim() || undefined,
        expiryDate: doc.expiry.trim() || undefined,
        note: doc.note.trim() || undefined,
      });
      setDoc({ type: "بطاقة شخصية", title: "", number: "", expiry: "", note: "" });
      Alert.alert("تم", "تم حفظ المستند.");
    } catch (e) { Alert.alert("خطأ", e instanceof Error ? e.message : "تعذر حفظ المستند."); }
  }

  async function saveAdjustment() {
    if (!selectedId || !money.title.trim() || !money.amount) return Alert.alert("بيانات ناقصة", "اختار موظف واكتب المبلغ والوصف.");
    try {
      await addAdjustment.mutateAsync({ staffAccountId: selectedId, month, type: money.type, title: money.title.trim(), amount: Number(money.amount) });
      setMoney(x => ({ ...x, title: "", amount: "" }));
      Alert.alert("تم", "تم تسجيل التعديل المالي.");
    } catch (e) { Alert.alert("خطأ", e instanceof Error ? e.message : "تعذر الحفظ."); }
  }

  async function saveAdvance() {
    if (!selectedId || !advance.amount || !advance.installment) return Alert.alert("بيانات ناقصة", "اختار موظف واكمل بيانات السلفة.");
    try {
      await addAdvance.mutateAsync({ staffAccountId: selectedId, amount: Number(advance.amount), installmentAmount: Number(advance.installment), startMonth: month });
      setAdvance({ amount: "", installment: "" });
      Alert.alert("تم", "تم تسجيل السلفة.");
    } catch (e) { Alert.alert("خطأ", e instanceof Error ? e.message : "تعذر الحفظ."); }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><IconSymbol name="banknote" size={25} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>HR TOOLS</Text>
            <Text style={styles.heroTitle}>إدارة الموارد البشرية</Text>
            <Text style={styles.heroSub}>المستندات والتعديلات المالية والسلف في شاشة واحدة.</Text>
          </View>
        </View>

        <Section title="اختيار الموظف" hint="اختار الموظف أولاً، وبعدها هتظهر أدواته.">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffRow}>
            {employees.length ? employees.map((x: any) => (
              <Pressable key={x.id} onPress={() => setSelectedStaff(String(x.id))} style={[styles.chip, selectedId === Number(x.id) && styles.chipActive]}>
                <Text style={[styles.chipText, selectedId === Number(x.id) && styles.chipTextActive]}>{x.name}</Text>
              </Pressable>
            )) : <Text style={styles.muted}>لا توجد قائمة موظفين متاحة.</Text>}
          </ScrollView>
        </Section>

        <Section title="مستندات الموظف" hint={hasSelected ? `الموظف: ${selectedName}` : "اختار موظفًا لعرض مستنداته وإضافتها."}>
          {!hasSelected ? <Empty text="اختار موظف أولاً." /> : <>
            <View style={styles.types}>{["بطاقة شخصية","عقد","شهادة","تأمينات","أخرى"].map(x => <Pressable key={x} onPress={() => setDoc(d => ({ ...d, type: x }))} style={[styles.type, doc.type === x && styles.typeActive]}><Text style={[styles.typeText, doc.type === x && styles.typeTextActive]}>{x}</Text></Pressable>)}</View>
            <TextInput style={styles.input} value={doc.title} onChangeText={v => setDoc(d => ({ ...d, title: v }))} placeholder="اسم المستند" placeholderTextColor="#8A98AA" textAlign="right" />
            <TextInput style={styles.input} value={doc.number} onChangeText={v => setDoc(d => ({ ...d, number: v }))} placeholder="رقم المستند (اختياري)" placeholderTextColor="#8A98AA" textAlign="right" />
            <TextInput style={styles.input} value={doc.expiry} onChangeText={v => setDoc(d => ({ ...d, expiry: v }))} placeholder="تاريخ الانتهاء YYYY-MM-DD" placeholderTextColor="#8A98AA" textAlign="right" />
            <TextInput style={styles.input} value={doc.note} onChangeText={v => setDoc(d => ({ ...d, note: v }))} placeholder="ملاحظة (اختياري)" placeholderTextColor="#8A98AA" textAlign="right" />
            <Pressable style={styles.button} disabled={addDoc.isPending} onPress={saveDocument}><Text style={styles.buttonText}>{addDoc.isPending ? "جاري الحفظ..." : "إضافة المستند"}</Text></Pressable>
            {docs.isLoading ? <ActivityIndicator color="#163A63" /> : docRows.length ? docRows.map((d: any) => <View key={d.id} style={styles.item}><View style={styles.itemCopy}><Text style={styles.itemTitle}>{d.title}</Text><Text style={styles.itemSub}>{d.type}{d.documentNumber ? ` · ${d.documentNumber}` : ""}{d.expiryDate ? ` · ينتهي ${d.expiryDate}` : ""}</Text></View><Pressable onPress={() => deleteDoc.mutate({ id: d.id })}><Text style={styles.delete}>حذف</Text></Pressable></View>) : <Empty text="لا توجد مستندات لهذا الموظف." />}
          </>}
        </Section>

        {canManageMoney && <Section title={`تعديلات الرواتب · ${month}`} hint="حوافز ومكافآت وخصومات وجزاءات قبل اعتماد المسير.">
          <View style={styles.types}>{[["incentive","حافز"],["bonus","مكافأة"],["penalty","جزاء"],["deduction","خصم"]].map(([v,l]) => <Pressable key={v} onPress={() => setMoney(x => ({ ...x, type: v as any }))} style={[styles.type, money.type === v && styles.typeActive]}><Text style={[styles.typeText, money.type === v && styles.typeTextActive]}>{l}</Text></Pressable>)}</View>
          <TextInput style={styles.input} value={money.title} onChangeText={v => setMoney(x => ({ ...x, title: v }))} placeholder="وصف التعديل" placeholderTextColor="#8A98AA" textAlign="right" />
          <TextInput style={styles.input} value={money.amount} onChangeText={v => setMoney(x => ({ ...x, amount: v }))} placeholder="المبلغ بالجنيه" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right" />
          <Pressable style={styles.button} disabled={addAdjustment.isPending} onPress={saveAdjustment}><Text style={styles.buttonText}>{addAdjustment.isPending ? "جاري الحفظ..." : "حفظ التعديل"}</Text></Pressable>
          {adjustmentRows.length ? adjustmentRows.map((a: any) => <View key={a.id} style={styles.item}><View style={styles.amount}><Text style={styles.money}>{formatMoney(Number(a.amount) || 0)}</Text></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{a.title}</Text><Text style={styles.itemSub}>{a.type}</Text></View></View>) : <Empty text={adjustments.isLoading ? "جاري التحميل..." : "لا توجد تعديلات لهذا الشهر."} />}
        </Section>}

        {canManageMoney && <Section title="السلف الحالية" hint="تسجيل ومتابعة السلف والأقساط.">
          <TextInput style={styles.input} value={advance.amount} onChangeText={v => setAdvance(x => ({ ...x, amount: v }))} placeholder="إجمالي السلفة" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right" />
          <TextInput style={styles.input} value={advance.installment} onChangeText={v => setAdvance(x => ({ ...x, installment: v }))} placeholder="القسط الشهري" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right" />
          <Pressable style={styles.button} disabled={addAdvance.isPending} onPress={saveAdvance}><Text style={styles.buttonText}>{addAdvance.isPending ? "جاري الحفظ..." : "تسجيل السلفة"}</Text></Pressable>
          {advanceRows.length ? advanceRows.map((a: any) => <View key={a.id} style={styles.item}><View style={styles.amount}><Text style={styles.money}>{formatMoney(Number(a.remainingAmount) || 0)}</Text></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{selectedName}</Text><Text style={styles.itemSub}>قسط {formatMoney(Number(a.installmentAmount) || 0)} · {a.status}</Text></View></View>) : <Empty text={advances.isLoading ? "جاري التحميل..." : "لا توجد سلف حالية."} />}
        </Section>}
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{hint ? <Text style={styles.hint}>{hint}</Text> : null}{children}</View>;
}
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.muted}>{text}</Text></View>; }

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1100, width: "100%", alignSelf: "center" },
  hero: { backgroundColor: "#163A63", borderRadius: 24, padding: 22, flexDirection: "row-reverse", alignItems: "center", gap: 16 },
  heroIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#2B5685", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 }, eyebrow: { color: "#BFD3EA", fontSize: 9, fontWeight: "900", textAlign: "right" },
  heroTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", textAlign: "right", marginTop: 4 },
  heroSub: { color: "#D8E5F2", fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 5 },
  section: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E4EAF1", borderRadius: 20, padding: 18, gap: 10, elevation: 1 },
  sectionTitle: { color: "#163A63", fontSize: 16, fontWeight: "900", textAlign: "right" },
  hint: { color: "#728198", fontSize: 10, lineHeight: 16, textAlign: "right" },
  staffRow: { gap: 8, flexDirection: "row-reverse", paddingVertical: 2 },
  chip: { borderWidth: 1, borderColor: "#D5DEE9", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "#F8FAFC" },
  chipActive: { backgroundColor: "#163A63", borderColor: "#163A63" },
  chipText: { color: "#42536A", fontSize: 10, fontWeight: "700" }, chipTextActive: { color: "#FFFFFF" },
  types: { flexDirection: "row-reverse", gap: 8 }, type: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  typeActive: { backgroundColor: "#163A63", borderColor: "#163A63" }, typeText: { color: "#42536A", fontSize: 10, fontWeight: "800" }, typeTextActive: { color: "#FFFFFF" },
  input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, color: "#163A63", fontSize: 12, fontWeight: "600" },
  button: { backgroundColor: "#163A63", borderRadius: 12, paddingVertical: 13, alignItems: "center" }, buttonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 12 },
  item: { flexDirection: "row-reverse", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#EDF1F5", paddingVertical: 12 }, itemCopy: { flex: 1 },
  itemTitle: { color: "#1E3148", fontWeight: "800", fontSize: 12, textAlign: "right" }, itemSub: { color: "#728198", fontSize: 10, textAlign: "right", marginTop: 3 },
  amount: { minWidth: 88, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#EEF4FA", alignItems: "center" }, money: { color: "#163A63", fontWeight: "900", fontSize: 11 },
  empty: { backgroundColor: "#F8FAFC", borderRadius: 12, padding: 14, alignItems: "center" }, muted: { color: "#728198", fontSize: 11, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }, deniedTitle: { color: "#163A63", fontSize: 20, fontWeight: "900", textAlign: "center" },
  delete: { color: "#163A63", fontSize: 10, fontWeight: "900" },
});
