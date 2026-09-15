import { useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { PAYROLL_RULES } from "@/lib/payroll";

function distanceBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function currentTime() {
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

function lateMinutesFromNow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(9, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000) - PAYROLL_RULES.graceMinutes);
}

export default function HomeScreen() {
  const { employee, branch, shift, payroll, payrollInputs, records, checkedIn, todayRecord, checkIn, checkOut, role, setRole } = useAppData();
  const [working, setWorking] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("جاهز للتحقق من موقعك");
  const isCheckedOut = Boolean(todayRecord?.checkOut);
  const presentDays = records.filter((record) => record.status === "حاضر" || record.status === "متأخر").length;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);

  async function handleCheckIn() {
    setWorking(true);
    try {
      let distanceMeters = 120;
      let isPreview = Platform.OS === "web";
      if (!isPreview) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") throw new Error("لا يمكن تسجيل الحضور بدون السماح بالوصول إلى الموقع.");
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) throw new Error("فعّل خدمة الموقع في الهاتف ثم حاول مرة أخرى.");
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        distanceMeters = distanceBetween(branch.latitude, branch.longitude, position.coords.latitude, position.coords.longitude);
      }
      if (distanceMeters > branch.radiusMeters) throw new Error(`أنت خارج نطاق الفرع بـ ${distanceMeters} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      const lateMinutes = lateMinutesFromNow();
      checkIn({ time: currentTime(), distanceMeters, status: lateMinutes > 0 ? "متأخر" : "حاضر", lateMinutes });
      setGpsMessage(isPreview ? "وضع المعاينة: تم التحقق بنجاح" : `تم التحقق من الموقع — ${distanceMeters} متر من الفرع`);
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر التحقق من الموقع";
      setGpsMessage(message);
      Alert.alert("لم يتم تسجيل الحضور", message);
    } finally {
      setWorking(false);
    }
  }

  async function handleCheckOut() {
    setWorking(true);
    checkOut(currentTime());
    setGpsMessage("تم تسجيل الانصراف بنجاح");
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWorking(false);
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{dateLabel}</Text>
            <Text style={styles.title}>صباح الخير، {employee.name.split(" ")[0]}</Text>
            <Text style={styles.subtitle}>{employee.title} · {employee.department}</Text>
          </View>
          <Pressable onPress={() => setRole(role === "employee" ? "manager" : "employee")} style={styles.avatar}>
            <Text style={styles.avatarText}>{employee.initials}</Text>
          </Pressable>
        </View>

        <View style={styles.shiftCard}>
          <View style={styles.shiftTop}>
            <View style={styles.iconBubble}><IconSymbol name="clock" size={20} color="#0E7490" /></View>
            <View style={styles.flex}>
              <Text style={styles.cardLabel}>وردية اليوم</Text>
              <Text style={styles.cardTitle}>{shift.name}</Text>
            </View>
            <View style={styles.shiftTime}><Text style={styles.timeText}>{shift.start}</Text><Text style={styles.timeDash}>—</Text><Text style={styles.timeText}>{shift.end}</Text></View>
          </View>
          <View style={styles.shiftMeta}><Text style={styles.metaText}>فترة السماح {PAYROLL_RULES.graceMinutes} دقيقة</Text><Text style={styles.metaText}>•</Text><Text style={styles.metaText}>الفرع الرئيسي</Text></View>
        </View>

        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>تسجيل اليوم</Text><Text style={styles.liveDot}>● مباشر</Text></View>
        <View style={styles.attendanceCard}>
          <View style={styles.attendanceStatus}>
            <View style={[styles.statusDot, { backgroundColor: isCheckedOut ? "#64748B" : checkedIn ? "#10B981" : "#F59E0B" }]} />
            <Text style={styles.statusText}>{isCheckedOut ? "تم الانتهاء" : checkedIn ? "أنت داخل العمل" : "لم تسجل حضورك بعد"}</Text>
          </View>
          <Text style={styles.gpsText}>{gpsMessage}</Text>
          <Pressable disabled={working || isCheckedOut} onPress={checkedIn ? handleCheckOut : handleCheckIn} style={({ pressed }) => [styles.primaryButton, (working || isCheckedOut) && styles.disabledButton, pressed && styles.pressed]}>
            <IconSymbol name={checkedIn ? "logout" : "location"} size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{working ? "جاري التحقق..." : isCheckedOut ? "تم تسجيل اليوم" : checkedIn ? "تسجيل الانصراف" : "تسجيل الحضور"}</Text>
          </Pressable>
          <Text style={styles.securityNote}>يُسمح بالتسجيل داخل نطاق {branch.radiusMeters} متر من {branch.name}</Text>
        </View>

        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>ملخص الشهر</Text><Text style={styles.linkText}>سبتمبر 2026</Text></View>
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{payroll.net.toLocaleString("ar-EG")}</Text><Text style={styles.metricLabel}>صافي المتوقع</Text><Text style={styles.metricUnit}>ج.م</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{presentDays}</Text><Text style={styles.metricLabel}>أيام العمل</Text><Text style={styles.metricUnit}>من 26</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricValue}>{payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}</Text><Text style={styles.metricLabel}>دقيقة تأخير</Text><Text style={styles.metricUnit}>بعد السماح</Text></View>
        </View>
        <View style={styles.notice}><IconSymbol name="wallet" size={20} color="#B45309" /><Text style={styles.noticeText}>الحساب مبدئي حتى اعتماد المرتب من المدير آخر الشهر.</Text></View>
        {Platform.OS === "web" && <View style={styles.installCard}><IconSymbol name="plus" size={20} color="#0E7490" /><View style={styles.installCopy}><Text style={styles.installTitle}>ثبّت حاضر على الآيفون</Text><Text style={styles.installText}>من Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» ليظهر كتطبيق.</Text></View></View>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 18 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  flex: { flex: 1 },
  eyebrow: { color: "#64748B", fontSize: 13, marginBottom: 6, textAlign: "right" },
  title: { color: "#0F172A", fontSize: 26, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#64748B", fontSize: 13, marginTop: 5, textAlign: "right" },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#0E7490", alignItems: "center", justifyContent: "center", marginLeft: 12 },
  avatarText: { color: "white", fontWeight: "800", fontSize: 17 },
  shiftCard: { backgroundColor: "#0F766E", borderRadius: 22, padding: 18, shadowColor: "#0F766E", shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 5 },
  shiftTop: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  iconBubble: { width: 42, height: 42, backgroundColor: "#CCFBF1", borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardLabel: { color: "#CCFBF1", fontSize: 12, textAlign: "right" },
  cardTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "700", marginTop: 2, textAlign: "right" },
  shiftTime: { flexDirection: "row", alignItems: "center", gap: 5 },
  timeText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  timeDash: { color: "#99F6E4" },
  shiftMeta: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", marginTop: 15, paddingTop: 12, flexDirection: "row-reverse", gap: 8 },
  metaText: { color: "#CCFBF1", fontSize: 12 },
  sectionHeading: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", textAlign: "right" },
  liveDot: { color: "#059669", fontSize: 12, fontWeight: "700" },
  attendanceCard: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 18, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  attendanceStatus: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { color: "#334155", fontSize: 15, fontWeight: "700", textAlign: "right" },
  gpsText: { color: "#64748B", fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: "right" },
  primaryButton: { minHeight: 52, borderRadius: 16, backgroundColor: "#0E7490", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 15 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  disabledButton: { backgroundColor: "#94A3B8" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  securityNote: { color: "#94A3B8", fontSize: 11, textAlign: "center", marginTop: 12 },
  linkText: { color: "#0E7490", fontSize: 12, fontWeight: "700" },
  metricsRow: { flexDirection: "row-reverse", gap: 10 },
  metricCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", minHeight: 102 },
  metricValue: { color: "#0F172A", fontSize: 20, fontWeight: "800", textAlign: "right" },
  metricLabel: { color: "#64748B", fontSize: 11, marginTop: 8, textAlign: "right" },
  metricUnit: { color: "#94A3B8", fontSize: 10, marginTop: 2, textAlign: "right" },
  notice: { backgroundColor: "#FFFBEB", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  noticeText: { color: "#92400E", fontSize: 12, flex: 1, lineHeight: 18, textAlign: "right" },
  installCard: { backgroundColor: "#F0FDFA", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#99F6E4" },
  installCopy: { flex: 1 },
  installTitle: { color: "#115E59", fontSize: 12, fontWeight: "800", textAlign: "right" },
  installText: { color: "#0F766E", fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: "right" },
});
