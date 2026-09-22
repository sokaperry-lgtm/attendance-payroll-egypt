import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { showAlert } from "@/lib/alert";
import * as Auth from "@/lib/_core/auth";

export default function LoginScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const utils = trpc.useUtils();
  const statusQuery = trpc.system.bootstrapStatus.useQuery();
  const loginMutation = trpc.auth.login.useMutation();
  const setupMutation = trpc.system.setupManager.useMutation();
  const resetMutation = trpc.system.resetAndSetup.useMutation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const isSetup = statusQuery.data?.hasManager === false;

  useEffect(() => {
    if (statusQuery.data?.hasManager === false) setName("مدير الشركة");
  }, [statusQuery.data?.hasManager]);

  async function handleSubmit() {
    try {
      if (!phone.trim() || !password.trim() || (isSetup && !name.trim())) {
        showAlert("بيانات ناقصة", "اكتب البيانات المطلوبة أولًا.");
        return;
      }
      const result = resetMode
        ? await resetMutation.mutateAsync({ confirm: "RESET-STAFF", phone, password, name })
        : isSetup
          ? await setupMutation.mutateAsync({ phone, password, name })
          : await loginMutation.mutateAsync({ phone, password });

      // Persist the staff session on both web and native. Web requests also
      // send this token as a Bearer header, so login survives cookie quirks.
      await Auth.setSessionToken(result.token);
      // Seed the auth gate immediately with the authenticated staff returned by login.
      // This prevents a stale cached `auth.me = null` query from redirecting us back to login.
      utils.auth.me.setData(undefined, result.staff as any);
      await utils.auth.me.refetch();
      router.replace("/(tabs)");
    } catch (error) {
      showAlert("تعذر الدخول", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    }
  }

  const busy = loginMutation.isPending || setupMutation.isPending || resetMutation.isPending;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView style={[styles.container, isWide && styles.containerWide]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.ambientOne} />
        <View style={styles.ambientTwo} />
        <View style={[styles.brandPanel, isWide ? styles.brandPanelWide : styles.brandPanelMobile]}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Svg width={44} height={44} viewBox="0 0 64 64">
                <Defs><LinearGradient id="fingerprintBlue" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#7DD3FC" /><Stop offset="0.48" stopColor="#38BDF8" /><Stop offset="1" stopColor="#0284C7" /></LinearGradient></Defs>
                <Path d="M32 8C19.3 8 9 18.3 9 31c0 6.2 2.5 11.8 6.5 15.9" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
                <Path d="M32 15c-8.8 0-16 7.2-16 16 0 7.1 2.3 12.4 6.2 16.8" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
                <Path d="M32 22c-4.9 0-9 4.1-9 9 0 7.7 3.1 13.2 7.1 18.3" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
                <Path d="M32 8c12.7 0 23 10.3 23 23 0 10.2-4.4 18.6-11.1 24.2" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
                <Path d="M32 15c8.8 0 16 7.2 16 16 0 10.1-4.7 17.1-10.3 23.2" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
                <Path d="M32 22c4.9 0 9 4.1 9 9 0 7.4-2.8 13.1-6.8 18.8" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
              </Svg>
            </View>
            <View style={styles.brandCopy}><Text style={styles.brand}>حاضر</Text><Text style={styles.tagline}>HR · Attendance · Payroll</Text></View>
          </View>
          <Text style={styles.brandStatement}>كل عمليات فريقك في مكان واحد.</Text>
          <Text style={styles.brandDescription}>حضور وانصراف، جداول، طلبات، تقارير ورواتب — بتجربة SaaS بسيطة وواضحة.</Text>
          {isWide && <View style={styles.featureGrid}>
            <View style={styles.featureCard}><Text style={styles.featureValue}>01</Text><Text style={styles.featureLabel}>Attendance</Text><Text style={styles.featureHint}>متابعة الحضور لحظة بلحظة</Text></View>
            <View style={styles.featureCard}><Text style={styles.featureValue}>02</Text><Text style={styles.featureLabel}>Payroll</Text><Text style={styles.featureHint}>ملخصات رواتب واضحة</Text></View>
            <View style={styles.featureCard}><Text style={styles.featureValue}>03</Text><Text style={styles.featureLabel}>Reports</Text><Text style={styles.featureHint}>بيانات تساعد الإدارة</Text></View>
          </View>}
        </View>
        <View style={[styles.card, isWide && styles.cardWide]}>
          <View style={styles.cardHeader}><View style={styles.statusDot} /><Text style={styles.cardStatus}>SECURE COMPANY ACCESS</Text></View>
          <Text style={styles.kicker}>{resetMode ? "إعادة تهيئة النظام" : isSetup ? "إعداد النظام" : "بوابة الشركة"}</Text>
          <Text style={styles.title}>{resetMode ? "ابدأ من جديد" : isSetup ? "إعداد حساب المدير" : "مرحبًا بعودتك"}</Text>
          <Text style={styles.subtitle}>{resetMode ? "سيتم حذف حسابات الموظفين وبيانات الحضور والطلبات والرواتب الحالية، مع الاحتفاظ بإعدادات الشركة والفرع." : isSetup ? "أنشئ حسابك الإداري الأول، وبعدها أضف فريقك." : "سجّل دخولك للوصول إلى لوحة العمل الخاصة بشركتك."}</Text>
          {isSetup && <><Text style={styles.label}>اسم المدير</Text><TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor="#8592A6" style={styles.input} textAlign="right" /></>}
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" placeholderTextColor="#8592A6" keyboardType="phone-pad" style={styles.input} textAlign="right" />
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder={isSetup ? "6 أحرف على الأقل" : "كلمة المرور"} placeholderTextColor="#8592A6" secureTextEntry style={styles.input} textAlign="right" />
          {resetMode && <View style={{ backgroundColor: "#3A2418", borderRadius: 12, padding: 10, marginTop: 8 }}><Text style={{ color: "#FDBA74", fontSize: 11, lineHeight: 17, textAlign: "right" }}>⚠️ إعادة التهيئة ستمسح كل حسابات الموظفين وسجلاتهم الحالية.</Text></View>}\n          <Pressable onPress={handleSubmit} disabled={busy} style={({ pressed }) => [styles.button, busy && styles.buttonDisabled, pressed && !busy && styles.buttonPressed]}>
            <Text style={styles.buttonText}>{busy ? "جاري التنفيذ..." : resetMode ? "مسح الحسابات والبدء من جديد" : isSetup ? "إنشاء حساب المدير" : "دخول إلى النظام"}</Text>
          </Pressable>
          <Pressable onPress={() => setResetMode((v) => !v)} disabled={busy} style={{ marginTop: 14 }}><Text style={{ color: "#60A5FA", fontSize: 11, textAlign: "center", fontWeight: "700" }}>{resetMode ? "رجوع لتسجيل الدخول" : "إعادة تهيئة الحسابات من الصفر"}</Text></Pressable>\n          <Text style={styles.securityNote}>بيانات الدخول مشفرة ومخصصة لحسابات الشركة.</Text>
        </View>
        <Text style={styles.footer}>حاضر · منصة إدارة الموارد البشرية للشركات</Text>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, overflow: "hidden" },
  containerWide: { flexDirection: "row-reverse", gap: 70, paddingHorizontal: 7, maxWidth: 1180, alignSelf: "center", width: "100%" },
  ambientOne: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "#1B2A45", opacity: 0.65, top: -150, right: -120 },
  ambientTwo: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#1D2540", opacity: 0.55, bottom: -130, left: -100 },
  brandPanel: { justifyContent: "center" },
  brandPanelWide: { flex: 1, maxWidth: 540 },
  brandPanelMobile: { alignItems: "center", width: "100%" },
  brandRow: { flexDirection: "row-reverse", alignItems: "center", gap: 14 },
  brandMark: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#1E4E78", alignItems: "center", justifyContent: "center", shadowColor: "#38BDF8", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  brandCopy: { alignItems: "flex-end" },
  brand: { color: "#EEF2F8", fontSize: 34, fontWeight: "900" },
  tagline: { color: "#97A3B6", fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  brandStatement: { color: "#EEF2F8", fontSize: 29, fontWeight: "900", marginTop: 30, textAlign: "right" },
  brandDescription: { color: "#97A3B6", fontSize: 14, lineHeight: 23, marginTop: 9, maxWidth: 500, textAlign: "right" },
  featureGrid: { flexDirection: "row-reverse", gap: 10, marginTop: 28 },
  featureCard: { flex: 1, minHeight: 116, backgroundColor: "#0B1220", borderRadius: 18, padding: 14 },
  featureValue: { color: "#60A5FA", fontSize: 10, fontWeight: "900" },
  featureLabel: { color: "#F5F7FA", fontSize: 13, fontWeight: "800", marginTop: 17, textAlign: "right" },
  featureHint: { color: "#8592A6", fontSize: 9, lineHeight: 14, marginTop: 4, textAlign: "right" },
  card: { width: "100%", maxWidth: 430, backgroundColor: "#131A24", borderRadius: 26, padding: 24, marginTop: 28, borderWidth: 1, borderColor: "#232C3A", shadowColor: "#EEF2F8", shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5, overflow: "hidden" },
  cardWide: { marginTop: 0, width: 420 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 18 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" },
  cardStatus: { color: "#8592A6", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  kicker: { color: "#5B9BFF", fontSize: 11, fontWeight: "800", textAlign: "right", marginBottom: 5 },
  title: { color: "#EEF2F8", fontSize: 23, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#97A3B6", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 7, marginBottom: 12 },
  label: { color: "#AAB4C4", fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 11, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#8B96A8", backgroundColor: "#10161F", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, color: "#EEF2F8", fontSize: 14 },
  button: { backgroundColor: "#3B82F6", borderRadius: 14, alignItems: "center", paddingVertical: 14, marginTop: 20, shadowColor: "#5B9BFF", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonText: { color: "#F5F7FA", fontWeight: "800", fontSize: 14 },
  securityNote: { color: "#8592A6", fontSize: 10, textAlign: "center", marginTop: 14 },
  footer: { color: "#8592A6", fontSize: 10, marginTop: 18, textAlign: "center" },
});
