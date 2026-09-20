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
    <ScreenContainer edges={["top","left","right"]}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{employee.initials}</Text></View>
            <View><Text style={styles.muted}>{dateLabel}</Text><Text style={styles.greeting}>{role === "manager" ? "مساحة إدارة الفريق" : "أهلاً " + employee.name.split(" ")[0]}</Text></View>
          </View>
          <Pressable style={styles.iconButton} onPress={() => router.push("/notifications" as never)}>
            <IconSymbol name="notifications" size={20} color="#303735" />
            {(notificationsQuery.data ?? []).some((n) => !n.readAt) && <View style={styles.notificationDot} />}
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroMain}>
            <View style={styles.eyebrowRow}><View style={styles.liveDot}/><Text style={styles.eyebrow}>نظام الحضور نشط</Text></View>
            <Text style={styles.heroTitle}>{role === "manager" ? "كل ما يهمك عن فريقك، في شاشة واحدة." : "يوم عملك يبدأ من هنا."}</Text>
            <Text style={styles.heroText}>{role === "manager" ? "راقب الحضور والطلبات والرواتب واتخاذ القرار بسرعة." : "سجل حضورك، تابع ورديتك، واعرف وضعك المالي بسهولة."}</Text>
            <View style={styles.heroMetaRow}>
              <View><Text style={styles.metaLabel}>الوردية</Text><Text style={styles.metaValue}>{isWeeklyOff ? "إجازة" : shift.start + " — " + shift.end}</Text></View>
              <View><Text style={styles.metaLabel}>الفرع</Text><Text style={styles.metaValue}>الفرع الرئيسي</Text></View>
              <View><Text style={styles.metaLabel}>الحضور</Text><Text style={styles.metaValue}>92%</Text></View>
            </View>
          </View>
          <View style={styles.heroAction}>
            <Text style={styles.actionLabel}>{isCheckedOut ? "تم تسجيل الانصراف" : checkedIn ? "أنت داخل الوردية" : "ابدأ ورديتك"}</Text>
            <Text style={styles.clock}>{currentTime()}</Text>
            <Text style={styles.actionHint}>{gpsMessage}</Text>
            <Pressable disabled={working || isWeeklyOff || isCheckedOut} onPress={checkedIn ? handleCheckOut : handleCheckIn} style={({pressed}) => [styles.attendanceButton, (working || isWeeklyOff || isCheckedOut) && styles.disabledButton, pressed && styles.pressed]}>
              <IconSymbol name={checkedIn ? "arrow.right" : "checkmark"} size={18} color="#FFFFFF"/>
              <Text style={styles.attendanceButtonText}>{working ? "جارٍ التحقق..." : checkedIn ? "تسجيل الانصراف" : "تسجيل الحضور"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>ملخص اليوم</Text><Text style={styles.sectionHint}>أهم الأرقام بدون زحمة</Text></View></View>
        <View style={styles.metricGrid}>
          <View style={styles.metric}><View style={[styles.metricIcon,{backgroundColor:"#E8F0EB"}]}><IconSymbol name="checkmark" size={17} color="#668C7F"/></View><Text style={styles.metricNumber}>{presentDays}</Text><Text style={styles.metricLabel}>أيام الحضور</Text><Text style={styles.metricFoot}>هذا الشهر</Text></View>
          <View style={styles.metric}><View style={[styles.metricIcon,{backgroundColor:"#F4EEE5"}]}><IconSymbol name="clock" size={17} color="#B18452"/></View><Text style={styles.metricNumber}>{payrollInputs.lateMinutes?.toLocaleString("ar-EG") ?? "٠"}</Text><Text style={styles.metricLabel}>دقيقة تأخير</Text><Text style={styles.metricFoot}>إجمالي الشهر</Text></View>
          <View style={styles.metric}><View style={[styles.metricIcon,{backgroundColor:"#EEF1EF"}]}><IconSymbol name="wallet" size={17} color="#668C7F"/></View><Text style={styles.metricNumber}>{payroll.net.toLocaleString("ar-EG")}</Text><Text style={styles.metricLabel}>صافي الراتب</Text><Text style={styles.metricFoot}>ج.م متوقع</Text></View>
          <View style={styles.metric}><View style={[styles.metricIcon,{backgroundColor:"#F7ECEA"}]}><IconSymbol name="doc.text.fill" size={17} color="#B86F6B"/></View><Text style={styles.metricNumber}>{(notificationsQuery.data ?? []).filter(n=>!n.readAt).length}</Text><Text style={styles.metricLabel}>إشعارات جديدة</Text><Text style={styles.metricFoot}>تحتاج مراجعة</Text></View>
        </View>

        <View style={styles.twoCol}>
          <View style={styles.panel}>
            <View style={styles.panelHead}><Text style={styles.panelTitle}>أداء الحضور</Text><Text style={styles.panelLink}>آخر 7 أيام</Text></View>
            <View style={styles.chart}>{weeklyAttendance.map((item)=><View key={item.day} style={styles.chartItem}><Text style={styles.chartValue}>{item.value}</Text><View style={styles.track}><View style={[styles.fill,{height:(item.value + "%") as `${number}%`}]}/></View><Text style={styles.chartDay}>{item.day.slice(0,2)}</Text></View>)}</View>
          </View>
          <View style={styles.panel}>
            <View style={styles.panelHead}><Text style={styles.panelTitle}>حالة اليوم</Text><Text style={styles.panelLink}>{dateLabel}</Text></View>
            <View style={styles.statusBox}><View style={[styles.statusIcon,{backgroundColor:checkedIn?"#E8F0EB":"#F4EEE5"}]}><IconSymbol name={checkedIn?"checkmark":"clock"} size={21} color={checkedIn?"#668C7F":"#B18452"}/></View><View style={{flex:1}}><Text style={styles.statusTitle}>{checkedIn?"الوردية جارية":isWeeklyOff?"يوم إجازة":"لم تسجل الحضور بعد"}</Text><Text style={styles.statusText}>{checkedIn?"تم التحقق من موقعك بنجاح.":isWeeklyOff?"استمتع بيوم الراحة.":"اضغط تسجيل الحضور لبدء اليوم."}</Text></View></View>
            <View style={styles.infoRow}><Text style={styles.infoValue}>{shift.start}</Text><Text style={styles.infoLabel}>بداية الوردية</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoValue}>{shift.end}</Text><Text style={styles.infoLabel}>نهاية الوردية</Text></View>
          </View>
        </View>

        <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>الوصول السريع</Text><Text style={styles.sectionHint}>الأماكن التي تستخدمها أكثر</Text></View></View>
        <View style={styles.quickGrid}>
          {[["الحضور","calendar","/attendance"],["الطلبات","doc.text.fill","/requests"],["الجدول","calendar","/schedule"],["الإشعارات","notifications","/notifications"]].map(([label,icon,path])=><Pressable key={label} style={({pressed})=>[styles.quick,pressed&&styles.pressed]} onPress={()=>router.push(path as never)}><View style={styles.quickIcon}><IconSymbol name={icon as any} size={18} color="#668C7F"/></View><Text style={styles.quickText}>{label}</Text><Text style={styles.arrow}>‹</Text></Pressable>)}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page:{padding:28,paddingBottom:60,gap:20,maxWidth:1220,width:"100%",alignSelf:"center"},
  topbar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  profileRow:{flexDirection:"row-reverse",alignItems:"center",gap:12},
  avatar:{width:46,height:46,borderRadius:15,backgroundColor:"#668C7F",alignItems:"center",justifyContent:"center"},
  avatarText:{color:"#fff",fontSize:14,fontWeight:"900"},muted:{color:"#8A918D",fontSize:11,textAlign:"right"},greeting:{color:"#303735",fontSize:23,fontWeight:"900",marginTop:3,textAlign:"right"},
  iconButton:{width:44,height:44,borderRadius:14,borderWidth:1,borderColor:"#E7E2D9",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",position:"relative"},notificationDot:{position:"absolute",right:8,top:8,width:7,height:7,borderRadius:4,backgroundColor:"#B86F6B",borderWidth:2,borderColor:"#fff"},
  hero:{backgroundColor:"#FFFFFF",borderRadius:24,borderWidth:1,borderColor:"#E7E2D9",padding:22,flexDirection:"row-reverse",gap:18},heroMain:{flex:1,padding:4},eyebrowRow:{flexDirection:"row-reverse",alignItems:"center",gap:6},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#668C7F"},eyebrow:{color:"#668C7F",fontSize:11,fontWeight:"900"},
  heroTitle:{color:"#303735",fontSize:30,fontWeight:"900",lineHeight:37,marginTop:12,textAlign:"right"},heroText:{color:"#7B817E",fontSize:13,lineHeight:21,marginTop:8,maxWidth:620,textAlign:"right"},heroMetaRow:{flexDirection:"row-reverse",gap:34,marginTop:23,paddingTop:17,borderTopWidth:1,borderTopColor:"#EEEAE2"},metaLabel:{color:"#9AA09C",fontSize:10,textAlign:"right"},metaValue:{color:"#303735",fontSize:13,fontWeight:"900",marginTop:3,textAlign:"right"},
  heroAction:{width:260,borderRadius:18,backgroundColor:"#F5F8F5",padding:17,justifyContent:"center"},actionLabel:{color:"#668C7F",fontSize:11,fontWeight:"900",textAlign:"right"},clock:{color:"#303735",fontSize:30,fontWeight:"900",marginTop:3,textAlign:"right"},actionHint:{color:"#8A918D",fontSize:9,lineHeight:15,marginTop:3,textAlign:"right"},
  attendanceButton:{height:48,borderRadius:13,backgroundColor:"#668C7F",alignItems:"center",justifyContent:"center",flexDirection:"row-reverse",gap:7,marginTop:13},attendanceButtonText:{color:"#fff",fontSize:12,fontWeight:"900"},disabledButton:{backgroundColor:"#DDE7E1"},pressed:{opacity:.8,transform:[{scale:.985}]},
  sectionHead:{flexDirection:"row-reverse",alignItems:"flex-end",justifyContent:"space-between",marginTop:3},sectionTitle:{color:"#303735",fontSize:18,fontWeight:"900",textAlign:"right"},sectionHint:{color:"#9AA09C",fontSize:10,marginTop:3,textAlign:"right"},
  metricGrid:{flexDirection:"row-reverse",gap:12},metric:{flex:1,minWidth:150,backgroundColor:"#fff",borderRadius:18,borderWidth:1,borderColor:"#E7E2D9",padding:16},metricIcon:{width:36,height:36,borderRadius:12,alignItems:"center",justifyContent:"center"},metricNumber:{color:"#303735",fontSize:21,fontWeight:"900",marginTop:13,textAlign:"right"},metricLabel:{color:"#5F6864",fontSize:11,fontWeight:"800",marginTop:3,textAlign:"right"},metricFoot:{color:"#A0A6A2",fontSize:9,marginTop:6,textAlign:"right"},
  twoCol:{flexDirection:"row-reverse",gap:14,flexWrap:"wrap"},panel:{flex:1,minWidth:320,backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:"#E7E2D9",padding:18},panelHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},panelTitle:{color:"#303735",fontSize:14,fontWeight:"900",textAlign:"right"},panelLink:{color:"#668C7F",fontSize:10,fontWeight:"800"},
  chart:{height:205,marginTop:14,flexDirection:"row-reverse",alignItems:"flex-end",gap:8},chartItem:{flex:1,height:"100%",alignItems:"center",justifyContent:"flex-end",gap:5},chartValue:{color:"#66706B",fontSize:9,fontWeight:"800"},track:{width:24,height:140,borderRadius:8,backgroundColor:"#EEF1EE",justifyContent:"flex-end",overflow:"hidden"},fill:{width:"100%",backgroundColor:"#668C7F",borderRadius:8,minHeight:4},chartDay:{color:"#9AA09C",fontSize:9},
  statusBox:{marginTop:17,padding:13,borderRadius:15,backgroundColor:"#F7F9F7",flexDirection:"row-reverse",alignItems:"center",gap:10},statusIcon:{width:42,height:42,borderRadius:13,alignItems:"center",justifyContent:"center"},statusTitle:{color:"#303735",fontSize:12,fontWeight:"900",textAlign:"right"},statusText:{color:"#7B817E",fontSize:10,lineHeight:16,marginTop:2,textAlign:"right"},infoRow:{flexDirection:"row-reverse",justifyContent:"space-between",paddingTop:12,marginTop:12,borderTopWidth:1,borderTopColor:"#F0ECE5"},infoLabel:{color:"#8A918D",fontSize:10},infoValue:{color:"#303735",fontSize:11,fontWeight:"900"},
  quickGrid:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},quick:{flex:1,minWidth:190,backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:"#E7E2D9",padding:14,flexDirection:"row-reverse",alignItems:"center",gap:10},quickIcon:{width:40,height:40,borderRadius:12,backgroundColor:"#E8F0EB",alignItems:"center",justifyContent:"center"},quickText:{color:"#303735",fontSize:12,fontWeight:"900",flex:1,textAlign:"right"},arrow:{color:"#9AA09C",fontSize:18}
});