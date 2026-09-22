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
  const mobile = Platform.OS !== "web" || width < 900;
  const mobilePrimary = new Set(["index", "attendance", "requests", "notifications", ...(manager ? ["manager"] : [])]);

  return (
      <Tabs
        screenOptions={{
          tabBarPosition: isDesktopWeb ? "right" : "bottom",
          tabBarVariant: isDesktopWeb ? "material" : "uikit",
          tabBarLabelPosition: isDesktopWeb ? "beside-icon" : "below-icon",
          tabBarActiveTintColor: "#163A63",
          tabBarInactiveTintColor: "#667085",
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
                marginVertical: 5,
                paddingHorizontal: 12,
                backgroundColor: "#FFFFFF",
              }
            : {
                borderRadius: 14,
                marginHorizontal: 2,
                backgroundColor: "#FFFFFF",
              },
          tabBarIconStyle: {
            marginBottom: isDesktopWeb ? 0 : 1,
          },
          tabBarStyle: isDesktopWeb
            ? {
                width: 276,
                backgroundColor: "#FFFFFF",
                borderLeftColor: "#E4E7EC",
                borderLeftWidth: 1,
                paddingVertical: 28,
                paddingHorizontal: 18,
                borderTopWidth: 0,
                borderBottomWidth: 0,
              }
            : {
                paddingTop: 7,
                paddingBottom: bottomPadding,
                height: tabBarHeight,
                backgroundColor: "#FFFFFF",
                borderTopColor: "#E4E7EC",
                borderTopWidth: 0.5,
              },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "الرئيسية", href: mobile && !mobilePrimary.has("index") ? null : "/", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
        <Tabs.Screen name="self-service" options={{ title: "ملفي", href: role === "employee" ? "/self-service" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.fill" color={color} /> }} />
        <Tabs.Screen name="notifications" options={{ title: "الإشعارات", href: mobile && !mobilePrimary.has("notifications") ? null : "/notifications", tabBarIcon: ({ color }) => <IconSymbol size={23} name="notifications" color={color} /> }} />
        <Tabs.Screen name="hr-tools" options={{ title: "HR Tools", href: mobile ? null : (manager ? "/hr-tools" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="attendance" options={{ title: "الحضور", href: mobile && !mobilePrimary.has("attendance") ? null : "/attendance", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="requests" options={{ title: "الطلبات", href: mobile && !mobilePrimary.has("requests") ? null : "/requests", tabBarIcon: ({ color }) => <IconSymbol size={23} name="doc.text.fill" color={color} /> }} />
        <Tabs.Screen name="schedule" options={{ title: "الجدول", href: mobile ? null : (teamAccess ? "/schedule" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="manager" options={{ title: "لوحة القيادة", href: teamAccess ? "/manager" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="reports" options={{ title: "التقارير", href: mobile ? null : (teamAccess ? "/reports" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="chart.bar.fill" color={color} /> }} />
        <Tabs.Screen name="audit" options={{ title: "سجل العمليات", href: mobile ? null : (manager ? "/audit" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="lock.shield.fill" color={color} /> }} />
        <Tabs.Screen name="payroll" options={{ title: "الرواتب", href: mobile ? null : (manager ? "/payroll" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="employees" options={{ title: "الموظفون", href: mobile ? null : (manager ? "/employees" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "الإعدادات", href: mobile ? null : (manager ? "/settings" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="settings" color={color} /> }} />
        <Tabs.Screen name="logout" options={{ title: "تسجيل الخروج", href: mobile ? null : "/logout", tabBarIcon: ({ color }) => <IconSymbol size={23} name="logout" color={color} /> }} />
      </Tabs>
  );
}
