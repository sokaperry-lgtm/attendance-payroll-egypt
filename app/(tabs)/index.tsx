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
    role,
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
  const notificationsQuery = trpc.notifications.list.useQuery();
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
      const coordinates = await getCurrentCoordinates();
      const distanceMeters = distanceBetween(branch.latitude, branch.longitude, coordinates.latitude, coordinates.longitude);
      if (distanceMeters > branch.radiusMeters) throw new Error(`أنت خارج نطاق الفرع بـ ${distanceMeters} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      await checkOut({ time: currentTime(), distanceMeters });
      setGpsMessage(`تم تسجيل الانصراف — أنت على بعد ${distanceMeters} متر من الفرع`);
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
            <Text style={styles.title}>{role === "manager" ? "لوحة تشغيل الفريق" : `صباح الخير، ${employee.name.split(" ")[0]}`}</Text>
            <Text style={styles.subtitle}>{role === "manager" ? "تابع الحضور والطلبات والرواتب من مكان واحد" : `${employee.title} · ${employee.department}`}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={styles.notificationButton} onPress={() => router.push("/requests" as never)}>
              <IconSymbol name="notifications" size={21} color="#AAB4C4" />
              {(notificationsQuery.data ?? []).some((n) => !n.readAt) && <View style={styles.notificationDot} />}
            </Pressable>
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
        </View>

        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}>
              <IconSymbol name={isWeeklyOff ? "calendar" : "clock"} size={22} color="#5B9BFF" />
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
              <Text style={styles.sectionSub}>{role === "manager" ? "ملخص فريقك خلال سبتمبر" : "ملخص أدائك خلال سبتمبر"}</Text>
          </View>
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>مباشر</Text></View>
        </View>

        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#0F2A20" }]}><IconSymbol name="checkmark" size={17} color="#34D399" /></View>
            <Text style={styles.kpiValue}>{presentDays}</Text>
            <Text style={styles.kpiLabel}>أيام الحضور</Text>
            <Text style={styles.kpiTrend}>↑ 4.2% عن الشهر السابق</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#15243D" }]}><IconSymbol name="clock" size={17} color="#5B9BFF" /></View>
            <Text style={styles.kpiValue}>{payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}</Text>
            <Text style={styles.kpiLabel}>دقيقة تأخير</Text>
            <Text style={styles.kpiTrendNeutral}>ضمن المعدل الطبيعي</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#2B2010" }]}><IconSymbol name="wallet" size={17} color="#FB923C" /></View>
            <Text style={styles.kpiValue}>{payroll.net.toLocaleString("ar-EG")}</Text>
            <Text style={styles.kpiLabel}>صافي المرتب المتوقع</Text>
            <Text style={styles.kpiUnit}>ج.م</Text>
          </View>
        </View>

        <View style={styles.analyticsRow}>
          <View style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <View><Text style={styles.cardTitle}>أداء الحضور</Text><Text style={styles.cardSubtitle}>معدل الالتزام خلال آخر 7 أيام</Text></View>
              <View style={styles.periodPill}><Text style={styles.periodText}>هذا الأسبوع</Text><IconSymbol name="chevron.down" size={14} color="#97A3B6" /></View>
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
              <IconSymbol name="chart.bar" size={19} color="#97A3B6" />
            </View>
            <View style={styles.donutWrap}>
              <View style={styles.donutOuter}><View style={styles.donutInner}><Text style={styles.donutValue}>92%</Text><Text style={styles.donutLabel}>حضور</Text></View></View>
            </View>
            <View style={styles.statusRows}>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#10B981" }]} /><Text style={styles.statusName}>حاضر</Text><Text style={styles.statusPercent}>92%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#F59E0B" }]} /><Text style={styles.statusName}>متأخر</Text><Text style={styles.statusPercent}>5%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#1E2733" }]} /><Text style={styles.statusName}>غياب</Text><Text style={styles.statusPercent}>3%</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionTitle}>تسجيل اليوم</Text><Text style={styles.sectionSub}>تحقق آمن من موقع الفرع</Text></View>
        </View>

        <View style={styles.attendanceCard}>
          <View style={styles.attendanceTop}>
            <View style={[styles.statusPill, { backgroundColor: isCheckedOut ? "#1A212C" : checkedIn ? "#0F2A20" : "#2B2010" }]}>
              <View style={[styles.statusDotSmall, { backgroundColor: isCheckedOut ? "#97A3B6" : checkedIn ? "#34D399" : "#F59E0B" }]} />
              <Text style={[styles.statusPillText, { color: isCheckedOut ? "#8592A6" : checkedIn ? "#34D399" : "#FBBF24" }]}>
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
            <IconSymbol name={isWeeklyOff ? "checkmark" : checkedIn ? "logout" : "location"} size={20} color="#F5F7FA" />
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
          {(role === "manager" ? [
            { icon: "person.2.fill", label: "إدارة الفريق", route: "/manager" },
            { icon: "banknote", label: "مسير الرواتب", route: "/payroll" },
            { icon: "doc.text", label: "الطلبات المعلقة", route: "/requests" },
            { icon: "chart.bar", label: "التقارير", route: "/reports" },
          ] : [
            { icon: "calendar", label: "سجل الحضور", route: "/attendance" },
            { icon: "clock", label: "الورديات", route: "/schedule" },
            { icon: "doc.text", label: "الطلبات", route: "/requests" },
            { icon: "chart.bar", label: "التقارير", route: "/reports" },
          ]).map((item) => (
            <Pressable key={item.label} onPress={() => router.push(item.route as never)} style={({ pressed }) => [styles.quickCard, pressed && styles.pressed]}>
              <View style={styles.quickIcon}><IconSymbol name={item.icon as never} size={19} color="#5B9BFF" /></View>
              <Text style={styles.quickLabel}>{item.label}</Text>
              <Text style={styles.quickArrow}>←</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.insight}>
          <View style={styles.insightIcon}><IconSymbol name="sparkles" size={19} color="#A78BFA" /></View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightTitle}>Insight ذكي</Text>
            <Text style={styles.insightText}>أداؤك في الحضور أعلى من المتوسط هذا الشهر. استمر بنفس الالتزام.</Text>
          </View>
          <View style={styles.insightBadge}><Text style={styles.insightBadgeText}>ممتاز</Text></View>
        </View>

        <View style={styles.notice}>
          <IconSymbol name="wallet" size={19} color="#FBBF24" />
          <Text style={styles.noticeText}>الحساب مبدئي حتى اعتماد المرتب من المدير آخر الشهر.</Text>
        </View>

        {Platform.OS === "web" && (
          <View style={styles.installCard}>
            <IconSymbol name="plus" size={20} color="#5B9BFF" />
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 14 },
  notificationButton: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#131A24", borderWidth: 1, borderColor: "#232C3A", alignItems: "center", justifyContent: "center", position: "relative" },
  notificationDot: { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444", top: 9, right: 9, borderWidth: 2, borderColor: "#F5F7FA" },
  eyebrow: { color: "#97A3B6", fontSize: 12, marginBottom: 5, textAlign: "right" },
  title: { color: "#EEF2F8", fontSize: 27, fontWeight: "800", textAlign: "right" },
  subtitle: { color: "#97A3B6", fontSize: 13, marginTop: 5, textAlign: "right" },
  avatar: { width: 50, height: 50, borderRadius: 17, backgroundColor: "#2E5FD9", alignItems: "center", justifyContent: "center", marginLeft: 14 },
  avatarText: { color: "#F5F7FA", fontWeight: "800", fontSize: 16 },
  hero: { backgroundColor: "#0B1220", borderRadius: 28, padding: 24, overflow: "hidden", shadowColor: "#EEF2F8", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  heroGlow: { position: "absolute", width: 210, height: 210, borderRadius: 105, backgroundColor: "#2E5FD9", opacity: 0.35, top: -100, left: -50 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 13 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#1B2A45", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: "#93C5FD", fontSize: 11, textAlign: "right" },
  heroTitle: { color: "#F5F7FA", fontSize: 25, fontWeight: "800", marginTop: 2, textAlign: "right" },
  heroMeta: { color: "#8B96A8", fontSize: 12, marginTop: 4, textAlign: "right" },
  heroTime: { alignItems: "flex-end" },
  heroTimeLabel: { color: "#8592A6", fontSize: 10 },
  heroTimeValue: { color: "#F5F7FA", fontSize: 18, fontWeight: "800", marginTop: 2 },
  heroFooter: { marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,.1)", flexDirection: "row-reverse", alignItems: "center", gap: 15 },
  heroFooterLabel: { color: "#8592A6", fontSize: 10, textAlign: "right" },
  heroFooterValue: { color: "#F5F7FA", fontSize: 20, fontWeight: "800", marginTop: 2, textAlign: "right" },
  progressTrack: { flex: 1, height: 7, backgroundColor: "#232C3A", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#3B82F6", borderRadius: 10 },
  sectionHeading: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  sectionTitle: { color: "#EEF2F8", fontSize: 18, fontWeight: "800", textAlign: "right" },
  sectionSub: { color: "#8592A6", fontSize: 11, marginTop: 3, textAlign: "right" },
  liveBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#0F2A20", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  liveText: { color: "#34D399", fontSize: 10, fontWeight: "800" },
  kpiGrid: { flexDirection: "row-reverse", gap: 10 },
  kpiCard: { flex: 1, backgroundColor: "#131A24", borderRadius: 20, padding: 17, minHeight: 140, borderWidth: 1, borderColor: "#232C3A", shadowColor: "#EEF2F8", shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  kpiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  kpiValue: { color: "#EEF2F8", fontSize: 21, fontWeight: "800", textAlign: "right" },
  kpiLabel: { color: "#97A3B6", fontSize: 11, marginTop: 3, textAlign: "right" },
  kpiTrend: { color: "#34D399", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiTrendNeutral: { color: "#97A3B6", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiUnit: { color: "#8592A6", fontSize: 9, marginTop: 9, textAlign: "right" },
  analyticsRow: { flexDirection: "row-reverse", gap: 12, flexWrap: "wrap" },
  chartCard: { flex: 1.65, minWidth: 330, backgroundColor: "#131A24", borderRadius: 20, padding: 17, borderWidth: 1, borderColor: "#232C3A" },
  statusCard: { flex: 1, minWidth: 270, backgroundColor: "#131A24", borderRadius: 20, padding: 17, borderWidth: 1, borderColor: "#232C3A" },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#EEF2F8", fontSize: 14, fontWeight: "800", textAlign: "right" },
  cardSubtitle: { color: "#8592A6", fontSize: 10, marginTop: 3, textAlign: "right" },
  chartLegend: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#3B82F6" },
  legendText: { color: "#97A3B6", fontSize: 9 },
  chartArea: { height: 215, marginTop: 10, position: "relative" },
  chartLabels: { position: "absolute", left: 22, right: 22, bottom: 0, flexDirection: "row-reverse", justifyContent: "space-between" },
  chartLabel: { color: "#8592A6", fontSize: 9 },
  gridLine: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: "#1A212C" },
  bars: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", height: "100%", paddingHorizontal: 4 },
  barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  barTrack: { width: 22, height: 140, backgroundColor: "#1A212C", borderRadius: 8, justifyContent: "flex-end", overflow: "hidden" },
  bar: { width: "100%", minHeight: 4, backgroundColor: "#3B82F6", borderRadius: 8 },
  barValue: { color: "#EEF2F8", fontSize: 10, fontWeight: "800" },
  barLabel: { color: "#8592A6", fontSize: 9 },
  periodPill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#232C3A", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  periodText: { color: "#97A3B6", fontSize: 9 },
  donutWrap: { alignItems: "center", marginTop: 12 },
  donutOuter: { width: 120, height: 120, borderRadius: 60, borderWidth: 13, borderColor: "#34D399", alignItems: "center", justifyContent: "center" },
  donutInner: { alignItems: "center" },
  donutValue: { color: "#EEF2F8", fontSize: 21, fontWeight: "800" },
  donutLabel: { color: "#8592A6", fontSize: 9, marginTop: 2 },
  statusRows: { gap: 8, marginTop: 10 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  statusColor: { width: 7, height: 7, borderRadius: 4 },
  statusName: { color: "#97A3B6", fontSize: 10, flex: 1, textAlign: "right" },
  statusPercent: { color: "#EEF2F8", fontSize: 10, fontWeight: "800" },
  attendanceCard: { backgroundColor: "#131A24", borderRadius: 20, padding: 18, borderWidth: 1, borderColor: "#232C3A" },
  attendanceTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  statusPill: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  gpsText: { color: "#97A3B6", fontSize: 10, flex: 1, textAlign: "right" },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#3B82F6", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 15 },
  primaryButtonText: { color: "#F5F7FA", fontWeight: "800", fontSize: 14 },
  disabledButton: { backgroundColor: "#2A3346" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  securityNote: { color: "#8592A6", fontSize: 10, textAlign: "center", marginTop: 10 },
  quickGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  quickCard: { flex: 1, minWidth: 180, backgroundColor: "#131A24", borderRadius: 19, borderWidth: 1, borderColor: "#232C3A", padding: 16, flexDirection: "row-reverse", alignItems: "center", gap: 12, shadowColor: "#EEF2F8", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  quickIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#15243D", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#243352" },
  quickLabel: { color: "#B6C0D1", fontSize: 13, fontWeight: "800", flex: 1, textAlign: "right" },
  quickArrow: { color: "#8592A6", fontSize: 16 },
  insight: { backgroundColor: "#211A38", borderRadius: 17, padding: 14, borderWidth: 1, borderColor: "#C4B5FD", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  insightIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#211A38", alignItems: "center", justifyContent: "center" },
  insightCopy: { flex: 1 },
  insightTitle: { color: "#C4B5FD", fontSize: 11, fontWeight: "800", textAlign: "right" },
  insightText: { color: "#C4B5FD", fontSize: 10, lineHeight: 17, marginTop: 2, textAlign: "right" },
  insightBadge: { backgroundColor: "#5B21B6", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  insightBadgeText: { color: "#F5F7FA", fontSize: 9, fontWeight: "800" },
  notice: { backgroundColor: "#2B2410", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  noticeText: { color: "#FBBF24", fontSize: 11, flex: 1, lineHeight: 17, textAlign: "right" },
  installCard: { backgroundColor: "#15243D", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#243352" },
  installCopy: { flex: 1 },
  installTitle: { color: "#93C5FD", fontSize: 11, fontWeight: "800", textAlign: "right" },
  installText: { color: "#93C5FD", fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: "right" },
});
