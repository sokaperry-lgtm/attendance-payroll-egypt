import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { showAlert } from "@/lib/alert";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { PAYROLL_RULES } from "@/lib/payroll";
import { calculateLateMinutes } from "@/lib/shift-utils";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import * as Auth from "@/lib/_core/auth";

function distanceBetween(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function currentTime() {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

type Coordinates = { latitude: number; longitude: number };

function getBrowserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("يجب السماح بالوصول إلى الموقع لتسجيل الحضور."));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("تعذر تحديد موقعك الحالي."));
        } else {
          reject(new Error("انتهت مهلة تحديد الموقع."));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

async function getCurrentCoordinates(): Promise<Coordinates> {
  if (Platform.OS === "web") return getBrowserLocation();
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("يجب السماح بالوصول إلى الموقع لتسجيل الحضور.");
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error("فعّل خدمة الموقع في الهاتف ثم حاول مرة أخرى.");
  }
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

const weeklyAttendance = [
  { day: "السبت", value: 86 },
  { day: "الأحد", value: 94 },
  { day: "الإثنين", value: 78 },
  { day: "الثلاثاء", value: 91 },
  { day: "الأربعاء", value: 88 },
  { day: "الخميس", value: 96 },
  { day: "الجمعة", value: 70 },
];

export default function HomeScreen() {
  const {
    employee,
    branch,
    shift,
    payroll,
    payrollInputs,
    records,
    checkedIn,
    todayRecord,
    checkIn,
    checkOut,
  } = useAppData();

  const router = useRouter();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [working, setWorking] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("جاهز للتحقق من موقعك");

  const isCheckedOut = Boolean(todayRecord?.checkOut);
  const isWeeklyOff = shift.kind === "weekly_off";
  const presentDays = records.filter(
    (record) => record.status === "حاضر" || record.status === "متأخر",
  ).length;

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ar-EG", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(new Date()),
    [],
  );

  async function handleCheckIn() {
    if (isWeeklyOff) return;
    setWorking(true);
    try {
      const coordinates = await getCurrentCoordinates();
      const distanceMeters = distanceBetween(
        branch.latitude,
        branch.longitude,
        coordinates.latitude,
        coordinates.longitude,
      );
      if (distanceMeters > branch.radiusMeters) {
        throw new Error(
          `أنت خارج نطاق الفرع بـ ${distanceMeters} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`,
        );
      }
      const lateMinutes = calculateLateMinutes(
        new Date(),
        shift.start,
        PAYROLL_RULES.graceMinutes,
      );
      await checkIn({
        time: currentTime(),
        distanceMeters,
        status: lateMinutes > 0 ? "متأخر" : "حاضر",
        lateMinutes,
      });
      setGpsMessage(
        `تم التحقق من الموقع — أنت على بعد ${distanceMeters} متر من الفرع`,
      );
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "تعذر التحقق من الموقع";
      setGpsMessage(message);
      showAlert("لم يتم تسجيل الحضور", message);
    } finally {
      setWorking(false);
    }
  }

  async function handleCheckOut() {
    setWorking(true);
    try {
      await checkOut(currentTime());
      setGpsMessage("تم تسجيل الانصراف بنجاح");
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
    } catch (error) {
      showAlert(
        "تعذر تسجيل الانصراف",
        error instanceof Error ? error.message : "حدث خطأ غير متوقع.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{dateLabel}</Text>
            <Text style={styles.title}>صباح الخير، {employee.name.split(" ")[0]}</Text>
            <Text style={styles.subtitle}>{employee.title} · {employee.department}</Text>
          </View>
          <Pressable
            onPress={async () => {
              await logoutMutation.mutateAsync();
              await Auth.removeSessionToken();
              await Auth.clearUserInfo();
              router.replace("/login" as never);
            }}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{employee.initials}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <IconSymbol name={isWeeklyOff ? "calendar" : "clock"} size={22} color="#2563EB" />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>وردية اليوم</Text>
              <Text style={styles.heroTitle}>{shift.name}</Text>
              <Text style={styles.heroMeta}>
                {isWeeklyOff ? "إجازة أسبوعية مدفوعة" : `${shift.start} — ${shift.end} · الفرع الرئيسي`}
              </Text>
            </View>
            <View style={styles.heroTime}>
              <Text style={styles.heroTimeLabel}>اليوم</Text>
              <Text style={styles.heroTimeValue}>{isWeeklyOff ? "OFF" : shift.start}</Text>
            </View>
          </View>
          <View style={styles.heroFooter}>
            <View>
              <Text style={styles.heroFooterLabel}>نسبة الحضور هذا الشهر</Text>
              <Text style={styles.heroFooterValue}>92%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: "92%" }]} />
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>نظرة سريعة</Text>
            <Text style={styles.sectionSub}>ملخص أدائك خلال سبتمبر</Text>
          </View>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>مباشر</Text></View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#ECFDF5" }]}><IconSymbol name="checkmark" size={17} color="#059669" /></View>
            <Text style={styles.kpiValue}>{presentDays}</Text>
            <Text style={styles.kpiLabel}>أيام الحضور</Text>
            <Text style={styles.kpiTrend}>↑ 4.2% عن الشهر السابق</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#EFF6FF" }]}><IconSymbol name="clock" size={17} color="#2563EB" /></View>
            <Text style={styles.kpiValue}>{payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}</Text>
            <Text style={styles.kpiLabel}>دقيقة تأخير</Text>
            <Text style={styles.kpiTrendNeutral}>ضمن المعدل الطبيعي</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#FFF7ED" }]}><IconSymbol name="wallet" size={17} color="#EA580C" /></View>
            <Text style={styles.kpiValue}>{payroll.net.toLocaleString("ar-EG")}</Text>
            <Text style={styles.kpiLabel}>صافي المرتب المتوقع</Text>
            <Text style={styles.kpiUnit}>ج.م</Text>
          </View>
        </View>

        <View style={styles.analyticsRow}>
          <View style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <View><Text style={styles.cardTitle}>أداء الحضور</Text><Text style={styles.cardSubtitle}>معدل الالتزام خلال آخر 7 أيام</Text></View>
              <View style={styles.periodPill}><Text style={styles.periodText}>هذا الأسبوع</Text><IconSymbol name="chevron.down" size={14} color="#64748B" /></View>
            </View>
            <View style={styles.chartArea}>
              <View style={styles.gridLine} /><View style={[styles.gridLine, { top: "33%" }]} /><View style={[styles.gridLine, { top: "66%" }]} />
              <View style={styles.bars}>
                {weeklyAttendance.map((item) => (
                  <View key={item.day} style={styles.barColumn}>
                    <View style={styles.barTrack}><View style={[styles.bar, { height: `${item.value}%` }]} /></View>
                    <Text style={styles.barValue}>{item.value}</Text>
                    <Text style={styles.barLabel}>{item.day.slice(0, 2)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.statusCard}>
            <View style={styles.cardHeader}>
              <View><Text style={styles.cardTitle}>حالة الشهر</Text><Text style={styles.cardSubtitle}>حتى اليوم</Text></View>
              <IconSymbol name="chart.bar" size={19} color="#64748B" />
            </View>
            <View style={styles.donutWrap}>
              <View style={styles.donutOuter}><View style={styles.donutInner}><Text style={styles.donutValue}>92%</Text><Text style={styles.donutLabel}>حضور</Text></View></View>
            </View>
            <View style={styles.statusRows}>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#10B981" }]} /><Text style={styles.statusName}>حاضر</Text><Text style={styles.statusPercent}>92%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#F59E0B" }]} /><Text style={styles.statusName}>متأخر</Text><Text style={styles.statusPercent}>5%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#E2E8F0" }]} /><Text style={styles.statusName}>غياب</Text><Text style={styles.statusPercent}>3%</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionTitle}>تسجيل اليوم</Text><Text style={styles.sectionSub}>تحقق آمن من موقع الفرع</Text></View>
        </View>

        <View style={styles.attendanceCard}>
          <View style={styles.attendanceTop}>
            <View style={[styles.statusPill, { backgroundColor: isCheckedOut ? "#F1F5F9" : checkedIn ? "#ECFDF5" : "#FFF7ED" }]}>
              <View style={[styles.statusDotSmall, { backgroundColor: isCheckedOut ? "#64748B" : checkedIn ? "#10B981" : "#F59E0B" }]} />
              <Text style={[styles.statusPillText, { color: isCheckedOut ? "#475569" : checkedIn ? "#047857" : "#B45309" }]}>
                {isCheckedOut ? "تم الانتهاء" : checkedIn ? "أنت داخل العمل" : "لم تسجل حضورك بعد"}
              </Text>
            </View>
            <Text style={styles.gpsText}>{gpsMessage}</Text>
          </View>
          <Pressable
            disabled={working || isCheckedOut || isWeeklyOff}
            onPress={checkedIn ? handleCheckOut : handleCheckIn}
            style={({ pressed }) => [styles.primaryButton, (working || isCheckedOut || isWeeklyOff) && styles.disabledButton, pressed && styles.pressed]}
          >
            <IconSymbol name={isWeeklyOff ? "checkmark" : checkedIn ? "logout" : "location"} size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>
              {isWeeklyOff ? "إجازة أسبوعية مدفوعة" : working ? "جاري التحقق..." : isCheckedOut ? "تم تسجيل اليوم" : checkedIn ? "تسجيل الانصراف" : "تسجيل الحضور"}
            </Text>
          </Pressable>
          <Text style={styles.securityNote}>
            {isWeeklyOff ? "لن يتم احتساب غياب أو تأخير في هذا اليوم" : `يُسمح بالتسجيل داخل نطاق ${branch.radiusMeters} متر من ${branch.name}`}
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionTitle}>الوصول السريع</Text><Text style={styles.sectionSub}>كل أدواتك في مكان واحد</Text></View>
        </View>
        <View style={styles.quickGrid}>
          {[
            { icon: "calendar", label: "سجل الحضور", route: "/attendance" },
            { icon: "clock", label: "الورديات", route: "/schedule" },
            { icon: "doc.text", label: "الطلبات", route: "/requests" },
            { icon: "chart.bar", label: "التقارير", route: "/reports" },
          ].map((item) => (
            <Pressable key={item.label} onPress={() => router.push(item.route as never)} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
              <View style={styles.quickIcon}><IconSymbol name={item.icon as never} size={19} color="#2563EB" /></View>
              <Text style={styles.quickLabel}>{item.label}</Text>
              <Text style={styles.quickArrow}>←</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.insight}>
          <View style={styles.insightIcon}><IconSymbol name="sparkles" size={19} color="#7C3AED" /></View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightTitle}>Insight ذكي</Text>
            <Text style={styles.insightText}>أداؤك في الحضور أعلى من المتوسط هذا الشهر. استمر بنفس الالتزام.</Text>
          </View>
          <View style={styles.insightBadge}><Text style={styles.insightBadgeText}>ممتاز</Text></View>
        </View>

        <View style={styles.notice}>
          <IconSymbol name="wallet" size={19} color="#B45309" />
          <Text style={styles.noticeText}>الحساب مبدئي حتى اعتماد المرتب من المدير آخر الشهر.</Text>
        </View>

        {Platform.OS === "web" && (
          <View style={styles.installCard}>
            <IconSymbol name="plus" size={20} color="#2563EB" />
            <View style={styles.installCopy}><Text style={styles.installTitle}>ثبّت حاضر على الآيفون</Text><Text style={styles.installText}>من Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» ليظهر كتطبيق.</Text></View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 50, gap: 18, maxWidth: 1180, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1 },
  eyebrow: { color: "#64748B", fontSize: 12, marginBottom: 5, textAlign: "right" },
  title: { color: "#0F172A", fontSize: 27, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#64748B", fontSize: 13, marginTop: 5, textAlign: "right" },
  avatar: { width: 50, height: 50, borderRadius: 17, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center", marginLeft: 14 },
  avatarText: { color: "#FFF", fontWeight: "800", fontSize: 16 },
  hero: { backgroundColor: "#0B1220", borderRadius: 28, padding: 24, overflow: "hidden", shadowColor: "#0F172A", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#1D4ED8", opacity: 0.35, top: -100, left: -50 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 13 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: "#93C5FD", fontSize: 11, textAlign: "right" },
  heroTitle: { color: "#FFF", fontSize: 25, fontWeight: "800", marginTop: 2, textAlign: "right" },
  heroMeta: { color: "#CBD5E1", fontSize: 12, marginTop: 4, textAlign: "right" },
  heroTime: { alignItems: "flex-end" },
  heroTimeLabel: { color: "#94A3B8", fontSize: 10 },
  heroTimeValue: { color: "#FFF", fontSize: 18, fontWeight: "800", marginTop: 2 },
  heroFooter: { marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.1)", flexDirection: "row-reverse", alignItems: "center", gap: 15 },
  heroFooterLabel: { color: "#94A3B8", fontSize: 10, textAlign: "right" },
  heroFooterValue: { color: "#FFF", fontSize: 20, fontWeight: "800", marginTop: 2, textAlign: "right" },
  progressTrack: { flex: 1, height: 7, backgroundColor: "#334155", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#60A5FA", borderRadius: 10 },
  sectionHeading: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  sectionTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800", textAlign: "right" },
  sectionSub: { color: "#94A3B8", fontSize: 11, marginTop: 3, textAlign: "right" },
  liveBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#ECFDF5", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  liveText: { color: "#047857", fontSize: 10, fontWeight: "800" },
  kpiGrid: { flexDirection: "row-reverse", gap: 10 },
  kpiCard: { flex: 1, backgroundColor: "#FFF", borderRadius: 20, padding: 17, minHeight: 140, borderWidth: 1, borderColor: "#E2E8F0", shadowColor: "#0F172A", shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  kpiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  kpiValue: { color: "#0F172A", fontSize: 21, fontWeight: "800", textAlign: "right" },
  kpiLabel: { color: "#64748B", fontSize: 11, marginTop: 3, textAlign: "right" },
  kpiTrend: { color: "#059669", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiTrendNeutral: { color: "#64748B", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiUnit: { color: "#94A3B8", fontSize: 9, marginTop: 9, textAlign: "right" },
  analyticsRow: { flexDirection: "row-reverse", gap: 12, flexWrap: "wrap" },
  chartCard: { flex: 1.65, minWidth: 330, backgroundColor: "#FFF", borderRadius: 20, padding: 17, borderWidth: 1, borderColor: "#E2E8F0" },
  statusCard: { flex: 1, minWidth: 270, backgroundColor: "#FFF", borderRadius: 20, padding: 17, borderWidth: 1, borderColor: "#E2E8F0" },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#0F172A", fontSize: 14, fontWeight: "800", textAlign: "right" },
  cardSubtitle: { color: "#94A3B8", fontSize: 10, marginTop: 3, textAlign: "right" },
  chartLegend: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2563EB" },
  legendText: { color: "#64748B", fontSize: 9 },
  chartArea: { height: 215, marginTop: 10, position: "relative" },
  chartLabels: { position: "absolute", left: 22, right: 22, bottom: 0, flexDirection: "row-reverse", justifyContent: "space-between" },
  chartLabel: { color: "#94A3B8", fontSize: 9 },
  periodPill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  periodText: { color: "#64748B", fontSize: 9 },
  donutWrap: { alignItems: "center", marginTop: 12 },
  donutOuter: { width: 120, height: 120, borderRadius: 60, borderWidth: 13, borderColor: "#10B981", alignItems: "center", justifyContent: "center" },
  donutInner: { alignItems: "center" },
  donutValue: { color: "#0F172A", fontSize: 21, fontWeight: "800" },
  donutLabel: { color: "#94A3B8", fontSize: 9, marginTop: 2 },
  statusRows: { gap: 8, marginTop: 10 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  statusColor: { width: 7, height: 7, borderRadius: 4 },
  statusName: { color: "#64748B", fontSize: 10, flex: 1, textAlign: "right" },
  statusPercent: { color: "#0F172A", fontSize: 10, fontWeight: "800" },
  attendanceCard: { backgroundColor: "#FFF", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#E2E8F0" },
  attendanceTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  statusPill: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  gpsText: { color: "#64748B", fontSize: 10, flex: 1, textAlign: "right" },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#2563EB", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 15 },
  primaryButtonText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  disabledButton: { backgroundColor: "#94A3B8" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  securityNote: { color: "#94A3B8", fontSize: 10, textAlign: "center", marginTop: 10 },
  quickGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  quickCard: { flex: 1, minWidth: 180, backgroundColor: "#FFF", borderRadius: 17, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  quickIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  quickLabel: { color: "#334155", fontSize: 12, fontWeight: "700", flex: 1, textAlign: "right" },
  quickArrow: { color: "#94A3B8", fontSize: 16 },
  insight: { backgroundColor: "#FAF5FF", borderRadius: 17, padding: 14, borderWidth: 1, borderColor: "#E9D5FF", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  insightIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#EDE9FE", alignItems: "center", justifyContent: "center" },
  insightCopy: { flex: 1 },
  insightTitle: { color: "#6D28D9", fontSize: 11, fontWeight: "800", textAlign: "right" },
  insightText: { color: "#6B21A8", fontSize: 10, lineHeight: 17, marginTop: 2, textAlign: "right" },
  insightBadge: { backgroundColor: "#7C3AED", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  insightBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  notice: { backgroundColor: "#FFFBEB", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  noticeText: { color: "#92400E", fontSize: 11, flex: 1, lineHeight: 17, textAlign: "right" },
  installCard: { backgroundColor: "#EFF6FF", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#BFDBFE" },
  installCopy: { flex: 1 },
  installTitle: { color: "#1E40AF", fontSize: 11, fontWeight: "800", textAlign: "right" },
  installText: { color: "#1D4ED8", fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: "right" },
});
