import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as Auth from "@/lib/_core/auth";

export default function LogoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    (async () => {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      queryClient.clear();
      if (active) router.replace("/login" as never);
    })();
    return () => { active = false; };
  }, [queryClient, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
      <ActivityIndicator color="#163A63" />
      <Text style={{ marginTop: 12, color: "#667085", fontWeight: "700" }}>جاري تسجيل الخروج...</Text>
    </View>
  );
}
