import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";

export function StaffAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const isLoginRoute = pathname === "/login";
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (meQuery.isLoading || redirectingRef.current) return;

    if (!meQuery.data && !isLoginRoute) {
      redirectingRef.current = true;
      void Auth.removeSessionToken().finally(() => {
        router.replace("/login" as never);
      });
      return;
    }

    if (meQuery.data && isLoginRoute) {
      redirectingRef.current = true;
      router.replace("/(tabs)");
    }
  }, [isLoginRoute, meQuery.data, meQuery.isLoading, router]);

  if (!meQuery.data && !isLoginRoute) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#10161F" }}>
        <ActivityIndicator color="#5B9BFF" />
        <Text style={{ color: "#97A3B6", marginTop: 10 }}>جاري التحقق من الحساب...</Text>
      </View>
    );
  }

  return <>{children}</>;
}
