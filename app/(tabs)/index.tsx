import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function currentTime() {
  return new Intl.DateTimeFormat("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

export default function HomeScreen() {
  const { employee, branch, shift, payroll, payrollInputs, records, checkedIn, todayRecord, checkIn, checkOut } = useAppData();
  const router = useRouter();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [working, setWorking] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("جاهز للتحقق من موقعك");
  const isCheckedOut = Boolean(todayRecord?.checkOut);
  const isWeeklyOff = shift.kind === "weekly_off";
  const presentDays = records.filter((record) => record.status === "حاضر" || record.status === "متأخر").length;
  const dateLabel = useMemo(() => new Intl.DateTimeFormat("ar-EG", { weekday: "long", day: "numeric", month: "long" }).format(new Date()), []);

  async function handleCheckIn() {
    if (isWeeklyOff) return;
    setWorking(true);
    try {
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
