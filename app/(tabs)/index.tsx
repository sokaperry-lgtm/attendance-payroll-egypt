import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
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

function distanceBetween(lat1:number,lon1:number,lat2:number,lon2:number){
  const r=6371000,toRad=(v:number)=>(v*Math.PI)/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return Math.round(r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
function currentTime(date = new Date()){return new Intl.DateTimeFormat("ar-EG",{hour:"2-digit",minute:"2-digit",hour12:false}).format(date);}
type Coordinates={latitude:number;longitude:number};
function getBrowserLocation():Promise<Coordinates>{return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error("المتصفح لا يدعم تحديد الموقع."));return;}navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude}),e=>reject(new Error(e.code===e.PERMISSION_DENIED?"يجب السماح بالوصول إلى الموقع لتسجيل الحضور.":e.code===e.POSITION_UNAVAILABLE?"تعذر تحديد موقعك الحالي.":"انتهت مهلة تحديد الموقع.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0});});}
async function getCurrentCoordinates():Promise<Coordinates>{
  if(Platform.OS==="web") return getBrowserLocation();
  const permission=await Location.requestForegroundPermissionsAsync();
  if(permission.status!=="granted") throw new Error("يجب السماح بالوصول إلى الموقع لتسجيل الحضور.");
  if(!(await Location.hasServicesEnabledAsync())) throw new Error("فعّل خدمة الموقع في الهاتف ثم حاول مرة أخرى.");
  const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
  return {latitude:p.coords.latitude,longitude:p.coords.longitude};
}
const weeklyAttendance=[86,94,78,91,88,96,70];

export default function HomeScreen(){
  const {role,employee,branch,shift,payroll,payrollInputs,records,checkedIn,todayRecord,checkIn,checkOut}=useAppData();
  const router=useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (role === "manager") {
      router.replace("/manager" as never);
    }
  }, [role]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const notificationsQuery=trpc.notifications.list.useQuery();
  const [working,setWorking]=useState(false);
  const [gpsMessage,setGpsMessage]=useState("الموقع جاهز للتحقق");
  const isCheckedOut=Boolean(todayRecord?.checkOut),isWeeklyOff=shift.kind==="weekly_off";