import { useEffect } from "react";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, useWindowDimensions } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { AppDataProvider, useAppData } from "@/lib/app-data";

export default function TabLayout() {
  return (
    <AppDataProvider>
      <RoleAwareTabs />
    </AppDataProvider>
  );
}

function RoleAwareTabs() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { role } = useAppData();
  const isDesktopWeb = Platform.OS === "web" && width >= 900;

  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  useEffect(() => {
    if (Platform.OS === "web" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => registration.update())
        .catch(() => undefined);
    }
  }, []);

  const manager = role === "manager";
  const teamAccess = role === "manager" || role === "supervisor";

  return (
      <Tabs
        screenOptions={{
          tabBarPosition: isDesktopWeb ? "right" : "bottom",
          tabBarVariant: isDesktopWeb ? "material" : "uikit",
          tabBarLabelPosition: isDesktopWeb ? "beside-icon" : "below-icon",
          tabBarActiveTintColor: isDesktopWeb ? "#55786D" : colors.primary,
          tabBarInactiveTintColor: isDesktopWeb ? "#7B817E" : colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarLabelStyle: {
            fontFamily: "System",
            fontSize: isDesktopWeb ? 13 : 11,
            fontWeight: isDesktopWeb ? "700" : "500",
            marginTop: 2,
          },
          tabBarItemStyle: isDesktopWeb
            ? {
                borderRadius: 14,
                marginVertical: 4,
                paddingHorizontal: 10,
              }
            : {
                borderRadius: 14,
                marginHorizontal: 2,
              },
          tabBarIconStyle: {
            marginBottom: isDesktopWeb ? 0 : 1,
          },
          tabBarStyle: isDesktopWeb
            ? {
                width: 252,
                backgroundColor: "#FFFCF7",
                borderLeftColor: "#E7E2D9",
                borderLeftWidth: 1,
                paddingVertical: 22,
                paddingHorizontal: 14,
                borderTopWidth: 0,
                borderBottomWidth: 0,
              }
            : {
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
        <Tabs.Screen name="notifications" options={{ title: "الإشعارات", tabBarIcon: ({ color }) => <IconSymbol size={23} name="notifications" color={color} /> }} />
        <Tabs.Screen name="hr-tools" options={{ title: "HR Tools", href: manager ? "/hr-tools" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="attendance" options={{ title: "الحضور", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="requests" options={{ title: "الطلبات", tabBarIcon: ({ color }) => <IconSymbol size={23} name="doc.text.fill" color={color} /> }} />
        <Tabs.Screen name="schedule" options={{ title: "الجدول", href: teamAccess ? "/schedule" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="manager" options={{ title: "الفريق", href: teamAccess ? "/manager" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="reports" options={{ title: "التقارير", href: teamAccess ? "/reports" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="chart.bar.fill" color={color} /> }} />
        <Tabs.Screen name="payroll" options={{ title: "الرواتب", href: manager ? "/payroll" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="employees" options={{ title: "الموظفون", href: manager ? "/employees" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "الإعدادات", href: "/settings", tabBarIcon: ({ color }) => <IconSymbol size={23} name="settings" color={color} /> }} />
      </Tabs>
  );
}
