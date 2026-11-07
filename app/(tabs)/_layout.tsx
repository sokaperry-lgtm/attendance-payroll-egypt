import { useEffect } from "react";
import { Tabs, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, useWindowDimensions, View, Pressable, Text } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { AppDataProvider, useAppData } from "@/lib/app-data";
import { trpc } from "@/lib/trpc";

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
  const notificationCount = trpc.notifications.unreadCount.useQuery(undefined, { refetchInterval: 30000 }).data ?? 0;
  const router = useRouter();
  const isDesktopWeb = Platform.OS === "web" && width >= 900;
  const bottomPadding = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  useEffect(() => {
    if (Platform.OS === "web" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/service-worker.js")
        .then((registration) => registration.update())
        .catch(() => undefined);
    }
  }, []);

  const manager = role === "owner" || role === "manager";
  const teamAccess = ["owner", "manager", "hr", "supervisor"].includes(role);
  const payrollAccess = ["owner", "manager", "hr", "accountant"].includes(role);
  const employeeManagement = ["owner", "manager", "hr"].includes(role);
  const mobile = Platform.OS !== "web" || width < 900;
  const mobilePrimary = new Set(["index", "attendance", "requests", "schedule", "more"]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          // React Navigation's side position is mirrored by the document RTL direction on web.
          // "left" here places the desktop navigation rail on the physical right edge.
          tabBarPosition: isDesktopWeb ? "left" : "bottom",
          tabBarVariant: isDesktopWeb ? "material" : "uikit",
          tabBarLabelPosition: isDesktopWeb ? "beside-icon" : "below-icon",
          tabBarActiveTintColor: "#75282E",
          tabBarInactiveTintColor: "#806F68",
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarLabelStyle: {
            fontFamily: "System",
            fontSize: isDesktopWeb ? 13 : 10,
            fontWeight: isDesktopWeb ? "700" : "700",
            marginTop: isDesktopWeb ? 2 : 1,
          },
          tabBarItemStyle: isDesktopWeb
            ? {
                borderRadius: 14,
                marginVertical: 5,
                paddingHorizontal: 12,
                backgroundColor: "#FFF8E7",
              }
            : {
                minHeight: 52,
                borderRadius: 16,
                marginHorizontal: 2,
                marginVertical: 4,
                paddingVertical: 2,
                backgroundColor: "#FFF8E7",
              },
          tabBarIconStyle: {
            marginBottom: isDesktopWeb ? 0 : 1,
          },
          tabBarStyle: isDesktopWeb
            ? {
                width: 276,
                backgroundColor: "#FFF8E7",
                borderRightColor: "#E9DED0",
                borderRightWidth: 1,
                paddingVertical: 28,
                paddingHorizontal: 18,
                borderTopWidth: 0,
                borderBottomWidth: 0,
              }
            : {
                paddingTop: 5,
                paddingBottom: bottomPadding,
                height: tabBarHeight,
                backgroundColor: "#FFF8E7",
                borderTopWidth: 0,
                shadowColor: "#332A26",
                shadowOpacity: 0.08,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: -4 },
                elevation: 12,
              },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "الرئيسية", href: mobile && !mobilePrimary.has("index") ? null : "/", tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} /> }} />
        <Tabs.Screen name="self-service" options={{ title: "ملفي", href: mobile ? null : (role === "employee" ? "/self-service" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.fill" color={color} /> }} />
        <Tabs.Screen name="notifications" options={{ title: "الإشعارات", tabBarBadge: notificationCount > 0 ? (notificationCount > 99 ? "99+" : notificationCount) : undefined, tabBarBadgeStyle: { backgroundColor: "#75282E", color: "#FFF8E7", fontSize: 9, fontWeight: "800" }, href: mobile && !mobilePrimary.has("notifications") ? null : "/notifications", tabBarIcon: ({ color }) => <IconSymbol size={23} name="notifications" color={color} /> }} />
        <Tabs.Screen name="hr-tools" options={{ title: "HR Tools", href: mobile ? null : (employeeManagement ? "/hr-tools" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="attendance" options={{ title: "الحضور", href: mobile && !mobilePrimary.has("attendance") ? null : "/attendance", tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="requests" options={{ title: "الطلبات", href: mobile && !mobilePrimary.has("requests") ? null : "/requests", tabBarIcon: ({ color }) => <IconSymbol size={23} name="doc.text.fill" color={color} /> }} />
        <Tabs.Screen name="schedule" options={{ title: "الجدول", href: mobile ? ((teamAccess || role === "employee") && mobilePrimary.has("schedule") ? "/schedule" : null) : (teamAccess || role === "employee" ? "/schedule" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="calendar" color={color} /> }} />
        <Tabs.Screen name="more" options={{ title: "المزيد •••", href: mobile ? "/more" : null, tabBarIcon: ({ color }) => <IconSymbol size={23} name="ellipsis.circle" color={color} /> }} />
        <Tabs.Screen name="reports" options={{ title: "التقارير", href: mobile ? null : (teamAccess ? "/reports" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="chart.bar.fill" color={color} /> }} />
        <Tabs.Screen name="audit" options={{ title: "سجل العمليات", href: null, tabBarIcon: ({ color }) => <IconSymbol name="lock.shield.fill" size={23} color={color} /> }} />
        <Tabs.Screen name="payroll" options={{ title: "الرواتب", href: mobile ? null : (payrollAccess ? "/payroll" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="banknote" color={color} /> }} />
        <Tabs.Screen name="employees" options={{ title: "الموظفون", href: mobile ? null : (employeeManagement ? "/employees" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: "الإعدادات", href: mobile ? null : (manager ? "/settings" : null), tabBarIcon: ({ color }) => <IconSymbol size={23} name="settings" color={color} /> }} />
        <Tabs.Screen name="logout" options={{ title: "تسجيل الخروج", href: mobile ? null : "/logout", tabBarIcon: ({ color }) => <IconSymbol size={23} name="logout" color={color} /> }} />
      </Tabs>
      {isDesktopWeb && (
        <Pressable
          onPress={() => router.replace("/")}
          accessibilityLabel="العودة للرئيسية"
          style={({ pressed }) => ({
            position: "absolute",
            top: 12,
            right: 14,
            zIndex: 100,
            minWidth: 92,
            height: 42,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: "#FFF8E7",
            borderWidth: 1,
            borderColor: "#E9DED0",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            shadowColor: "#332A26",
            shadowOpacity: 0.09,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
            opacity: pressed ? 0.72 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          })}
        >
          <IconSymbol name="house.fill" size={17} color="#75282E" />
          <View>
            <Text style={{ color: "#75282E", fontSize: 10, fontWeight: "900" }}>الرئيسية</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}
