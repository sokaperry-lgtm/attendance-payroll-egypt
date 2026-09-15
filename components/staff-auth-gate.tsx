import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { trpc } from "@/lib/trpc";

export function StaffAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const isLoginRoute = pathname === "/login";

  useEffect(() => {
    if (meQuery.isLoading) return;
    if (!meQuery.data && !isLoginRoute) router.replace("/login" as never);
    if (meQuery.data && isLoginRoute) router.replace("/(tabs)");
  }, [isLoginRoute, meQuery.data, meQuery.isLoading, router]);

  if (!meQuery.data && !isLoginRoute) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}><ActivityIndicator color="#0E7490" /><Text style={{ color: "#64748B", marginTop: 10 }}>جاري التحقق من الحساب...</Text></View>;
  return <>{children}</>;
}
