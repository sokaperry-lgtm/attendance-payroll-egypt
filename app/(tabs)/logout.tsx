import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

export default function LogoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    let active = true;
    (async () => {
      // Invalidate the server session while the current Bearer token is still available.
      // Local cleanup remains the fallback so logout cannot get stuck if the request fails.
      try {
        await logoutMutation.mutateAsync();
      } catch (error) {
        console.warn("[Auth] Server logout failed; continuing with local logout.", error);
      }
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      queryClient.clear();
      if (active) router.replace("/login" as never);
    })();
    return () => { active = false; };
  }, [logoutMutation, queryClient, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
      <ActivityIndicator color="#163A63" />
      <Text style={{ marginTop: 12, color: "#667085", fontWeight: "700" }}>جاري تسجيل الخروج...</Text>
    </View>
  );
}
