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
              <IconSymbol name={isWeeklyOff ? "calendar" : "clock"} size={22} color="#668C7F" />
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
            <View style={[styles.kpiIcon, { backgroundColor: "#E6F1EC" }]}><IconSymbol name="checkmark" size={17} color="#2E7D68" /></View>
            <Text style={styles.kpiValue}>{presentDays}</Text>
            <Text style={styles.kpiLabel}>أيام الحضور</Text>
            <Text style={styles.kpiTrend}>↑ 4.2% عن الشهر السابق</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#E7EEEB" }]}><IconSymbol name="clock" size={17} color="#668C7F" /></View>
            <Text style={styles.kpiValue}>{payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}</Text>
            <Text style={styles.kpiLabel}>دقيقة تأخير</Text>
            <Text style={styles.kpiTrendNeutral}>ضمن المعدل الطبيعي</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIcon, { backgroundColor: "#F7EBDD" }]}><IconSymbol name="wallet" size={17} color="#FB923C" /></View>
            <Text style={styles.kpiValue}>{payroll.net.toLocaleString("ar-EG")}</Text>
            <Text style={styles.kpiLabel}>صافي المرتب المتوقع</Text>
            <Text style={styles.kpiUnit}>ج.م</Text>
          </View>
        </View>

        <View style={styles.analyticsRow}>
          <View style={styles.chartCard}>
            <View style={styles.cardHeader}>
              <View><Text style={styles.cardTitle}>أداء الحضور</Text><Text style={styles.cardSubtitle}>معدل الالتزام خلال آخر 7 أيام</Text></View>
              <View style={styles.periodPill}><Text style={styles.periodText}>هذا الأسبوع</Text><IconSymbol name="chevron.down" size={14} color="#7B817E" /></View>
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
              <IconSymbol name="chart.bar" size={19} color="#7B817E" />
            </View>
            <View style={styles.donutWrap}>
              <View style={styles.donutOuter}><View style={styles.donutInner}><Text style={styles.donutValue}>92%</Text><Text style={styles.donutLabel}>حضور</Text></View></View>
            </View>
            <View style={styles.statusRows}>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#2E7D68" }]} /><Text style={styles.statusName}>حاضر</Text><Text style={styles.statusPercent}>92%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#B18452" }]} /><Text style={styles.statusName}>متأخر</Text><Text style={styles.statusPercent}>5%</Text></View>
              <View style={styles.statusRow}><View style={[styles.statusColor, { backgroundColor: "#1E2733" }]} /><Text style={styles.statusName}>غياب</Text><Text style={styles.statusPercent}>3%</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View><Text style={styles.sectionTitle}>تسجيل اليوم</Text><Text style={styles.sectionSub}>تحقق آمن من موقع الفرع</Text></View>
        </View>

        <View style={styles.attendanceCard}>
          <View style={styles.attendanceTop}>
            <View style={[styles.statusPill, { backgroundColor: isCheckedOut ? "#F3F0EA" : checkedIn ? "#E6F1EC" : "#F7EBDD" }]}>
              <View style={[styles.statusDotSmall, { backgroundColor: isCheckedOut ? "#7B817E" : checkedIn ? "#2E7D68" : "#B18452" }]} />
              <Text style={[styles.statusPillText, { color: isCheckedOut ? "#8A918D" : checkedIn ? "#2E7D68" : "#B18452" }]}>
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
              <View style={styles.quickIcon}><IconSymbol name={item.icon as never} size={19} color="#668C7F" /></View>
              <Text style={styles.quickLabel}>{item.label}</Text>
              <Text style={styles.quickArrow}>←</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.insight}>
          <View style={styles.insightIcon}><IconSymbol name="sparkles" size={19} color="#668C7F" /></View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightTitle}>Insight ذكي</Text>
            <Text style={styles.insightText}>أداؤك في الحضور أعلى من المتوسط هذا الشهر. استمر بنفس الالتزام.</Text>
          </View>
          <View style={styles.insightBadge}><Text style={styles.insightBadgeText}>ممتاز</Text></View>
        </View>

        <View style={styles.notice}>
          <IconSymbol name="wallet" size={19} color="#B18452" />
          <Text style={styles.noticeText}>الحساب مبدئي حتى اعتماد المرتب من المدير آخر الشهر.</Text>
        </View>

        {Platform.OS === "web" && (
          <View style={styles.installCard}>
            <IconSymbol name="plus" size={20} color="#668C7F" />
            <View style={styles.installCopy}><Text style={styles.installTitle}>ثبّت حاضر على الآيفون</Text><Text style={styles.installText}>من Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» ليظهر كتطبيق.</Text></View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 28, paddingBottom: 56, gap: 22, maxWidth: 1240, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  headerCopy: { flex: 1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 14 },
  notificationButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7E2D9", alignItems: "center", justifyContent: "center", position: "relative" },
  notificationDot: { position: "absolute", width: 7, height: 7, borderRadius: 4, backgroundColor: "#B86F6B", top: 8, right: 8, borderWidth: 2, borderColor: "#FFFFFF" },
  eyebrow: { color: "#7B817E", fontSize: 12, marginBottom: 6, textAlign: "right" },
  title: { color: "#303735", fontSize: 30, fontWeight: "900", textAlign: "right", letterSpacing: -0.4 },
  subtitle: { color: "#7B817E", fontSize: 13, marginTop: 6, textAlign: "right" },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#668C7F", alignItems: "center", justifyContent: "center", marginLeft: 14 },
  avatarText: { color: "#FFFFFF", fontWeight: "900", fontSize: 15 },
  hero: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22, overflow: "hidden", borderWidth: 1, borderColor: "#E7E2D9", shadowColor: "#303735", shadowOpacity: 0.035, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  heroGlow: { position: "absolute", width: 190, height: 190, borderRadius: 95, backgroundColor: "#E8F0EB", opacity: 0.8, top: -105, left: -55 },
  heroTop: { flexDirection: "row-reverse", alignItems: "center", gap: 13 },
  heroIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "#E8F0EB", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  heroEyebrow: { color: "#668C7F", fontSize: 11, fontWeight: "800", textAlign: "right" },
  heroTitle: { color: "#303735", fontSize: 23, fontWeight: "900", marginTop: 3, textAlign: "right" },
  heroMeta: { color: "#7B817E", fontSize: 12, marginTop: 5, textAlign: "right" },
  heroTime: { alignItems: "flex-end" },
  heroTimeLabel: { color: "#8A918D", fontSize: 10 },
  heroTimeValue: { color: "#303735", fontSize: 18, fontWeight: "900", marginTop: 2 },
  heroFooter: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: "#EEEAE2", flexDirection: "row-reverse", alignItems: "center", gap: 15 },
  heroFooterLabel: { color: "#8A918D", fontSize: 10, textAlign: "right" },
  heroFooterValue: { color: "#303735", fontSize: 20, fontWeight: "900", marginTop: 2, textAlign: "right" },
  progressTrack: { flex: 1, height: 7, backgroundColor: "#EDF0ED", borderRadius: 10, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#668C7F", borderRadius: 10 },
  sectionHeading: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  sectionTitle: { color: "#303735", fontSize: 18, fontWeight: "900", textAlign: "right" },
  sectionSub: { color: "#8A918D", fontSize: 11, marginTop: 3, textAlign: "right" },
  liveBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 5, backgroundColor: "#E8F0EB", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#2E7D68" },
  liveText: { color: "#2E7D68", fontSize: 10, fontWeight: "900" },
  kpiGrid: { flexDirection: "row-reverse", gap: 12 },
  kpiCard: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 17, minHeight: 132, borderWidth: 1, borderColor: "#E7E2D9" },
  kpiIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  kpiValue: { color: "#303735", fontSize: 22, fontWeight: "900", textAlign: "right" },
  kpiLabel: { color: "#7B817E", fontSize: 11, marginTop: 4, textAlign: "right" },
  kpiTrend: { color: "#2E7D68", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiTrendNeutral: { color: "#7B817E", fontSize: 9, marginTop: 9, textAlign: "right" },
  kpiUnit: { color: "#8A918D", fontSize: 9, marginTop: 9, textAlign: "right" },
  analyticsRow: { flexDirection: "row-reverse", gap: 14, flexWrap: "wrap" },
  chartCard: { flex: 1.65, minWidth: 330, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#E7E2D9" },
  statusCard: { flex: 1, minWidth: 270, backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#E7E2D9" },
  cardHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: "#303735", fontSize: 14, fontWeight: "900", textAlign: "right" },
  cardSubtitle: { color: "#8A918D", fontSize: 10, marginTop: 3, textAlign: "right" },
  chartLegend: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#668C7F" },
  legendText: { color: "#7B817E", fontSize: 9 },
  chartArea: { height: 215, marginTop: 10, position: "relative" },
  chartLabels: { position: "absolute", left: 22, right: 22, bottom: 0, flexDirection: "row-reverse", justifyContent: "space-between" },
  chartLabel: { color: "#8A918D", fontSize: 9 },
  gridLine: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: "#F0ECE5" },
  bars: { flexDirection: "row-reverse", alignItems: "flex-end", justifyContent: "space-between", height: "100%", paddingHorizontal: 4 },
  barColumn: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  barTrack: { width: 22, height: 140, backgroundColor: "#F0ECE5", borderRadius: 8, justifyContent: "flex-end", overflow: "hidden" },
  bar: { width: "100%", minHeight: 4, backgroundColor: "#668C7F", borderRadius: 8 },
  barValue: { color: "#303735", fontSize: 10, fontWeight: "900" },
  barLabel: { color: "#8A918D", fontSize: 9 },
  periodPill: { flexDirection: "row-reverse", alignItems: "center", gap: 5, borderWidth: 1, borderColor: "#E7E2D9", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 6 },
  periodText: { color: "#7B817E", fontSize: 9 },
  donutWrap: { alignItems: "center", marginTop: 12 },
  donutOuter: { width: 120, height: 120, borderRadius: 60, borderWidth: 13, borderColor: "#668C7F", alignItems: "center", justifyContent: "center" },
  donutInner: { alignItems: "center" },
  donutValue: { color: "#303735", fontSize: 21, fontWeight: "900" },
  donutLabel: { color: "#8A918D", fontSize: 9, marginTop: 2 },
  statusRows: { gap: 8, marginTop: 10 },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 7 },
  statusColor: { width: 7, height: 7, borderRadius: 4 },
  statusName: { color: "#7B817E", fontSize: 10, flex: 1, textAlign: "right" },
  statusPercent: { color: "#303735", fontSize: 10, fontWeight: "900" },
  attendanceCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "#E7E2D9" },
  attendanceTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10 },
  statusPill: { flexDirection: "row-reverse", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },
  statusPillText: { fontSize: 11, fontWeight: "900" },
  gpsText: { color: "#7B817E", fontSize: 10, flex: 1, textAlign: "right" },
  primaryButton: { minHeight: 52, borderRadius: 14, backgroundColor: "#668C7F", flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 9, marginTop: 15 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
  disabledButton: { backgroundColor: "#DDE7E1" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  securityNote: { color: "#8A918D", fontSize: 10, textAlign: "center", marginTop: 10 },
  quickGrid: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  quickCard: { flex: 1, minWidth: 180, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E7E2D9", padding: 15, flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  quickIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#E8F0EB", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D6E2DC" },
  quickLabel: { color: "#303735", fontSize: 13, fontWeight: "900", flex: 1, textAlign: "right" },
  quickArrow: { color: "#8A918D", fontSize: 16 },
  insight: { backgroundColor: "#EEF3EF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#D6E2DC", flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  insightIcon: { width: 37, height: 37, borderRadius: 12, backgroundColor: "#E8F0EB", alignItems: "center", justifyContent: "center" },
  insightCopy: { flex: 1 },
  insightTitle: { color: "#668C7F", fontSize: 11, fontWeight: "900", textAlign: "right" },
  insightText: { color: "#66706B", fontSize: 10, lineHeight: 17, marginTop: 2, textAlign: "right" },
  insightBadge: { backgroundColor: "#668C7F", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  insightBadgeText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  notice: { backgroundColor: "#FBF4E9", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#EADBC7" },
  noticeText: { color: "#9A7044", fontSize: 11, flex: 1, lineHeight: 17, textAlign: "right" },
  installCard: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 9, borderWidth: 1, borderColor: "#D6E2DC" },
  installCopy: { flex: 1 },
  installTitle: { color: "#668C7F", fontSize: 11, fontWeight: "900", textAlign: "right" },
  installText: { color: "#7B817E", fontSize: 10, lineHeight: 16, marginTop: 3, textAlign: "right" },
});