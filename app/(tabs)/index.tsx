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
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const notificationsQuery=trpc.notifications.list.useQuery();
  const [working,setWorking]=useState(false);
  const [gpsMessage,setGpsMessage]=useState("الموقع جاهز للتحقق");
  const isCheckedOut=Boolean(todayRecord?.checkOut),isWeeklyOff=shift.kind==="weekly_off";
  const presentDays=records.filter(r=>r.status==="حاضر"||r.status==="متأخر").length;
  const unread=(notificationsQuery.data??[]).filter(n=>!n.readAt).length;
  const attendanceActionLabel = working ? "جارٍ التحقق..." : checkedIn ? "تسجيل الانصراف" : "تسجيل الحضور";
  const dateLabel=useMemo(()=>new Intl.DateTimeFormat("ar-EG",{weekday:"long",day:"numeric",month:"long"}).format(new Date()),[]);

  async function handleCheckIn(){
    if(isWeeklyOff)return;setWorking(true);
    try{const c=await getCurrentCoordinates(),d=distanceBetween(branch.latitude,branch.longitude,c.latitude,c.longitude);
      if(d>branch.radiusMeters)throw new Error(`أنت خارج نطاق الفرع بـ ${d} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      const lateMinutes=calculateLateMinutes(new Date(),shift.start,PAYROLL_RULES.graceMinutes);
      await checkIn({time:currentTime(now),distanceMeters:d,status:lateMinutes>0?"متأخر":"حاضر",lateMinutes});
      setGpsMessage(`تم التحقق من الموقع — ${d} متر من الفرع`);
      if(Platform.OS!=="web")await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }catch(e){const m=e instanceof Error?e.message:"تعذر التحقق من الموقع";setGpsMessage(m);showAlert("لم يتم تسجيل الحضور",m);}
    finally{setWorking(false);}
  }
  async function handleCheckOut(){
    setWorking(true);
    try{const c=await getCurrentCoordinates(),d=distanceBetween(branch.latitude,branch.longitude,c.latitude,c.longitude);
      if(d>branch.radiusMeters)throw new Error(`أنت خارج نطاق الفرع بـ ${d} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      await checkOut({time:currentTime(now),distanceMeters:d});setGpsMessage(`تم تسجيل الانصراف — ${d} متر من الفرع`);
    }catch(e){showAlert("تعذر تسجيل الانصراف",e instanceof Error?e.message:"حدث خطأ غير متوقع.");}
    finally{setWorking(false);}
  }

  const quick=[["الحضور","calendar","/attendance"],["الطلبات","doc.text.fill","/requests"],["الجدول","calendar","/schedule"],["التقارير","chart.bar.fill","/reports"]];

  return <ScreenContainer edges={["top","left","right"]}>
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.brand}><View style={styles.logo}><Text style={styles.logoText}>HR</Text></View><View><Text style={styles.kicker}>WORKSPACE</Text><Text style={styles.company}>نظام إدارة الموظفين</Text></View></View>
        <View style={[styles.headerRight, isMobile && styles.headerRightMobile]}><View style={styles.dateBlock}><Text style={styles.date}>{dateLabel}</Text><Text style={styles.welcome}>{role==="manager"?"مساحة الإدارة":"أهلاً، "+employee.name.split(" ")[0]}</Text></View><Pressable style={styles.bell} onPress={()=>router.push("/notifications" as never)}><IconSymbol name="notifications" size={20} color="#163A63"/>{unread>0&&<View style={styles.dot}/>}</Pressable></View>
      </View>

      <View style={[styles.hero, isMobile && styles.heroMobile]}>
        <View style={styles.heroCopy}>
          <View style={styles.live}><View style={styles.liveDot}/><Text style={styles.liveText}>النظام يعمل · اليوم</Text></View>
          <Text style={styles.heroTitle}>{role==="manager"?"نظرة واحدة على يوم فريقك.":"كل ما تحتاجه ليوم عمل مرتب."}</Text>
          <Text style={styles.heroSub}>{role==="manager"?"الحضور، الرواتب، الطلبات وأداء الفريق في مكان واحد.":role==="supervisor"?"تابع حضور الفريق وطلبات الموظفين وجدول العمل من مكان واحد.":"سجل حضورك وتابع ورديتك وراتبك وطلباتك من لوحة واحدة بسيطة."}</Text>
          <View style={[styles.heroStats, isMobile && styles.heroStatsMobile]}><View><Text style={styles.heroLabel}>الفرع</Text><Text style={styles.heroValue}>الفرع الرئيسي</Text></View><View><Text style={styles.heroLabel}>الوردية</Text><Text style={styles.heroValue}>{isWeeklyOff?"إجازة":shift.start+" — "+shift.end}</Text></View><View><Text style={styles.heroLabel}>الالتزام</Text><Text style={styles.heroValue}>92%</Text></View></View>
        </View>
        <View style={styles.attendanceCard}>
          <Text style={styles.attendanceLabel}>{isCheckedOut?"تم إنهاء الوردية":checkedIn?"الوردية جارية":"ابدأ يومك"}</Text>
          <Text style={styles.clock}>{currentTime(now)}</Text>
          <View style={styles.locationRow}><View style={styles.locationIcon}><IconSymbol name="location.fill" size={14} color="#163A63"/></View><Text style={styles.locationText}>{gpsMessage}</Text></View>
          <Pressable disabled={working||isWeeklyOff||isCheckedOut} onPress={checkedIn?handleCheckOut:handleCheckIn} style={({pressed})=>[styles.attendanceButton,(working||isWeeklyOff||isCheckedOut)&&styles.disabled,pressed&&styles.pressed]}>
            <IconSymbol name={checkedIn?"arrow.right":"checkmark"} size={17} color="#FFFFFF"/><Text style={styles.attendanceButtonText}>{attendanceActionLabel}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{role==="manager"?"لوحة الإدارة":role==="supervisor"?"لوحة الفريق":"يومك اليوم"}</Text><Text style={styles.sectionSub}>{role==="manager"?"ملخص سريع لأداء الفريق":role==="supervisor"?"متابعة سريعة لفريقك":"أهم معلومات يوم العمل في لمحة"}</Text></View></View>
      <View style={[styles.kpis, isMobile && styles.kpisMobile]}>
        <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="person.2.fill" value={String(presentDays)} label="أيام الحضور" note="هذا الشهر"/></View>
        <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="clock" value={String(payrollInputs.lateMinutes??0)} label="دقائق التأخير" note="إجمالي الشهر"/></View>
        <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="banknote" value={payroll.net.toLocaleString("ar-EG")} label="صافي الراتب" note="جنيه مصري"/></View>
        <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="notifications" value={String(unread)} label="تنبيهات جديدة" note="تحتاج مراجعة"/></View>
      </View>

      <View style={[styles.grid, isMobile && styles.gridMobile]}>
        <View style={[styles.card,styles.attendancePanel,isMobile&&styles.panelMobile]}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>أداء الحضور</Text><Text style={styles.cardMeta}>آخر 7 أيام</Text></View>
          <View style={styles.chart}>{weeklyAttendance.map((v,i)=><View key={i} style={styles.barItem}><Text style={styles.barValue}>{v}%</Text><View style={styles.barTrack}><View style={[styles.barFill,{height:(v+"%") as `${number}%`,opacity:i===6?.55:1}]}/></View><Text style={styles.barDay}>{["س","ح","ن","ث","ر","خ","ج"][i]}</Text></View>)}</View>
        </View>
        <View style={[styles.card,styles.todayPanel,isMobile&&styles.panelMobile]}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>حالة اليوم</Text><Text style={styles.cardMeta}>{dateLabel}</Text></View>
          <View style={styles.todayStatus}><View style={styles.statusCircle}><IconSymbol name={checkedIn?"checkmark":"clock"} size={22} color="#FFFFFF"/></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>{checkedIn?"الوردية جارية":"في انتظار تسجيل الحضور"}</Text><Text style={styles.statusSub}>{checkedIn?"تم التحقق من موقعك بنجاح.":"اضغط على تسجيل الحضور لبدء الوردية."}</Text></View></View>
          <View style={styles.timeRows}><TimeRow label="بداية الوردية" value={shift.start}/><TimeRow label="نهاية الوردية" value={shift.end}/></View>
        </View>
      </View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>وصول سريع</Text><Text style={styles.sectionSub}>اختصارات للمهام اليومية</Text></View></View>
      <View style={[styles.quickGrid, isMobile && styles.quickGridMobile]}>{quick.map(([label,icon,path])=><Pressable key={label} onPress={()=>router.push(path as never)} style={({pressed})=>[styles.quick,isMobile&&styles.quickMobile,pressed&&styles.pressed]}><View style={styles.quickIcon}><IconSymbol name={icon as any} size={18} color="#163A63"/></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>{label}</Text><Text style={styles.quickSub}>فتح القسم</Text></View><Text style={styles.chevron}>‹</Text></Pressable>)}</View>
    </ScrollView>
  </ScreenContainer>;
}

