import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
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

  useEffect(() => { if (statusQuery.data?.hasManager === false) setName("مدير الشركة"); }, [statusQuery.data?.hasManager]);

  async function handleSubmit() {
    try {
      if (!phone.trim() || !password.trim() || (isSetup && !name.trim())) { Alert.alert("بيانات ناقصة", "اكتب البيانات المطلوبة أولًا."); return; }
      const result = isSetup ? await setupMutation.mutateAsync({ phone, password, name }) : await loginMutation.mutateAsync({ phone, password });
      if (Platform.OS !== "web") await Auth.setSessionToken(result.token);
      await utils.auth.me.invalidate();
      router.replace("/(tabs)");
    } catch (error) { Alert.alert("تعذر الدخول", error instanceof Error ? error.message : "حدث خطأ غير متوقع."); }
  }

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.brandMark}><Text style={styles.brandMarkText}>ح</Text></View><Text style={styles.brand}>حاضر</Text><Text style={styles.tagline}>حضور وانصراف ومرتبات</Text><View style={styles.card}><Text style={styles.title}>{isSetup ? "إعداد حساب المدير" : "تسجيل الدخول"}</Text><Text style={styles.subtitle}>{isSetup ? "أنشئ حسابك الإداري الأول، وبعدها أضف فريقك." : "استخدم رقم الهاتف وكلمة المرور التي أعطاها لك المدير."}</Text>{isSetup && <><Text style={styles.label}>اسم المدير</Text><TextInput value={name} onChangeText={setName} placeholder="اسمك" style={styles.input} textAlign="right" /></>}<Text style={styles.label}>رقم الهاتف</Text><TextInput value={phone} onChangeText={setPhone} placeholder="01xxxxxxxxx" keyboardType="phone-pad" style={styles.input} textAlign="right" /><Text style={styles.label}>كلمة المرور</Text><TextInput value={password} onChangeText={setPassword} placeholder={isSetup ? "6 أحرف على الأقل" : "كلمة المرور"} secureTextEntry style={styles.input} textAlign="right" /><Pressable onPress={handleSubmit} disabled={loginMutation.isPending || setupMutation.isPending} style={({ pressed }) => [styles.button, pressed && { opacity: 0.82 }]}><Text style={styles.buttonText}>{loginMutation.isPending || setupMutation.isPending ? "جاري الدخول..." : isSetup ? "إنشاء حساب المدير" : "دخول"}</Text></Pressable></View><Text style={styles.footer}>حسابات الشركة خاصة بالاستاف فقط</Text></KeyboardAvoidingView></ScreenContainer>;
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 }, brandMark: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#0F766E", alignItems: "center", justifyContent: "center" }, brandMarkText: { color: "#FFFFFF", fontSize: 32, fontWeight: "800" }, brand: { color: "#0F172A", fontSize: 34, fontWeight: "900", marginTop: 12 }, tagline: { color: "#64748B", fontSize: 13, marginTop: 4 }, card: { width: "100%", maxWidth: 420, backgroundColor: "#FFFFFF", borderRadius: 24, padding: 22, marginTop: 28, borderWidth: 1, borderColor: "#E2E8F0" }, title: { color: "#0F172A", fontSize: 22, fontWeight: "800", textAlign: "right" }, subtitle: { color: "#64748B", fontSize: 12, lineHeight: 19, textAlign: "right", marginTop: 7, marginBottom: 12 }, label: { color: "#334155", fontSize: 12, fontWeight: "700", textAlign: "right", marginTop: 11, marginBottom: 6 }, input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, color: "#0F172A", fontSize: 14 }, button: { backgroundColor: "#0E7490", borderRadius: 14, alignItems: "center", paddingVertical: 14, marginTop: 20 }, buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 }, footer: { color: "#94A3B8", fontSize: 11, marginTop: 18 }, });
