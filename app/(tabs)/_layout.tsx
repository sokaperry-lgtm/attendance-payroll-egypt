import { useEffect } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { AppDataProvider } from "@/lib/app-data";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  useEffect(() => {
    if (Platform.OS === "web" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").then((registration) => registration.update()).catch(() => undefined);
    }
  }, []);

  return (
    <AppDataProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarLabelStyle: { fontFamily: "System", fontSize: 11, marginTop: 2 },
          tabBarStyle: {
            paddingTop: 7,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
        <Tabs.Screen name="attendance" options={{ title: "السجل", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="schedule" options={{ title: "الجدول", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="requests" options={{ title: "الطلبات", tabBarIcon: ({ color }) => <IconSymbol size={23} name="doc.text.fill" color={color} /> }} />
        <Tabs.Screen name="manager" options={{ title: "المدير", tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
      </Tabs>
    </AppDataProvider>
  );
}