function Kpi({icon,value,label,note}:{icon:any;value:string;label:string;note:string}){return <View style={styles.kpi}><View style={styles.kpiTop}><View style={styles.kpiIcon}><IconSymbol name={icon} size={17} color="#163A63"/></View><View style={styles.kpiLine}/></View><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiNote}>{note}</Text></View>}
function TimeRow({label,value}:{label:string;value:string}){return <View style={styles.timeRow}><Text style={styles.timeValue}>{value}</Text><Text style={styles.timeLabel}>{label}</Text></View>}

const styles=StyleSheet.create({
  page:{30: 24,70: 24,22: 24,maxWidth:1280,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},  headerMobile:{flexDirection:"column",alignItems:"stretch",12: 24},
  headerRightMobile:{justifyContent:"space-between",width:"100%",10: 24},
  heroMobile:{flexDirection:"column",16: 24,borderRadius: 20,14: 24},
  heroStatsMobile:{flexDirection:"row-reverse",justifyContent:"space-between",8: 24,18: 24,12: 24},
  kpisMobile:{flexDirection:"row-reverse",flexWrap:"wrap",9: 24},
  kpiMobile:{minWidth:0,flexBasis:"47%"},
  panelMobile:{minWidth:0,width:"100%"},
  quickMobile:{minWidth:0,width:"100%"},
  gridMobile:{flexDirection:"column",10: 24},
  quickGridMobile:{flexDirection:"column",9: 24},

  brand:{flexDirection:"row-reverse",alignItems:"center",11: 24},logo:{width:44,height:44,borderRadius: 12,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},logoText:{color:"#fff",fontSize: 12,fontWeight:"900"},kicker:{fontSize: 10,color:"#667085",fontWeight:"900",letterSpacing:1,textAlign:"right"},company:{fontSize: 13,color:"#172033",fontWeight:"900",2: 24,textAlign:"right"},
  headerRight:{flexDirection:"row-reverse",alignItems:"center",15: 24},dateBlock:{alignItems:"flex-end"},date:{fontSize: 10,color:"#667085"},welcome:{fontSize: 12,color:"#172033",fontWeight:"800",3: 24},bell:{width:44,height:44,borderRadius: 12,borderWidth:1,borderColor:"#E4E7EC",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",position:"relative"},dot:{position:"absolute",right:8,top:8,width:7,height:7,borderRadius: 8,backgroundColor:"#163A63",borderWidth:2,borderColor:"#fff"},
  hero:{backgroundColor:"#163A63",borderRadius: 24,24: 24,flexDirection:"row-reverse",22: 24,shadowColor:"#163A63",shadowOpacity:.14,shadowRadius:20,shadowOffset:{width:0,height:8},elevation:4},heroCopy:{flex:1,5: 24},live:{flexDirection:"row-reverse",alignItems:"center",7: 24},liveDot:{width:7,height:7,borderRadius: 8,backgroundColor:"#60A5FA"},liveText:{color:"#BFD7F5",fontSize: 10,fontWeight:"800"},heroTitle:{color:"#fff",fontSize: 30,fontWeight:"900",lineHeight:38,13: 24,textAlign:"right"},heroSub:{color:"#C8D5E6",fontSize: 12,lineHeight:20,7: 24,maxWidth:650,textAlign:"right"},heroStats:{flexDirection:"row-reverse",32: 24,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.12)",24: 24,15: 24},heroLabel:{color:"#8FA9C7",fontSize: 10,textAlign:"right"},heroValue:{color:"#fff",fontSize: 12,fontWeight:"800",3: 24,textAlign:"right"},
  attendanceCard:{width:285,maxWidth:"100%",backgroundColor:"#fff",borderRadius: 20,18: 24,justifyContent:"center"},attendanceLabel:{color:"#667085",fontSize: 10,fontWeight:"800",textAlign:"right"},clock:{color:"#172033",fontSize: 30,fontWeight:"900",textAlign:"right",3: 24},locationRow:{flexDirection:"row-reverse",alignItems:"center",7: 24,7: 24},locationIcon:{width:28,height:28,borderRadius: 8,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},locationText:{color:"#667085",fontSize: 10,flex:1,textAlign:"right"},attendanceButton:{height:47,borderRadius: 12,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center",flexDirection:"row-reverse",7: 24,13: 24},attendanceButtonText:{color:"#fff",fontSize: 11,fontWeight:"900"},disabled:{backgroundColor:"#AAB8C8"},pressed:{opacity:.82,transform:[{scale:.985}]},
  sectionHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-end"},sectionTitle:{fontSize: 17,color:"#172033",fontWeight:"900",textAlign:"right"},sectionSub:{fontSize: 10,color:"#667085",3: 24,textAlign:"right"},
  kpis:{flexDirection:"row-reverse",13: 24},kpi:{flex:1,minWidth:170,backgroundColor:"#fff",borderRadius: 18,borderWidth:1,borderColor:"#E4E7EC",16: 24},kpiTop:{flexDirection:"row-reverse",alignItems:"center",8: 24},kpiIcon:{width:36,height:36,borderRadius: 12,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},kpiLine:{height:1,backgroundColor:"#F0F2F5",flex:1},kpiValue:{fontSize: 22,color:"#172033",fontWeight:"900",14: 24,textAlign:"right"},kpiLabel:{fontSize: 11,color:"#475467",fontWeight:"800",3: 24,textAlign:"right"},kpiNote:{fontSize: 10,color:"#667085",5: 24,textAlign:"right"},
  grid:{flexDirection:"row-reverse",14: 24,flexWrap:"wrap"},card:{backgroundColor:"#fff",borderRadius: 20,borderWidth:1,borderColor:"#E4E7EC",18: 24},attendancePanel:{flex:1,minWidth:420},todayPanel:{flex:1,minWidth:340},cardHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},cardTitle:{fontSize: 13,color:"#172033",fontWeight:"900",textAlign:"right"},cardMeta:{fontSize: 10,color:"#667085"},chart:{height:205,13: 24,flexDirection:"row-reverse",alignItems:"flex-end",9: 24},barItem:{flex:1,height:"100%",alignItems:"center",justifyContent:"flex-end",5: 24},barValue:{fontSize: 8,color:"#667085",fontWeight:"800"},barTrack:{width:24,height:140,backgroundColor:"#F2F4F7",borderRadius: 8,justifyContent:"flex-end",overflow:"hidden"},barFill:{width:"100%",backgroundColor:"#163A63",borderRadius: 8,minHeight:4},barDay:{fontSize: 10,color:"#667085"},
  todayStatus:{backgroundColor:"#F8FAFC",borderRadius: 16,13: 24,17: 24,flexDirection:"row-reverse",alignItems:"center",10: 24},statusCircle:{width:43,height:43,borderRadius: 12,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},statusCopy:{flex:1},statusTitle:{fontSize: 12,color:"#172033",fontWeight:"900",textAlign:"right"},statusSub:{fontSize: 10,color:"#667085",3: 24,lineHeight:15,textAlign:"right"},timeRows:{13: 24},timeRow:{flexDirection:"row-reverse",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#EAECF0",11: 24,11: 24},timeLabel:{fontSize: 10,color:"#667085"},timeValue:{fontSize: 11,color:"#172033",fontWeight:"900"},
  quickGrid:{flexDirection:"row-reverse",11: 24,flexWrap:"wrap"},quick:{flex:1,minWidth:190,backgroundColor:"#fff",borderWidth:1,borderColor:"#E4E7EC",borderRadius: 16,13: 24,flexDirection:"row-reverse",alignItems:"center",10: 24},quickIcon:{width:39,height:39,borderRadius: 12,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},quickCopy:{flex:1},quickTitle:{fontSize: 12,color:"#172033",fontWeight:"900",textAlign:"right"},quickSub:{fontSize: 10,color:"#667085",2: 24,textAlign:"right"},chevron:{fontSize: 19,color:"#667085"}
});