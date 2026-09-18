import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { showAlert } from "@/lib/alert";
import * as Auth from "@/lib/_core/auth";

export default function LoginScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const statusQuery = trpc.system.bootstrapStatus.useQuery();
  const loginMutation = trpc.auth.login.useMutation();
  const setupMutation = trpc.system.setupManager.useMutation();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
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
      const result = isSetup
        ? await setupMutation.mutateAsync({ phone, password, name })
        : await loginMutation.mutateAsync({ phone, password });
      if (Platform.OS !== "web") await Auth.setSessionToken(result.token);
      await utils.auth.me.invalidate();
      router.replace("/(tabs)");
    } catch (error) {
      showAlert("تعذر الدخول", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    }
  }

  const busy = loginMutation.isPending || setupMutation.isPending;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.ambientOne} />
        <View style={styles.ambientTwo} />
        <View style={styles.brandMark}>
          <Svg width={44} height={44} viewBox="0 0 64 64">
            <Defs>
              <LinearGradient id="fingerprintBlue" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#7DD3FC" />
                <Stop offset="0.48" stopColor="#38BDF8" />
                <Stop offset="1" stopColor="#0284C7" />
              </LinearGradient>
            </Defs>
            <Path d="M32 8C19.3 8 9 18.3 9 31c0 6.2 2.5 11.8 6.5 15.9" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
            <Path d="M32 15c-8.8 0-16 7.2-16 16 0 7.1 2.3 12.4 6.2 16.8" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
            <Path d="M32 22c-4.9 0-9 4.1-9 9 0 7.7 3.1 13.2 7.1 18.3" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
            <Path d="M32 8c12.7 0 23 10.3 23 23 0 10.2-4.4 18.6-11.1 24.2" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
            <Path d="M32 15c8.8 0 16 7.2 16 16 0 10.1-4.7 17.1-10.3 23.2" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
            <Path d="M32 22c4.9 0 9 4.1 9 9 0 7.4-2.8 13.1-6.8 18.8" fill="none" stroke="url(#fingerprintBlue)" strokeWidth="5" strokeLinecap="round"/>
          </Svg>
        </View>
        <Text style={styles.brand}>حاضر</Text>
        <Text style={styles.tagline}>نظام الحضور والانصراف والمرتبات</Text>
        <View style={styles.card}>
          <View style={styles.cardAccent} />
          <Text style={styles.kicker}>بوابة الموظفين</Text>
          <Text style={styles.title}>{isSetup ? "إعداد حساب المدير" : "تسجيل الدخول"}</Text>
          <Text style={styles.subtitle}>{isSetup ? "أنشئ حسابك الإداري الأول، وبعدها أضف فريقك." : "استخدم رقم الهاتف وكلمة المرور الخاصة بحسابك."}</Text>
          {isSetup && <><Text style={styles.label}>اسم المدير</Text><TextInput value={name} onChangeText={setName} placeholder="اسمك" placeholderTextColor="#94A3B8" style={styles.input} textAlign="right" /></>}
          <Text style={styles.label}>رقم الهاتف</Text>
          <TextInput value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" placeholderTextColor="#94A3B8" keyboardType="phone-pad" style={styles.input} textAlign="right" />
          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput value={password} onChangeText={setPassword} placeholder={isSetup ? "6 أحرف على الأقل" : "كلمة المرور"} placeholderTextColor="#94A3B8" secureTextEntry style={styles.input} textAlign="right" />
          <Pressable onPress={handleSubmit} disabled={busy} style={({ pressed }) => [styles.button, busy && styles.buttonDisabled, pressed && !busy && styles.buttonPressed]}>
            <Text style={styles.buttonText}>{busy ? "جاري الدخول..." : isSetup ? "إنشاء حساب المدير" : "دخول"}</Text>
          </Pressable>
        </View>
        <Text style={styles.footer}>حسابات الشركة خاصة بالاستاف فقط</Text>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22, overflow: "hidden" },
  ambientOne: { position: "absolute", width: 320, height: 320, borderRadius: 160, backgroundColor: "#DBEAFE", opacity: 0.65, top: -150, right: -120 },
  ambientTwo: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "#E0E7FF", opacity: 0.55, bottom: -130, left: -100 },
  brandMark: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#0F6FB5", alignItems: "center", justifyContent: "center", shadowColor: "#38BDF8", shadowOpacity: 0.3, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 7 },
  
  brand: { color: "#0F172A", fontSize: 34, fontWeight: "900", marginTop: 12 },
  tagline: { color: "#64748B", fontSize: 13, marginTop: 4 },
  card: { width: "100%", maxWidth: 430, backgroundColor: "#FFFFFF", borderRadius: 26, padding: 24, marginTop: 28, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 5, overflow: "hidden" },
  cardAccent: { height: 4, backgroundColor: "#2563EB", borderRadius: 4, marginBottom: 18 },
  kicker: { color: "#2563EB", fontSize: 11, fontWeight: "800", textAlign: "right", marginBottom: 5 },
  title: { color: "#0F172A", fontSize: 23, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#64748B", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 7, marginBottom: 12 },
  label: { color: "#334155", fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 11, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#CBD5E1", backgroundColor: "#F8FAFC", borderRadius: 14, paddingHorizontal: 13, paddingVertical: 13, color: "#0F172A", fontSize: 14 },
  button: { backgroundColor: "#2563EB", borderRadius: 14, alignItems: "center", paddingVertical: 14, marginTop: 20, shadowColor: "#2563EB", shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  footer: { color: "#94A3B8", fontSize: 11, marginTop: 18 },
});
