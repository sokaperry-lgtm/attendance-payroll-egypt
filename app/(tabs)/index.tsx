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

function distanceBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const radius = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return Math.round(
    radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

function currentTime() {
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

type Coordinates = {
  latitude: number;
  longitude: number;
};

function getBrowserLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("المتصفح لا يدعم تحديد الموقع."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("يجب السماح بالوصول إلى الموقع لتسجيل الحضور."));
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error("تعذر تحديد موقعك الحالي."));
        } else {
          reject(new Error("انتهت مهلة تحديد الموقع."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}

async function getCurrentCoordinates(): Promise<Coordinates> {
  if (Platform.OS === "web") {
    return getBrowserLocation();
  }

  const permission = await Location.requestForegroundPermissionsAsync();

  if (permission.status !== "granted") {
    throw new Error("يجب السماح بالوصول إلى الموقع لتسجيل الحضور.");
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();

  if (!servicesEnabled) {
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
    (record) =>
      record.status === "حاضر" || record.status === "متأخر",
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
      const message =
        error instanceof Error
          ? error.message
          : "تعذر التحقق من الموقع";

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
        error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{dateLabel}</Text>

            <Text style={styles.title}>
              صباح الخير، {employee.name.split(" ")[0]}
            </Text>

            <Text style={styles.subtitle}>
              {employee.title} · {employee.department}
            </Text>
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

        <View style={styles.shiftCard}>
          <View style={styles.shiftTop}>
            <View style={styles.iconBubble}>
              <IconSymbol
                name={isWeeklyOff ? "calendar" : "clock"}
                size={20}
                color="#2563EB"
              />
            </View>

            <View style={styles.flex}>
              <Text style={styles.cardLabel}>وردية اليوم</Text>
              <Text style={styles.cardTitle}>{shift.name}</Text>
            </View>

            {isWeeklyOff ? (
              <View style={styles.offBadge}>
                <Text style={styles.offBadgeText}>مدفوعة</Text>
              </View>
            ) : (
              <View style={styles.shiftTime}>
                <Text style={styles.timeText}>{shift.start}</Text>
                <Text style={styles.timeDash}>—</Text>
                <Text style={styles.timeText}>{shift.end}</Text>
              </View>
            )}
          </View>

          <View style={styles.shiftMeta}>
            <Text style={styles.metaText}>
              {isWeeklyOff
                ? "لا توجد مواعيد — اليوم إجازة أسبوعية مدفوعة"
                : `فترة السماح ${PAYROLL_RULES.graceMinutes} دقيقة`}
            </Text>

            {!isWeeklyOff && (
              <>
                <Text style={styles.metaText}>•</Text>
                <Text style={styles.metaText}>الفرع الرئيسي</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>تسجيل اليوم</Text>
          <Text style={styles.liveDot}>● مباشر</Text>
        </View>

        <View style={styles.attendanceCard}>
          <View style={styles.attendanceStatus}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: isCheckedOut
                    ? "#64748B"
                    : checkedIn
                      ? "#16A34A"
                      : "#D97706",
                },
              ]}
            />

            <Text style={styles.statusText}>
              {isCheckedOut
                ? "تم الانتهاء"
                : checkedIn
                  ? "أنت داخل العمل"
                  : "لم تسجل حضورك بعد"}
            </Text>
          </View>

          <Text style={styles.gpsText}>{gpsMessage}</Text>

          <Pressable
            disabled={working || isCheckedOut || isWeeklyOff}
            onPress={checkedIn ? handleCheckOut : handleCheckIn}
            style={({ pressed }) => [
              styles.primaryButton,
              (working || isCheckedOut || isWeeklyOff) &&
                styles.disabledButton,
              pressed && styles.pressed,
            ]}
          >
            <IconSymbol
              name={
                isWeeklyOff
                  ? "checkmark"
                  : checkedIn
                    ? "logout"
                    : "location"
              }
              size={20}
              color="#FFFFFF"
            />

            <Text style={styles.primaryButtonText}>
              {isWeeklyOff
                ? "إجازة أسبوعية مدفوعة"
                : working
                  ? "جاري التحقق..."
                  : isCheckedOut
                    ? "تم تسجيل اليوم"
                    : checkedIn
                      ? "تسجيل الانصراف"
                      : "تسجيل الحضور"}
            </Text>
          </Pressable>

          <Text style={styles.securityNote}>
            {isWeeklyOff
              ? "لن يتم احتساب غياب أو تأخير في هذا اليوم"
              : `يُسمح بالتسجيل داخل نطاق ${branch.radiusMeters} متر من ${branch.name}`}
          </Text>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>ملخص الشهر</Text>
          <Text style={styles.linkText}>سبتمبر 2026</Text>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {payroll.net.toLocaleString("ar-EG")}
            </Text>
            <Text style={styles.metricLabel}>صافي المتوقع</Text>
            <Text style={styles.metricUnit}>ج.م</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{presentDays}</Text>
            <Text style={styles.metricLabel}>أيام العمل</Text>
            <Text style={styles.metricUnit}>من 26</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}
            </Text>
            <Text style={styles.metricLabel}>دقيقة تأخير</Text>
            <Text style={styles.metricUnit}>بعد السماح</Text>
          </View>
        </View>

        <View style={styles.quickActions}><Pressable onPress={() => router.push("/attendance" as never)} style={styles.quickAction}><View style={styles.quickActionIcon}><IconSymbol name="calendar" size={18} color="#2563EB" /></View><Text style={styles.quickActionText}>سجل الحضور</Text></Pressable><Pressable onPress={() => router.push("/schedule" as never)} style={styles.quickAction}><View style={styles.quickActionIcon}><IconSymbol name="clock" size={18} color="#2563EB" /></View><Text style={styles.quickActionText}>الورديات</Text></Pressable><Pressable onPress={() => router.push("/requests" as never)} style={styles.quickAction}><View style={styles.quickActionIcon}><IconSymbol name="doc.text" size={18} color="#2563EB" /></View><Text style={styles.quickActionText}>الطلبات</Text></Pressable></View>

        <View style={styles.notice}>
          <IconSymbol name="wallet" size={20} color="#B45309" />
          <Text style={styles.noticeText}>
            الحساب مبدئي حتى اعتماد المرتب من المدير آخر الشهر.
          </Text>
        </View>

        {Platform.OS === "web" && (
          <View style={styles.installCard}>
            <IconSymbol name="plus" size={20} color="#2563EB" />

            <View style={styles.installCopy}>
              <Text style={styles.installTitle}>
                ثبّت حاضر على الآيفون
              </Text>

              <Text style={styles.installText}>
                من Safari اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية» ليظهر كتطبيق.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 18,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  flex: {
    flex: 1,
  },
  eyebrow: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 6,
    textAlign: "right",
  },
  title: {
    color: "#0F172A",
    fontSize: 26,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 13,
    marginTop: 5,
    textAlign: "right",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  avatarText: {
    color: "white",
    fontWeight: "800",
    fontSize: 17,
  },
  shiftCard: {
    backgroundColor: "#1D4ED8",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#1D4ED8",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  shiftTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
  },
  iconBubble: {
    width: 42,
    height: 42,
    backgroundColor: "#DBEAFE",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    color: "#DBEAFE",
    fontSize: 12,
    textAlign: "right",
  },
  cardTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "right",
  },
  shiftTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  offBadge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  offBadgeText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "800",
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  timeDash: {
    color: "#BFDBFE",
  },
  shiftMeta: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    marginTop: 15,
    paddingTop: 12,
    flexDirection: "row-reverse",
    gap: 8,
  },
  metaText: {
    color: "#DBEAFE",
    fontSize: 12,
  },
  sectionHeading: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 3,
  },
  sectionTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    textAlign: "right",
  },
  liveDot: {
    color: "#059669",
    fontSize: 12,
    fontWeight: "700",
  },
  attendanceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  attendanceStatus: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  gpsText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
    textAlign: "right",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 15,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  disabledButton: {
    backgroundColor: "#94A3B8",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  securityNote: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
    marginTop: 12,
  },
  linkText: {
    color: "#2563EB",
    fontSize: 12,
    fontWeight: "700",
  },
  metricsRow: {
    flexDirection: "row-reverse",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minHeight: 102,
  },
  metricValue: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "right",
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 8,
    textAlign: "right",
  },
  metricUnit: {
    color: "#94A3B8",
    fontSize: 10,
    marginTop: 2,
    textAlign: "right",
  },
  notice: {
    backgroundColor: "#FFFBEB",
    borderRadius: 14,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  noticeText: {
    color: "#92400E",
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
    textAlign: "right",
  },
  installCard: {
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    padding: 13,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  installCopy: {
    flex: 1,
  },
  installTitle: {
    color: "#1E40AF",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  installText: {
    color: "#1D4ED8",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    textAlign: "right",
  },
});
