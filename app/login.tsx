import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>ح</Text></View>
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
  brandMark: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", shadowColor: "#2563EB", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  brandMarkText: { color: "#FFFFFF", fontSize: 32, fontWeight: "800" },
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
