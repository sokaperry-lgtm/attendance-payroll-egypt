import { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { showAlert } from "@/lib/alert";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { buildLastSevenDaysAttendance } from "@/lib/dashboard-utils";
import { calculateLateMinutes } from "@/lib/shift-utils";
import { trpc } from "@/lib/trpc";
import { todayKey } from "@/lib/payroll";
import { useRouter } from "expo-router";

function distanceBetween(lat1:number,lon1:number,lat2:number,lon2:number){
  const r=6371000,toRad=(v:number)=>(v*Math.PI)/180,dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return Math.round(r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
function currentTime(date = new Date()){return new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Cairo",hour:"2-digit",minute:"2-digit",hour12:false}).format(date);}
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


export default function HomeScreen(){
  const {role,employee,branch,shift,payrollInputs,records,checkedIn,todayRecord,checkIn,checkOut}=useAppData();
  const router=useRouter();
  const { width } = useWindowDimensions();
  const isMobile = width < 700;
  const isManagement = role === "owner" || role === "manager";
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const notificationsQuery=trpc.notifications.list.useQuery();
  const todayCairo = todayKey();
  const currentMonth = todayCairo.slice(0, 7);
  const teamQuery = trpc.attendance.team.useQuery(undefined, { enabled: isManagement || role === "supervisor" });
  const payrollQuery = trpc.payroll.list.useQuery({ month: currentMonth }, { enabled: isManagement });
  const selfServicePayroll = trpc.selfService.me.useQuery({ month: currentMonth }, { enabled: !isManagement });
  const managementDashboard = trpc.management.dashboard.useQuery({ month: currentMonth }, { enabled: isManagement, refetchInterval: 60000 });
  const liveAttendanceQuery = trpc.attendance.dailyOverview.useQuery({ date: todayCairo }, { enabled: isManagement, refetchInterval: 30000, retry: false });
  const liveAttendanceRows = (liveAttendanceQuery.data?.employees ?? []) as any[];
  const liveCheckedIn = liveAttendanceRows.filter((item:any) => Boolean(item.checkIn));
  const liveOpenShifts = liveAttendanceRows.filter((item:any) => Boolean(item.checkIn) && !item.checkOut);
  const liveCheckedOut = liveAttendanceRows.filter((item:any) => Boolean(item.checkOut));
  const liveNotCheckedIn = liveAttendanceRows.filter((item:any) => !item.checkIn && item.status !== "غياب" && item.status !== "إجازة" && item.status !== "مأمورية");
  const [working,setWorking]=useState(false);
  const [gpsMessage,setGpsMessage]=useState("الموقع جاهز للتحقق");
  const [attendanceConfirmed,setAttendanceConfirmed]=useState(false);
  const [attendanceFinished,setAttendanceFinished]=useState(false);
  const isCheckedOut=Boolean(todayRecord?.checkOut) || attendanceFinished;
  const effectiveCheckedIn=checkedIn || attendanceConfirmed;
  const isWeeklyOff=Boolean(shift?.kind==="weekly_off");
  const presentDays=records.filter(r=>r.status==="حاضر"||r.status==="متأخر").length;
  const trackedDays=records.filter(r=>["حاضر","متأخر","غياب"].includes(r.status)).length;
  const recordedAttendanceRate=trackedDays ? Math.round(presentDays/trackedDays*100) : 0;
  const unread=(notificationsQuery.data??[]).filter(n=>!n.readAt).length;
  const weeklyAttendance = buildLastSevenDaysAttendance(isManagement || role === "supervisor" ? teamQuery.data ?? [] : records, todayCairo);
  const teamToday = (teamQuery.data ?? []).filter((r:any) => r.date === todayCairo);
  const teamPresent = teamToday.filter((r:any) => r.status === "حاضر" || r.status === "متأخر").length;
  const teamLate = teamToday.reduce((sum:number,r:any) => sum + Number(r.lateMinutes || 0), 0);
  const teamAbsent = teamToday.filter((r:any) => r.status === "غياب").length;
  const teamCheckedOut = teamToday.filter((r:any) => Boolean(r.checkOut)).length;
  const payrollTotal = (payrollQuery.data ?? []).reduce((sum:number,r:any) => sum + Number(r.netSalary || 0), 0);
  // Employee dashboard uses the same accrued-to-date payroll figures as the "My Salary" screen.
  const selfPayroll = selfServicePayroll.data?.payroll;
  const shownPayroll = selfPayroll?.status === "approved" ? selfPayroll : selfServicePayroll.data?.livePayroll;
  const employeeNet = Number(shownPayroll?.netSalary ?? 0);
  const attendanceActionLabel = working ? "جارٍ التحقق..." : isCheckedOut ? "تم إنهاء الوردية ✓" : effectiveCheckedIn ? "تسجيل الانصراف" : "تسجيل الحضور";
  const dateLabel=useMemo(()=>new Intl.DateTimeFormat("ar-EG",{weekday:"long",day:"numeric",month:"long"}).format(new Date()),[]);

  async function handleCheckIn(){
    setWorking(true);
    try{const c=await getCurrentCoordinates(),d=distanceBetween(branch.latitude,branch.longitude,c.latitude,c.longitude);
      if(d>branch.radiusMeters)throw new Error(`أنت خارج نطاق الفرع بـ ${d} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      const lateMinutes=calculateLateMinutes(new Date(),shift.start);
      await checkIn({time:currentTime(now),latitude:c.latitude,longitude:c.longitude,status:lateMinutes>0?"متأخر":"حاضر",lateMinutes});
      setAttendanceConfirmed(true);
      setGpsMessage(`تم تسجيل الحضور بنجاح ✓ — ${d} متر من الفرع`);
      showAlert("تم تسجيل الحضور ✓", "تم تسجيل حضورك بنجاح. يمكنك الآن تسجيل الانصراف في نهاية الوردية.");
      if(Platform.OS!=="web")await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }catch(e){const m=e instanceof Error?e.message:"تعذر التحقق من الموقع";setGpsMessage(m);showAlert("لم يتم تسجيل الحضور",m);}
    finally{setWorking(false);}
  }
  async function handleCheckOut(){
    setWorking(true);
    try{const c=await getCurrentCoordinates(),d=distanceBetween(branch.latitude,branch.longitude,c.latitude,c.longitude);
      if(d>branch.radiusMeters)throw new Error(`أنت خارج نطاق الفرع بـ ${d} متر. يجب أن تكون داخل ${branch.radiusMeters} متر.`);
      await checkOut({time:currentTime(now),latitude:c.latitude,longitude:c.longitude});
      setAttendanceFinished(true);
      setGpsMessage(`تم تسجيل الانصراف بنجاح ✓ — ${d} متر من الفرع`);
      showAlert("تم تسجيل الانصراف ✓", "تم إنهاء ورديتك وتسجيل وقت الانصراف بنجاح.");

    }catch(e){showAlert("تعذر تسجيل الانصراف",e instanceof Error?e.message:"حدث خطأ غير متوقع.");}
    finally{setWorking(false);}
  }

  const quick=isManagement
    ? [["الحضور","calendar","/attendance"],["الطلبات","doc.text.fill","/requests"],["التقارير","chart.bar.fill","/reports"],["الرواتب","banknote","/payroll"]]
    : role==="supervisor"
      ? [["الحضور","calendar","/attendance"],["الطلبات","doc.text.fill","/requests"],["الجدول","calendar","/schedule"],["الفريق","person.2.fill","/team"]]
      : [["الحضور","calendar","/attendance"],["الطلبات","doc.text.fill","/requests"],["الجدول","calendar","/schedule"],["الإشعارات","notifications","/notifications"]];
  const workspaceItems = isManagement
    ? [["حالة الفريق","مستقر","person.2.fill"],["الطلبات",unread+" جديدة","doc.text.fill"],["الرواتب","هذا الشهر","banknote"]]
    : role==="supervisor"
      ? [["حضور الفريق",presentDays+" سجل","person.2.fill"],["الطلبات",unread+" تحتاج مراجعة","doc.text.fill"],["الحضور المسجل",recordedAttendanceRate+"%","calendar"]]
      : [["وردية اليوم",isWeeklyOff?"إجازة":shift.start+" — "+shift.end,"calendar"],["الحضور",checkedIn?"مسجل الآن":"لم يُسجل بعد","checkmark"],["الراتب",employeeNet.toLocaleString("ar-EG")+" EGP","banknote"]];

  return <ScreenContainer edges={["top","left","right"]}>
    <ScrollView contentContainerStyle={[styles.page, isMobile && styles.pageMobile]} showsVerticalScrollIndicator={false}>
      <View style={[styles.header, isMobile && styles.headerMobile]}>
        <View style={styles.brand}><View style={styles.logo}><IconSymbol name="fingerprint" size={25} color="#FFFFFF" /></View><View><Text style={styles.kicker}>WORKSPACE</Text><Text style={styles.company}>نظام إدارة الموظفين</Text></View><Image source={require("../../assets/images/dalla-karak-logo.png")} style={styles.dallaLogo} resizeMode="contain" accessibilityLabel="شعار دلة كرك" /></View>
        <View style={[styles.headerRight, isMobile && styles.headerRightMobile]}><View style={styles.dateBlock}><Text style={styles.date}>{dateLabel}</Text><Text style={styles.welcome}>{isManagement?"مساحة الإدارة":"أهلاً، "+employee.name.split(" ")[0]}</Text></View><Pressable style={styles.bell} onPress={()=>router.push("/notifications" as never)}><IconSymbol name="notifications" size={20} color="#75282E"/>{unread>0&&<View style={styles.dot}/>}</Pressable></View>
      </View>

      <View style={[styles.hero, isMobile && styles.heroMobile]}>
        <View style={styles.heroCopy}>
          <View style={styles.live}><View style={styles.liveDot}/><Text style={styles.liveText}>النظام يعمل · اليوم</Text></View>
          <Text style={styles.heroTitle}>{isManagement?"نظرة واحدة على يوم فريقك.":"كل ما تحتاجه ليوم عمل مرتب."}</Text>
          <Text style={styles.heroSub}>{isManagement?"الحضور، الرواتب، الطلبات وأداء الفريق في مكان واحد.":role==="supervisor"?"تابع حضور الفريق وطلبات الموظفين وجدول العمل من مكان واحد.":"سجل حضورك وتابع ورديتك وراتبك وطلباتك من لوحة واحدة بسيطة."}</Text>
          <View style={[styles.heroStats, isMobile && styles.heroStatsMobile]}><View><Text style={styles.heroLabel}>الفرع</Text><Text style={styles.heroValue}>الفرع الرئيسي</Text></View><View><Text style={styles.heroLabel}>الوردية</Text><Text style={styles.heroValue}>{isWeeklyOff?"إجازة":shift.start+" — "+shift.end}</Text></View><View><Text style={styles.heroLabel}>الالتزام</Text><Text style={styles.heroValue}>{recordedAttendanceRate}%</Text></View></View>
        </View>
        <View style={styles.attendanceCard}>
          <Text style={styles.attendanceLabel}>{isCheckedOut?"تم إنهاء الوردية":effectiveCheckedIn?"الوردية جارية":"ابدأ يومك"}</Text>
          <Text style={styles.clock}>{currentTime(now)}</Text>
          <View style={styles.locationRow}><View style={styles.locationIcon}><IconSymbol name="location.fill" size={14} color="#75282E"/></View><Text style={styles.locationText}>{gpsMessage}</Text></View>
          <Pressable disabled={working||isCheckedOut} onPress={effectiveCheckedIn?handleCheckOut:handleCheckIn} style={({pressed})=>[styles.attendanceButton,(working||isCheckedOut)&&styles.disabled,pressed&&styles.pressed]}>
            <IconSymbol name={effectiveCheckedIn?"arrow.right":"checkmark"} size={17} color="#FFFFFF"/><Text style={styles.attendanceButtonText}>{attendanceActionLabel}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.sectionHeader,isManagement&&styles.hidden]}><View><Text style={styles.sectionTitle}>{isManagement?"لوحة الإدارة":role==="supervisor"?"لوحة الفريق":"يومك اليوم"}</Text><Text style={styles.sectionSub}>{isManagement?"ملخص سريع لأداء الفريق":role==="supervisor"?"متابعة سريعة لفريقك":"أهم معلومات يوم العمل في لمحة"}</Text></View><View style={styles.sectionBadge}><View style={styles.sectionBadgeDot}/><Text style={styles.sectionBadgeText}>محدث الآن</Text></View></View>
      <View style={[styles.kpis, isMobile && styles.kpisMobile,isManagement&&styles.hidden]}>
        {isManagement ? <>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="person.2.fill" value={String(teamPresent)} label="حضور الفريق" note="اليوم"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="clock" value={String(teamLate)} label="دقائق التأخير" note="اليوم"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="banknote" value={payrollTotal.toLocaleString("ar-EG")} label="إجمالي صافي الرواتب" note="هذا الشهر"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="notifications" value={String(unread)} label="تنبيهات" note="تحتاج مراجعة"/></View>
        </> : role==="supervisor" ? <>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="person.2.fill" value={String(teamPresent)} label="حضور الفريق" note="اليوم"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="clock" value={String(teamLate)} label="دقائق التأخير" note="اليوم"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="doc.text.fill" value={String(unread)} label="طلبات وتنبيهات" note="تحتاج مراجعة"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="calendar" value={`${teamToday.length ? Math.round((teamPresent / teamToday.length) * 100) : 0}%`} label="نسبة الحضور" note="اليوم"/></View>
        </> : <>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="calendar" value={isWeeklyOff?"إجازة":shift.start} label="وردية اليوم" note={isWeeklyOff?"راحة أسبوعية":"بداية الوردية"}/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="checkmark" value={checkedIn?"جاري":"بانتظارك"} label="حالة الحضور" note={checkedIn?"تم تسجيل الدخول":"سجل حضورك لبدء اليوم"}/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="banknote" value={employeeNet.toLocaleString("ar-EG")} label="صافي الراتب" note="جنيه مصري"/></View>
          <View style={isMobile ? styles.kpiMobile : undefined}><Kpi icon="notifications" value={String(unread)} label="تنبيهاتك" note="تحتاج انتباهك"/></View>
        </>}
      </View>

      {isManagement ? <View style={[styles.executiveGrid,styles.hidden]}>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>نبض الفريق</Text><Text style={styles.cardMeta}>اليوم</Text></View><View style={styles.pulseRow}><View style={styles.pulseRing}><Text style={styles.pulseValue}>{teamToday.length ? Math.round((teamPresent / teamToday.length) * 100) : 0}%</Text></View><View style={styles.pulseCopy}><Text style={styles.pulseTitle}>{teamPresent > 0 ? "الحضور مستقر" : "بانتظار بيانات الحضور"}</Text><Text style={styles.pulseSub}>مؤشر مبني على سجلات الحضور الحالية</Text></View></View><View style={styles.miniMetric}><Text style={styles.miniValue}>{teamToday.length}</Text><Text style={styles.miniLabel}>سجل اليوم</Text></View></View>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>ملخص الرواتب</Text><Text style={styles.cardMeta}>هذا الشهر</Text></View><View style={styles.payrollTotal}><Text style={styles.payrollCurrency}>EGP</Text><Text style={styles.payrollValue}>{payrollTotal.toLocaleString("ar-EG")}</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>صافي المستحق</Text><Text style={styles.payrollStatus}>{payrollQuery.data?.length ? "محدث" : "لا توجد بيانات"}</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>التأخير</Text><Text style={styles.payrollText}>{teamLate} دقيقة</Text></View></View>
      </View> : role==="supervisor" ? <View style={styles.executiveGrid}>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>Team Operations</Text><Text style={styles.cardMeta}>اليوم</Text></View><View style={styles.pulseRow}><View style={styles.pulseRing}><Text style={styles.pulseValue}>{Math.min(100,Math.round((presentDays/Math.max(records.length,1))*100))}%</Text></View><View style={styles.pulseCopy}><Text style={styles.pulseTitle}>متابعة تشغيل الفريق</Text><Text style={styles.pulseSub}>راجع الحضور والتأخير والطلبات قبل نهاية الوردية.</Text></View></View><View style={styles.miniMetric}><Text style={styles.miniValue}>{unread}</Text><Text style={styles.miniLabel}>طلبات تحتاج مراجعة</Text></View></View>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>نسبة الحضور المسجل</Text><Text style={styles.cardMeta}>مؤشر تشغيلي</Text></View><View style={styles.payrollTotal}><Text style={styles.payrollCurrency}>%</Text><Text style={styles.payrollValue}>{recordedAttendanceRate}</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>الحضور المسجل</Text><Text style={styles.payrollStatus}>{presentDays} سجل</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>التأخير</Text><Text style={styles.payrollText}>{payrollInputs.lateMinutes??0} دقيقة</Text></View></View>
      </View> : <View style={styles.executiveGrid}>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>Personal Workday</Text><Text style={styles.cardMeta}>اليوم</Text></View><View style={styles.pulseRow}><View style={styles.pulseRing}><Text style={styles.pulseValue}>{checkedIn?"ON":"OFF"}</Text></View><View style={styles.pulseCopy}><Text style={styles.pulseTitle}>{checkedIn?"وردية جارية الآن":"لم يبدأ يوم العمل"}</Text><Text style={styles.pulseSub}>{isWeeklyOff?"اليوم راحتك الأسبوعية؛ إذا عملت يُحسب بيومين":"سجل حضورك وتابع وقت الوردية من هنا."}</Text></View></View><View style={styles.miniMetric}><Text style={styles.miniValue}>{shift.start+" — "+shift.end}</Text><Text style={styles.miniLabel}>ساعات الوردية</Text></View></View>
        <View style={styles.executiveCard}><View style={styles.cardHeader}><Text style={styles.cardTitle}>ملخصك المالي</Text><Text style={styles.cardMeta}>هذا الشهر</Text></View><View style={styles.payrollTotal}><Text style={styles.payrollCurrency}>EGP</Text><Text style={styles.payrollValue}>{employeeNet.toLocaleString("ar-EG")}</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>صافي الراتب</Text><Text style={styles.payrollStatus}>محدث</Text></View><View style={styles.payrollRow}><Text style={styles.payrollLabel}>التأخير</Text><Text style={styles.payrollText}>{payrollInputs.lateMinutes??0} دقيقة</Text></View></View>
      </View>}

      <View style={[styles.insightStrip, isMobile && styles.insightStripMobile,isManagement&&styles.hidden]}>
        <Insight icon="person.2.fill" value={String(teamPresent)} label={isManagement || role === "supervisor" ? "حاضر اليوم" : "أيام حضورك"} meta={isManagement || role === "supervisor" ? `${teamToday.length} سجل اليوم` : `${presentDays} سجل`} />
        <Insight icon="clock" value={String(teamLate)} label="التأخير" meta="دقائق مسجلة اليوم" />
        <Insight icon="checkmark" value={String(teamCheckedOut)} label="أنهوا الوردية" meta="تسجيل انصراف" />
        {isManagement ? <Insight icon="banknote" value={payrollTotal.toLocaleString("ar-EG")} label="صافي الرواتب" meta="هذا الشهر" /> : <Insight icon="notifications" value={String(unread)} label="التنبيهات" meta="تحتاج انتباهك" />}
      </View>

      {isManagement && <View style={styles.commandCenter}>
        <View style={styles.commandWelcome}>
          <View style={styles.commandWelcomeCopy}>
            <Text style={styles.commandEyebrow}>DALLA KARAK · MANAGEMENT</Text>
            <Text style={styles.commandWelcomeTitle}>مركز قيادة دلة كرك</Text>
            <Text style={styles.commandWelcomeSub}>كل تفاصيل التشغيل المهمة في شاشة واحدة، لمتابعة يومك واتخاذ القرار بسرعة.</Text>
          </View>
          <View style={styles.commandDate}><Text style={styles.commandDateLabel}>تاريخ اليوم</Text><Text style={styles.commandDateValue}>{dateLabel}</Text><View style={styles.commandLive}><View style={styles.commandLiveDot}/><Text style={styles.commandLiveText}>تحديث مباشر</Text></View></View>
        </View>

        <View style={[styles.commandKpis,isMobile&&styles.commandKpisMobile]}>
          <View style={[styles.commandKpi,styles.commandKpiPrimary]}><Text style={styles.commandKpiLabel}>حضور اليوم</Text><Text style={styles.commandKpiValue}>{teamPresent}</Text><Text style={styles.commandKpiNote}>من {managementDashboard.data?.team.total ?? teamToday.length} سجل متاح</Text></View>
          <View style={styles.commandKpi}><Text style={styles.commandKpiLabel}>حالات الغياب</Text><Text style={styles.commandKpiValue}>{managementDashboard.data?.team.absent ?? teamAbsent}</Text><Text style={styles.commandKpiNote}>مسجلة اليوم</Text></View>
          <View style={styles.commandKpi}><Text style={styles.commandKpiLabel}>دقائق التأخير</Text><Text style={styles.commandKpiValue}>{managementDashboard.data?.team.lateMinutes ?? teamLate}</Text><Text style={styles.commandKpiNote}>إجمالي الفريق اليوم</Text></View>
          <View style={styles.commandKpi}><Text style={styles.commandKpiLabel}>ورديات مفتوحة</Text><Text style={styles.commandKpiValue}>{managementDashboard.data?.team.openShifts ?? Math.max(0,teamPresent-teamCheckedOut)}</Text><Text style={styles.commandKpiNote}>بانتظار تسجيل الانصراف</Text></View>
        </View>

        <View style={[styles.commandMainGrid,isMobile&&styles.commandMainGridMobile]}>
          <View style={[styles.commandPanel,styles.commandAttendancePanel]}>
            <View style={styles.commandPanelHead}><View><Text style={styles.commandPanelTitle}>مؤشر حضور الفريق</Text><Text style={styles.commandPanelSub}>نسبة الحضور المسجلة اليوم</Text></View><View style={styles.commandPanelIcon}><IconSymbol name="person.2.fill" size={19} color="#75282E"/></View></View>
            <View style={styles.commandAttendanceBody}>
              <View style={styles.commandRing}><Text style={styles.commandRingValue}>{managementDashboard.data?.team.attendanceRate ?? (teamToday.length?Math.round(teamPresent/teamToday.length*100):0)}%</Text><Text style={styles.commandRingLabel}>نسبة الحضور</Text></View>
              <View style={styles.commandLegend}>
                <View style={styles.commandLegendRow}><View style={[styles.commandLegendDot,{backgroundColor:"#B8794A"}]}/><Text style={styles.commandLegendLabel}>حاضر</Text><Text style={styles.commandLegendValue}>{managementDashboard.data?.team.present ?? teamPresent}</Text></View>
                <View style={styles.commandLegendRow}><View style={[styles.commandLegendDot,{backgroundColor:"#A84B50"}]}/><Text style={styles.commandLegendLabel}>غائب</Text><Text style={styles.commandLegendValue}>{managementDashboard.data?.team.absent ?? teamAbsent}</Text></View>
                <View style={styles.commandLegendRow}><View style={[styles.commandLegendDot,{backgroundColor:"#C9B9A7"}]}/><Text style={styles.commandLegendLabel}>لم يسجل اليوم</Text><Text style={styles.commandLegendValue}>{Math.max(0,Number(managementDashboard.data?.team.total ?? teamToday.length)-teamPresent-teamAbsent)}</Text></View>
              </View>
            </View>
            <View style={styles.commandProgressTrack}><View style={[styles.commandProgressFill,{width:`${Math.min(100,Math.max(0,managementDashboard.data?.team.attendanceRate ?? (teamToday.length?Math.round(teamPresent/teamToday.length*100):0)))}%`} as any]}/></View>
            <Pressable style={styles.commandTextAction} onPress={()=>router.push("/attendance" as never)}><Text style={styles.commandTextActionLabel}>عرض سجل الحضور بالكامل</Text><Text style={styles.commandTextActionArrow}>←</Text></Pressable>
          </View>

          <View style={styles.commandPanel}>
            <View style={styles.commandPanelHead}><View><Text style={styles.commandPanelTitle}>طلبات تنتظر قرارك</Text><Text style={styles.commandPanelSub}>طلبات الموظفين التي تحتاج مراجعة</Text></View><View style={styles.commandPanelIcon}><IconSymbol name="doc.text.fill" size={19} color="#75282E"/></View></View>
            <View style={styles.commandRequestCount}><Text style={styles.commandRequestValue}>{managementDashboard.data?.requests.pending ?? 0}</Text><Text style={styles.commandRequestLabel}>طلب معلق</Text></View>
            <Text style={styles.commandMuted}>راجع الطلبات واتخذ الإجراء المناسب من مكان واحد.</Text>
            <Pressable style={styles.commandPrimaryAction} onPress={()=>router.push("/requests" as never)}><Text style={styles.commandPrimaryActionText}>فتح الطلبات</Text><Text style={styles.commandPrimaryActionArrow}>←</Text></Pressable>
          </View>

          <View style={styles.commandPanel}>
            <View style={styles.commandPanelHead}><View><Text style={styles.commandPanelTitle}>ملخص الرواتب</Text><Text style={styles.commandPanelSub}>إجمالي صافي رواتب الشهر الحالي</Text></View><View style={styles.commandPanelIcon}><IconSymbol name="banknote" size={19} color="#75282E"/></View></View>
            <Text style={styles.commandPayrollValue}>{Number(managementDashboard.data?.payroll.total ?? payrollTotal).toLocaleString("ar-EG")} <Text style={styles.commandPayrollCurrency}>ج.م</Text></Text>
            <View style={styles.commandPayrollMeta}><Text style={styles.commandMuted}>عدد السجلات</Text><Text style={styles.commandPayrollMetaValue}>{managementDashboard.data?.payroll.rows ?? payrollQuery.data?.length ?? 0}</Text></View>
            <View style={styles.commandPayrollMeta}><Text style={styles.commandMuted}>السجلات المعتمدة</Text><Text style={styles.commandPayrollMetaValue}>{managementDashboard.data?.payroll.approved ?? 0}</Text></View>
            <Pressable style={styles.commandTextAction} onPress={()=>router.push("/payroll" as never)}><Text style={styles.commandTextActionLabel}>الانتقال إلى الرواتب</Text><Text style={styles.commandTextActionArrow}>←</Text></Pressable>
          </View>
        </View>

        <View style={[styles.commandPanel, { marginTop: 12 }]}>
          <View style={styles.commandPanelHead}>
            <View><Text style={styles.commandPanelTitle}>حركة الموظفين الآن</Text><Text style={styles.commandPanelSub}>تحديث تلقائي كل 30 ثانية · اليوم</Text></View>
            <View style={styles.commandPanelIcon}><IconSymbol name="clock" size={19} color="#75282E"/></View>
          </View>
          <View style={styles.liveAttendanceSummary}>
            <View style={styles.liveAttendanceMetric}><Text style={styles.liveAttendanceNumber}>{liveCheckedIn.length}</Text><Text style={styles.liveAttendanceLabel}>سجلوا حضور</Text></View>
            <View style={styles.liveAttendanceMetric}><Text style={styles.liveAttendanceNumber}>{liveOpenShifts.length}</Text><Text style={styles.liveAttendanceLabel}>داخل الوردية</Text></View>
            <View style={styles.liveAttendanceMetric}><Text style={styles.liveAttendanceNumber}>{liveCheckedOut.length}</Text><Text style={styles.liveAttendanceLabel}>سجلوا انصراف</Text></View>
            <View style={styles.liveAttendanceMetric}><Text style={styles.liveAttendanceNumber}>{liveNotCheckedIn.length}</Text><Text style={styles.liveAttendanceLabel}>لم يسجلوا</Text></View>
          </View>
          {liveAttendanceQuery.isLoading ? <View style={styles.commandEmpty}><Text style={styles.commandMuted}>جاري تحميل حركة الموظفين...</Text></View> :
            liveAttendanceRows.length ? liveAttendanceRows.slice(0, 8).map((item:any) => {
              const hasIn = Boolean(item.checkIn);
              const hasOut = Boolean(item.checkOut);
              const stateLabel = hasOut ? "أنهى الوردية" : hasIn ? "داخل الوردية" : item.status === "غياب" ? "غياب" : item.status === "إجازة" ? "إجازة" : item.status === "مأمورية" ? "مأمورية" : "لم يسجل";
              const stateColor = hasOut ? "#8C7865" : hasIn ? "#9A6737" : item.status === "غياب" ? "#A84B50" : "#9C8978";
              return <View key={String(item.staffAccountId)} style={styles.liveAttendanceRow}>
                <View style={[styles.liveAttendanceDot,{backgroundColor:stateColor}]}/>
                <View style={styles.liveAttendanceCopy}>
                  <Text style={styles.liveAttendanceName}>{item.name || "موظف"}</Text>
                  <Text style={styles.liveAttendanceMeta}>{item.checkIn ? "حضور "+item.checkIn : "لم يسجل حضور"}{item.checkOut ? " · انصراف "+item.checkOut : ""}</Text>
                </View>
                <Text style={[styles.liveAttendanceState,{color:stateColor}]}>{stateLabel}</Text>
              </View>;
            }) : <View style={styles.commandEmpty}><Text style={styles.commandEmptyTitle}>لا توجد سجلات حركة اليوم</Text><Text style={styles.commandMuted}>ستظهر بيانات الموظفين هنا بمجرد تسجيل الحضور.</Text></View>}
          {liveAttendanceRows.length > 8 && <Text style={styles.commandMuted}>يعرض أول 8 موظفين · افتح سجل الحضور لعرض الجميع</Text>}
          <Pressable style={styles.commandTextAction} onPress={()=>router.push("/attendance" as never)}><Text style={styles.commandTextActionLabel}>فتح سجل الحضور والانصراف</Text><Text style={styles.commandTextActionArrow}>←</Text></Pressable>
        </View>

        <View style={[styles.commandLowerGrid,isMobile&&styles.commandMainGridMobile]}>
          <View style={[styles.commandPanel,styles.commandWidePanel]}>
            <View style={styles.commandPanelHead}><View><Text style={styles.commandPanelTitle}>حالات تحتاج متابعة</Text><Text style={styles.commandPanelSub}>الموظفون الأعلى في دقائق التأخير اليوم</Text></View><View style={styles.commandPanelIcon}><IconSymbol name="clock" size={19} color="#75282E"/></View></View>
            {(managementDashboard.data?.lateEmployees?.length ?? 0)>0 ? managementDashboard.data!.lateEmployees.slice(0,5).map((item:any)=><View key={String(item.id)} style={styles.commandLateRow}><View style={styles.commandLateMinutes}><Text style={styles.commandLateMinutesText}>{item.minutes} د</Text></View><View style={styles.commandLateCopy}><Text style={styles.commandLateName}>{item.name}</Text><Text style={styles.commandLateStatus}>{item.status} · يحتاج متابعة</Text></View><IconSymbol name="chevron.left" size={15} color="#B7A89A"/></View>) : <View style={styles.commandEmpty}><IconSymbol name="checkmark.circle" size={25} color="#B8794A"/><Text style={styles.commandEmptyTitle}>لا توجد حالات تأخير مسجلة</Text><Text style={styles.commandMuted}>الفريق بدون حالات تأخير تحتاج متابعة في السجلات الحالية.</Text></View>}
          </View>
          <View style={styles.commandPanel}>
            <View style={styles.commandPanelHead}><View><Text style={styles.commandPanelTitle}>توزيع الفريق</Text><Text style={styles.commandPanelSub}>عدد الموظفين حسب القسم</Text></View><View style={styles.commandPanelIcon}><IconSymbol name="chart.bar.fill" size={19} color="#75282E"/></View></View>
            {(managementDashboard.data?.departments?.length ?? 0)>0 ? managementDashboard.data!.departments.slice(0,5).map((item:any)=><View key={item.name} style={styles.commandDepartmentRow}><View style={styles.commandDepartmentTop}><Text style={styles.commandDepartmentName}>{item.name}</Text><Text style={styles.commandDepartmentCount}>{item.count}</Text></View><View style={styles.commandDepartmentTrack}><View style={[styles.commandDepartmentFill,{width:`${Math.min(100,item.count/Math.max(1,managementDashboard.data!.team.total)*100)}%`} as any]}/></View></View>) : <View style={styles.commandEmpty}><Text style={styles.commandEmptyTitle}>لا توجد أقسام مسجلة</Text><Text style={styles.commandMuted}>أضف الأقسام من بيانات الموظفين لعرض التوزيع.</Text></View>}
          </View>
        </View>
      </View>}
      <View style={[styles.smartCard,isManagement&&styles.hidden]}>
        <View style={styles.smartHeader}>
          <View><Text style={styles.smartEyebrow}>SMART INSIGHTS</Text><Text style={styles.smartTitle}>مؤشرات ذكية من بيانات اليوم</Text></View>
          <View style={styles.smartBadge}><IconSymbol name="sparkles" size={14} color="#75282E" /><Text style={styles.smartBadgeText}>تحليل تلقائي</Text></View>
        </View>
        <View style={[styles.smartGrid, isMobile && styles.smartGridMobile]}>
          {isManagement ? <>
            <SmartInsight icon="clock" title={teamLate >= 60 ? "التأخير يحتاج متابعة" : "التأخير تحت السيطرة"} text={teamLate >= 60 ? `إجمالي التأخير وصل إلى ${teamLate} دقيقة اليوم.` : `إجمالي التأخير اليوم ${teamLate} دقيقة فقط.`} />
            <SmartInsight icon="person.2.fill" title={teamAbsent > 0 ? "يوجد غياب اليوم" : "لا يوجد غياب مسجل"} text={teamAbsent > 0 ? `${teamAbsent} موظف مسجل كغياب اليوم.` : "كل السجلات الحالية لا تحتوي على غياب."} />
            <SmartInsight icon="checkmark" title={teamCheckedOut < teamPresent && teamPresent > 0 ? "هناك ورديات مفتوحة" : "الانصرافات متابَعة"} text={teamCheckedOut < teamPresent && teamPresent > 0 ? `${teamPresent-teamCheckedOut} وردية ما زالت مفتوحة.` : "الانصرافات المسجلة متوافقة مع الحضور الحالي."} />
          </> : role === "supervisor" ? <>
            <SmartInsight icon="clock" title={teamLate > 30 ? "راجع التأخير" : "التأخير محدود"} text={`إجمالي التأخير المسجل لفريقك اليوم: ${teamLate} دقيقة.`} />
            <SmartInsight icon="doc.text.fill" title={unread > 0 ? "طلبات تحتاج انتباه" : "لا توجد تنبيهات جديدة"} text={unread > 0 ? `${unread} تنبيه/طلب غير مقروء.` : "لا توجد تنبيهات غير مقروءة حالياً."} />
          </> : <>
            <SmartInsight icon="checkmark" title={checkedIn ? "يومك بدأ" : "ابدأ يومك"} text={checkedIn ? "تم تسجيل حضورك ويمكنك متابعة الوردية من النظام." : "سجل حضورك من زر الحضور لبدء متابعة يوم العمل."} />
            <SmartInsight icon="notifications" title={unread > 0 ? "لديك تنبيهات" : "كل شيء هادئ"} text={unread > 0 ? `لديك ${unread} تنبيه غير مقروء.` : "لا توجد تنبيهات غير مقروءة حالياً."} />
          </>}
        </View>
      </View>

      <View style={[styles.grid, isMobile && styles.gridMobile,isManagement&&styles.hidden]}>
        <View style={[styles.card,styles.attendancePanel,isMobile&&styles.panelMobile]}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>أداء الحضور</Text><Text style={styles.cardMeta}>آخر 7 أيام</Text></View>
          <View style={styles.chart}>{weeklyAttendance.map((day,i)=><View key={day.date} style={styles.barItem}><Text style={styles.barValue}>{day.value === null ? "—" : `${day.value}%`}</Text><View style={styles.barTrack}><View style={[styles.barFill,{height:((day.value ?? 0)+"%") as `${number}%`,opacity:i===6?.55:1}]}/></View><Text style={styles.barDay}>{day.label}</Text></View>)}</View>
        </View>
        <View style={[styles.card,styles.todayPanel,isMobile&&styles.panelMobile]}>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>حالة اليوم</Text><Text style={styles.cardMeta}>{dateLabel}</Text></View>
          <View style={styles.todayStatus}><View style={styles.statusCircle}><IconSymbol name={checkedIn?"checkmark":"clock"} size={22} color="#FFFFFF"/></View><View style={styles.statusCopy}><Text style={styles.statusTitle}>{checkedIn?"الوردية جارية":"في انتظار تسجيل الحضور"}</Text><Text style={styles.statusSub}>{checkedIn?"تم التحقق من موقعك بنجاح.":"اضغط على تسجيل الحضور لبدء الوردية."}</Text></View></View>
          <View style={styles.timeRows}><TimeRow label="بداية الوردية" value={shift.start}/><TimeRow label="نهاية الوردية" value={shift.end}/></View>
        </View>
      </View>

      <View style={[styles.workspaceGrid,isManagement&&styles.hidden]}>{workspaceItems.map(([label,value,icon])=>{const content=<><View style={styles.workspaceIcon}><IconSymbol name={icon as any} size={17} color="#75282E"/></View><View style={styles.workspaceCopy}><Text style={styles.workspaceLabel}>{label}</Text><Text style={styles.workspaceValue}>{value}</Text></View><Text style={styles.workspaceChevron}>‹</Text></>;return label==="الراتب" ? <Pressable key={label} onPress={()=>router.push("/payroll" as never)} accessibilityRole="button" accessibilityLabel="عرض تفاصيل الراتب" style={({pressed})=>[styles.workspaceCard,pressed&&styles.pressed]}>{content}</Pressable> : <View key={label} style={styles.workspaceCard}>{content}</View>;})}</View><View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>وصول سريع</Text><Text style={styles.sectionSub}>اختصارات للمهام اليومية</Text></View></View>
      <View style={[styles.quickGrid, isMobile && styles.quickGridMobile]}>{quick.map(([label,icon,path])=><Pressable key={label} onPress={()=>router.push(path as never)} style={({pressed})=>[styles.quick,isMobile&&styles.quickMobile,pressed&&styles.pressed]}><View style={styles.quickIcon}><IconSymbol name={icon as any} size={18} color="#75282E"/></View><View style={styles.quickCopy}><Text style={styles.quickTitle}>{label}</Text><Text style={styles.quickSub}>فتح القسم</Text></View><Text style={styles.chevron}>‹</Text></Pressable>)}</View>
    </ScrollView>
  </ScreenContainer>;
}

function DashStat({value,label}:{value:string;label:string}){return <View style={styles.dashStat}><Text style={styles.dashStatValue}>{value}</Text><Text style={styles.dashStatLabel}>{label}</Text></View>}

function Insight({ icon, value, label, meta }: { icon: any; value: string; label: string; meta: string }) {
  return <View style={styles.insightItem}>
    <View style={styles.insightIcon}><IconSymbol name={icon} size={16} color="#75282E" /></View>
    <View style={styles.insightCopy}><Text style={styles.insightValue}>{value}</Text><Text style={styles.insightLabel}>{label}</Text><Text style={styles.insightMeta}>{meta}</Text></View>
  </View>;
}

function SmartInsight({ icon, title, text }: { icon: any; title: string; text: string }) {
  return <View style={styles.smartItem}><View style={styles.smartIcon}><IconSymbol name={icon} size={15} color="#75282E" /></View><View style={styles.smartCopy}><Text style={styles.smartItemTitle}>{title}</Text><Text style={styles.smartItemText}>{text}</Text></View></View>;
}

function Kpi({icon,value,label,note}:{icon:any;value:string;label:string;note:string}){return <View style={styles.kpi}><View style={styles.kpiTop}><View style={styles.kpiIcon}><IconSymbol name={icon} size={17} color="#75282E"/></View><View style={styles.kpiLine}/></View><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiNote}>{note}</Text></View>}
function TimeRow({label,value}:{label:string;value:string}){return <View style={styles.timeRow}><Text style={styles.timeValue}>{value}</Text><Text style={styles.timeLabel}>{label}</Text></View>}

const styles=StyleSheet.create({
  managementPanel:{backgroundColor:"#FFFDF8",borderRadius:22,borderWidth:1,borderColor:"#E9DED0",padding:18,gap:12},
  managementHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-start",gap:12},
  managementEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#98A2B3",textAlign:"right"},
  managementTitle:{fontSize:19,fontWeight:"900",color:"#332A26",marginTop:3,textAlign:"right"},
  managementSub:{fontSize:9,color:"#806F68",marginTop:4,textAlign:"right"},
  managementLive:{flexDirection:"row-reverse",alignItems:"center",gap:6,paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:"#ECFDF3"},
  managementLiveDot:{width:6,height:6,borderRadius:3,backgroundColor:"#16A34A"},
  managementLiveText:{fontSize:9,fontWeight:"900",color:"#15803D"},
  managementGrid:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},
  managementGridMobile:{flexDirection:"column"},
  managementMainCard:{flex:1,minWidth:260,backgroundColor:"#FFFFFF",borderRadius:16,borderWidth:1,borderColor:"#E9DED0",padding:14},
  managementStats:{flexDirection:"row-reverse",gap:8,marginTop:14,flexWrap:"wrap"},
  dashStat:{flex:1,minWidth:65,backgroundColor:"#F8FAFC",borderRadius:12,padding:10},
  dashStatValue:{fontSize:17,fontWeight:"900",color:"#75282E",textAlign:"right"},
  dashStatLabel:{fontSize:8,color:"#98A2B3",marginTop:2,textAlign:"right"},
  attendanceProgress:{marginTop:14},
  attendanceProgressHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  managementPercent:{fontSize:13,fontWeight:"900",color:"#75282E"},
  managementSmallLabel:{fontSize:9,color:"#98A2B3"},
  progressTrack:{height:8,borderRadius:5,backgroundColor:"#F0E5D9",overflow:"hidden",marginTop:7},
  progressFill:{height:"100%",borderRadius:5,backgroundColor:"#75282E"},
  commandMetric:{marginTop:16},
  commandMetricValue:{fontSize:24,fontWeight:"900",color:"#332A26",textAlign:"right"},
  commandMetricLabel:{fontSize:9,color:"#98A2B3",marginTop:3,textAlign:"right"},
  managementAction:{marginTop:13,backgroundColor:"#F5E7E2",borderRadius:11,paddingVertical:10,paddingHorizontal:11,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  managementActionText:{fontSize:10,fontWeight:"900",color:"#75282E"},
  managementArrow:{fontSize:18,color:"#98A2B3"},
  managementRows:{marginTop:10,borderTopWidth:1,borderTopColor:"#EAECF0",paddingTop:8,flexDirection:"row-reverse",justifyContent:"space-between"},
  managementRowLabel:{fontSize:8,color:"#98A2B3"},
  managementRowValue:{fontSize:10,fontWeight:"900",color:"#475467"},
  managementLowerGrid:{flexDirection:"row-reverse",gap:10,flexWrap:"wrap"},
  lateRow:{flexDirection:"row-reverse",alignItems:"center",gap:10,borderTopWidth:1,borderTopColor:"#F2F4F7",paddingVertical:10},
  lateBadge:{backgroundColor:"#F8FAFC",borderRadius:9,paddingHorizontal:8,paddingVertical:6},
  lateBadgeText:{fontSize:9,fontWeight:"900",color:"#75282E"},
  lateCopy:{flex:1},
  lateName:{fontSize:11,fontWeight:"900",color:"#332A26",textAlign:"right"},
  lateMeta:{fontSize:8,color:"#98A2B3",marginTop:2,textAlign:"right"},
  emptyCommand:{paddingVertical:18,alignItems:"center"},
  emptyCommandTitle:{fontSize:11,fontWeight:"900",color:"#475467"},
  emptyCommandText:{fontSize:9,color:"#98A2B3",marginTop:4,textAlign:"center"},
  departmentRow:{flexDirection:"row-reverse",alignItems:"center",gap:9,borderTopWidth:1,borderTopColor:"#F2F4F7",paddingVertical:9},
  departmentCount:{fontSize:10,fontWeight:"900",color:"#75282E",width:25,textAlign:"center"},
  departmentCopy:{flex:1},
  departmentName:{fontSize:10,fontWeight:"800",color:"#475467",textAlign:"right"},
  departmentTrack:{height:6,borderRadius:4,backgroundColor:"#EEF2F6",overflow:"hidden",marginTop:5},
  departmentFill:{height:"100%",borderRadius:4,backgroundColor:"#75282E"},
  smartCard:{backgroundColor:"#FFFDF8",borderRadius:20,borderWidth:1,borderColor:"#E9DED0",padding:18},smartHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:12},smartEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#98A2B3",textAlign:"right"},smartTitle:{fontSize:16,fontWeight:"900",color:"#332A26",marginTop:3,textAlign:"right"},smartBadge:{flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:9,paddingVertical:6,borderRadius:999,backgroundColor:"#EEF3F8"},smartBadgeText:{fontSize:9,fontWeight:"800",color:"#75282E"},smartGrid:{flexDirection:"row-reverse",gap:10,marginTop:14,flexWrap:"wrap"},smartGridMobile:{flexDirection:"column"},smartItem:{flex:1,minWidth:220,flexDirection:"row-reverse",alignItems:"flex-start",gap:10,backgroundColor:"#FFFFFF",borderRadius:14,borderWidth:1,borderColor:"#E8ECF1",padding:13},smartIcon:{width:30,height:30,borderRadius:10,backgroundColor:"#EEF3F8",alignItems:"center",justifyContent:"center"},smartCopy:{flex:1},smartItemTitle:{fontSize:11,fontWeight:"900",color:"#332A26",textAlign:"right"},smartItemText:{fontSize:9,color:"#806F68",lineHeight:15,marginTop:3,textAlign:"right"},  hidden:{display:"none"},
  commandCenter:{backgroundColor:"#F7F0E7",borderRadius:26,padding:20,gap:15,borderWidth:1,borderColor:"#E7D8C7"},
  commandWelcome:{backgroundColor:"#332A26",borderRadius:21,padding:22,flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:15},
  commandWelcomeCopy:{flex:1},
  commandEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.4,color:"#D6A16C",textAlign:"right"},
  commandWelcomeTitle:{fontSize:25,fontWeight:"900",color:"#FFF8E7",textAlign:"right",marginTop:7},
  commandWelcomeSub:{fontSize:11,lineHeight:19,color:"#E8D8C8",textAlign:"right",marginTop:5,maxWidth:560},
  commandDate:{minWidth:150,backgroundColor:"#493B34",borderRadius:15,padding:13,alignItems:"flex-end"},
  commandDateLabel:{fontSize:9,color:"#D6BDA7"},
  commandDateValue:{fontSize:12,fontWeight:"900",color:"#FFF8E7",marginTop:5,textAlign:"right"},
  commandLive:{flexDirection:"row-reverse",alignItems:"center",gap:6,marginTop:9},
  commandLiveDot:{width:6,height:6,borderRadius:3,backgroundColor:"#B8794A"},
  commandLiveText:{fontSize:9,color:"#F0D5BE",fontWeight:"800"},
  commandKpis:{flexDirection:"row-reverse",gap:10},
  commandKpisMobile:{flexWrap:"wrap"},
  commandKpi:{flex:1,minWidth:125,backgroundColor:"#FFFDF9",borderWidth:1,borderColor:"#E8DCCD",borderRadius:17,padding:15,alignItems:"flex-end"},
  commandKpiPrimary:{backgroundColor:"#75282E",borderColor:"#75282E"},
  commandKpiLabel:{fontSize:10,fontWeight:"800",color:"#8C7868",textAlign:"right"},
  commandKpiValue:{fontSize:29,fontWeight:"900",color:"#332A26",marginTop:8,textAlign:"right"},
  commandKpiNote:{fontSize:9,color:"#A18E7C",marginTop:3,textAlign:"right"},
  commandMainGrid:{flexDirection:"row-reverse",gap:12,flexWrap:"wrap"},
  commandMainGridMobile:{flexDirection:"column"},
  commandPanel:{flex:1,minWidth:220,backgroundColor:"#FFFDF9",borderRadius:18,borderWidth:1,borderColor:"#E8DCCD",padding:16},
  commandAttendancePanel:{flex:1.25,minWidth:280},
  commandPanelHead:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:10},
  commandPanelTitle:{fontSize:13,fontWeight:"900",color:"#332A26",textAlign:"right"},
  commandPanelSub:{fontSize:9,color:"#9C8978",marginTop:4,textAlign:"right"},
  commandPanelIcon:{width:37,height:37,borderRadius:12,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},
  commandAttendanceBody:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-around",gap:12,marginTop:18},
  commandRing:{width:112,height:112,borderRadius:56,borderWidth:9,borderColor:"#B8794A",backgroundColor:"#FFF8EF",alignItems:"center",justifyContent:"center"},
  commandRingValue:{fontSize:25,fontWeight:"900",color:"#75282E"},
  commandRingLabel:{fontSize:8,color:"#9C8978",marginTop:2},
  commandLegend:{flex:1,gap:12},
  commandLegendRow:{flexDirection:"row-reverse",alignItems:"center",gap:7},
  commandLegendDot:{width:8,height:8,borderRadius:4},
  commandLegendLabel:{flex:1,fontSize:9,color:"#806F68",textAlign:"right"},
  commandLegendValue:{fontSize:11,fontWeight:"900",color:"#332A26"},
  commandProgressTrack:{height:7,backgroundColor:"#EFE4D8",borderRadius:6,overflow:"hidden",marginTop:17},
  commandProgressFill:{height:"100%",backgroundColor:"#75282E",borderRadius:6},
  commandTextAction:{flexDirection:"row-reverse",alignItems:"center",justifyContent:"space-between",marginTop:15,paddingTop:12,borderTopWidth:1,borderTopColor:"#EFE5DA"},
  commandTextActionLabel:{fontSize:9,fontWeight:"900",color:"#75282E"},
  commandTextActionArrow:{fontSize:14,color:"#B8794A"},
  commandRequestCount:{flexDirection:"row-reverse",alignItems:"baseline",gap:8,marginTop:20},
  commandRequestValue:{fontSize:42,fontWeight:"900",color:"#75282E"},
  commandRequestLabel:{fontSize:10,fontWeight:"800",color:"#806F68"},
  commandMuted:{fontSize:9,color:"#9C8978",lineHeight:16,textAlign:"right",marginTop:6},
  commandPrimaryAction:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",backgroundColor:"#75282E",borderRadius:11,paddingHorizontal:13,paddingVertical:11,marginTop:17},
  commandPrimaryActionText:{fontSize:10,fontWeight:"900",color:"#FFF8E7"},
  commandPrimaryActionArrow:{fontSize:15,color:"#E8C7AB"},
  commandPayrollValue:{fontSize:26,fontWeight:"900",color:"#332A26",textAlign:"right",marginTop:22},
  commandPayrollCurrency:{fontSize:10,color:"#9C8978"},
  commandPayrollMeta:{flexDirection:"row-reverse",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#EFE5DA",paddingTop:9,marginTop:10},
  commandPayrollMetaValue:{fontSize:10,fontWeight:"900",color:"#75282E"},
  commandLowerGrid:{flexDirection:"row-reverse",gap:12,flexWrap:"wrap"},
  liveAttendanceSummary:{flexDirection:"row-reverse",gap:7,marginTop:14,flexWrap:"wrap"},liveAttendanceMetric:{flex:1,minWidth:65,backgroundColor:"#F8F1E9",borderRadius:11,padding:10,alignItems:"flex-end"},liveAttendanceNumber:{fontSize:18,fontWeight:"900",color:"#75282E"},liveAttendanceLabel:{fontSize:8,color:"#8C7868",marginTop:3},liveAttendanceRow:{flexDirection:"row-reverse",alignItems:"center",gap:9,borderTopWidth:1,borderTopColor:"#EFE5DA",paddingVertical:10},liveAttendanceDot:{width:8,height:8,borderRadius:4},liveAttendanceCopy:{flex:1},liveAttendanceName:{fontSize:10,fontWeight:"900",color:"#332A26",textAlign:"right"},liveAttendanceMeta:{fontSize:8,color:"#9C8978",textAlign:"right",marginTop:3},liveAttendanceState:{fontSize:9,fontWeight:"800"} ,
  commandWidePanel:{flex:1.25,minWidth:280},
  commandLateRow:{flexDirection:"row-reverse",alignItems:"center",gap:10,borderTopWidth:1,borderTopColor:"#EFE5DA",paddingVertical:11},
  commandLateMinutes:{backgroundColor:"#F5E7E2",borderRadius:9,paddingHorizontal:9,paddingVertical:7},
  commandLateMinutesText:{fontSize:9,fontWeight:"900",color:"#75282E"},
  commandLateCopy:{flex:1},
  commandLateName:{fontSize:10,fontWeight:"900",color:"#332A26",textAlign:"right"},
  commandLateStatus:{fontSize:8,color:"#9C8978",textAlign:"right",marginTop:3},
  commandEmpty:{alignItems:"center",justifyContent:"center",paddingVertical:20,gap:5},
  commandEmptyTitle:{fontSize:10,fontWeight:"900",color:"#5D493D"},
  commandDepartmentRow:{marginTop:14},
  commandDepartmentTop:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},
  commandDepartmentName:{fontSize:9,fontWeight:"800",color:"#806F68"},
  commandDepartmentCount:{fontSize:10,fontWeight:"900",color:"#75282E"},
  commandDepartmentTrack:{height:6,backgroundColor:"#EFE4D8",borderRadius:5,overflow:"hidden",marginTop:7},
  commandDepartmentFill:{height:"100%",backgroundColor:"#B8794A",borderRadius:5},
  page:{padding:30,paddingBottom:70,gap:22,maxWidth:1280,width:"100%",alignSelf:"center"},pageMobile:{padding:14,paddingBottom:34,gap:14},
  header:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},  headerMobile:{flexDirection:"column",alignItems:"stretch",gap:12},
  headerRightMobile:{justifyContent:"space-between",width:"100%",gap:10},
  heroMobile:{flexDirection:"column",padding:16,borderRadius:20,gap:14},
  heroStatsMobile:{flexDirection:"row-reverse",justifyContent:"space-between",gap:8,marginTop:18,paddingTop:12},
  kpisMobile:{flexDirection:"row-reverse",flexWrap:"wrap",gap:9},
  kpiMobile:{minWidth:0,flexBasis:"47%"},
  panelMobile:{minWidth:0,width:"100%"},
  quickMobile:{minWidth:0,width:"100%"},
  gridMobile:{flexDirection:"column",gap:10},
  quickGridMobile:{flexDirection:"column",gap:9},
  executiveGrid:{flexDirection:"row-reverse",gap:14,flexWrap:"wrap"},executiveCard:{flex:1,minWidth:320,backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:"#E9DED0",padding:18},pulseRow:{flexDirection:"row-reverse",alignItems:"center",gap:15,marginTop:17},pulseRing:{width:74,height:74,borderRadius:37,borderWidth:7,borderColor:"#75282E",alignItems:"center",justifyContent:"center"},pulseValue:{fontSize:17,fontWeight:"900",color:"#332A26"},pulseCopy:{flex:1},pulseTitle:{fontSize:13,fontWeight:"900",color:"#332A26",textAlign:"right"},pulseSub:{fontSize:9,color:"#98A2B3",lineHeight:15,marginTop:4,textAlign:"right"},miniMetric:{marginTop:15,borderTopWidth:1,borderTopColor:"#EAECF0",paddingTop:11,flexDirection:"row-reverse",justifyContent:"space-between"},miniValue:{fontSize:12,fontWeight:"900",color:"#332A26"},miniLabel:{fontSize:9,color:"#98A2B3"},payrollTotal:{flexDirection:"row-reverse",alignItems:"baseline",gap:7,marginTop:18},payrollValue:{fontSize:27,fontWeight:"900",color:"#332A26"},payrollCurrency:{fontSize:9,fontWeight:"900",color:"#98A2B3"},payrollRow:{flexDirection:"row-reverse",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#EAECF0",paddingTop:10,marginTop:10},payrollLabel:{fontSize:9,color:"#98A2B3"},payrollStatus:{fontSize:9,color:"#15803D",fontWeight:"900"},payrollText:{fontSize:10,color:"#475467",fontWeight:"800"},activityCard:{backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:"#E9DED0",padding:18},activityRow:{flexDirection:"row-reverse",alignItems:"center",gap:10,borderTopWidth:1,borderTopColor:"#F2F4F7",paddingVertical:12},activityIcon:{width:34,height:34,borderRadius:10,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},activityCopy:{flex:1},activityTitle:{fontSize:11,color:"#332A26",fontWeight:"900",textAlign:"right"},activitySub:{fontSize:9,color:"#98A2B3",marginTop:2,textAlign:"right"},activityTime:{fontSize:9,color:"#98A2B3"} ,
  sectionBadge:{flexDirection:"row-reverse",alignItems:"center",gap:6,backgroundColor:"#F0FDF4",borderRadius:10,paddingHorizontal:9,paddingVertical:6},sectionBadgeDot:{width:6,height:6,borderRadius:3,backgroundColor:"#16A34A"},sectionBadgeText:{fontSize:9,color:"#15803D",fontWeight:"800"},
  workspaceGrid:{flexDirection:"row-reverse",gap:11,flexWrap:"wrap"},workspaceCard:{flex:1,minWidth:190,backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:"#E9DED0",padding:13,flexDirection:"row-reverse",alignItems:"center",gap:10},workspaceIcon:{width:38,height:38,borderRadius:11,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},workspaceCopy:{flex:1},workspaceChevron:{fontSize:19,color:"#98A2B3"},workspaceLabel:{fontSize:9,color:"#98A2B3",textAlign:"right"},workspaceValue:{fontSize:12,color:"#332A26",fontWeight:"900",marginTop:3,textAlign:"right"},

  brand:{flexDirection:"row-reverse",alignItems:"center",gap:11},dallaLogo:{width:58,height:48,marginRight:8},logo:{width:48,height:48,borderRadius:15,backgroundColor:"#75282E",alignItems:"center",justifyContent:"center"},kicker:{fontSize:9,color:"#98A2B3",fontWeight:"900",letterSpacing:1,textAlign:"right"},company:{fontSize:14,color:"#332A26",fontWeight:"900",marginTop:2,textAlign:"right"},
  headerRight:{flexDirection:"row-reverse",alignItems:"center",gap:15},dateBlock:{alignItems:"flex-end"},date:{fontSize:10,color:"#98A2B3"},welcome:{fontSize:12,color:"#332A26",fontWeight:"800",marginTop:3},bell:{width:44,height:44,borderRadius:13,borderWidth:1,borderColor:"#E9DED0",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",position:"relative"},dot:{position:"absolute",right:8,top:8,width:7,height:7,borderRadius:4,backgroundColor:"#75282E",borderWidth:2,borderColor:"#fff"},
  hero:{backgroundColor:"#75282E",borderRadius:26,padding:24,flexDirection:"row-reverse",gap:22,shadowColor:"#75282E",shadowOpacity:.14,shadowRadius:20,shadowOffset:{width:0,height:8},elevation:4},heroCopy:{flex:1,paddingVertical:5},live:{flexDirection:"row-reverse",alignItems:"center",gap:7},liveDot:{width:7,height:7,borderRadius:4,backgroundColor:"#D6A16C"},liveText:{color:"#F3DDC8",fontSize:10,fontWeight:"800"},heroTitle:{color:"#fff",fontSize:29,fontWeight:"900",lineHeight:38,marginTop:13,textAlign:"right"},heroSub:{color:"#F2DED1",fontSize:12,lineHeight:20,marginTop:7,maxWidth:650,textAlign:"right"},heroStats:{flexDirection:"row-reverse",gap:32,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.12)",marginTop:24,paddingTop:15},heroLabel:{color:"#E2C5B0",fontSize:9,textAlign:"right"},heroValue:{color:"#fff",fontSize:12,fontWeight:"800",marginTop:3,textAlign:"right"},
  attendanceCard:{width:285,maxWidth:"100%",backgroundColor:"#fff",borderRadius:20,padding:18,justifyContent:"center"},attendanceLabel:{color:"#806F68",fontSize:10,fontWeight:"800",textAlign:"right"},clock:{color:"#332A26",fontSize:31,fontWeight:"900",textAlign:"right",marginTop:3},locationRow:{flexDirection:"row-reverse",alignItems:"center",gap:7,marginTop:7},locationIcon:{width:28,height:28,borderRadius:9,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},locationText:{color:"#806F68",fontSize:9,flex:1,textAlign:"right"},attendanceButton:{height:47,borderRadius:12,backgroundColor:"#75282E",alignItems:"center",justifyContent:"center",flexDirection:"row-reverse",gap:7,marginTop:13},attendanceButtonText:{color:"#fff",fontSize:11,fontWeight:"900"},disabled:{backgroundColor:"#AAB8C8"},pressed:{opacity:.82,transform:[{scale:.985}]},
  sectionHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"flex-end"},sectionTitle:{fontSize:18,color:"#332A26",fontWeight:"900",textAlign:"right"},sectionSub:{fontSize:10,color:"#98A2B3",marginTop:3,textAlign:"right"},
  insightStrip:{flexDirection:"row-reverse",gap:10},
  insightStripMobile:{flexDirection:"column"},
  insightItem:{flex:1,minHeight:78,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E7ECF2",borderRadius:16,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:9},
  insightIcon:{width:34,height:34,borderRadius:11,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},
  insightCopy:{flex:1},
  insightValue:{color:"#75282E",fontSize:16,fontWeight:"900",textAlign:"right"},
  insightLabel:{color:"#332A26",fontSize:10,fontWeight:"800",textAlign:"right",marginTop:1},
  insightMeta:{color:"#A8968A",fontSize:8,textAlign:"right",marginTop:2},
  kpis:{flexDirection:"row-reverse",gap:13},kpi:{flex:1,minWidth:170,backgroundColor:"#fff",borderRadius:18,borderWidth:1,borderColor:"#E9DED0",padding:16},kpiTop:{flexDirection:"row-reverse",alignItems:"center",gap:8},kpiIcon:{width:36,height:36,borderRadius:11,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},kpiLine:{height:1,backgroundColor:"#F0F2F5",flex:1},kpiValue:{fontSize:22,color:"#332A26",fontWeight:"900",marginTop:14,textAlign:"right"},kpiLabel:{fontSize:11,color:"#475467",fontWeight:"800",marginTop:3,textAlign:"right"},kpiNote:{fontSize:9,color:"#98A2B3",marginTop:5,textAlign:"right"},
  grid:{flexDirection:"row-reverse",gap:14,flexWrap:"wrap"},card:{backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:"#E9DED0",padding:18},attendancePanel:{flex:1,minWidth:420},todayPanel:{flex:1,minWidth:340},cardHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},cardTitle:{fontSize:14,color:"#332A26",fontWeight:"900",textAlign:"right"},cardMeta:{fontSize:9,color:"#98A2B3"},chart:{height:205,marginTop:13,flexDirection:"row-reverse",alignItems:"flex-end",gap:9},barItem:{flex:1,height:"100%",alignItems:"center",justifyContent:"flex-end",gap:5},barValue:{fontSize:8,color:"#806F68",fontWeight:"800"},barTrack:{width:24,height:140,backgroundColor:"#F0E8DE",borderRadius:8,justifyContent:"flex-end",overflow:"hidden"},barFill:{width:"100%",backgroundColor:"#75282E",borderRadius:8,minHeight:4},barDay:{fontSize:9,color:"#98A2B3"},
  todayStatus:{backgroundColor:"#FFF8EF",borderRadius:15,padding:13,marginTop:17,flexDirection:"row-reverse",alignItems:"center",gap:10},statusCircle:{width:43,height:43,borderRadius:13,backgroundColor:"#B8794A",alignItems:"center",justifyContent:"center"},statusCopy:{flex:1},statusTitle:{fontSize:12,color:"#332A26",fontWeight:"900",textAlign:"right"},statusSub:{fontSize:9,color:"#806F68",marginTop:3,lineHeight:15,textAlign:"right"},timeRows:{marginTop:13},timeRow:{flexDirection:"row-reverse",justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#EAECF0",paddingTop:11,marginTop:11},timeLabel:{fontSize:10,color:"#98A2B3"},timeValue:{fontSize:11,color:"#332A26",fontWeight:"900"},
  quickGrid:{flexDirection:"row-reverse",gap:11,flexWrap:"wrap"},quick:{flex:1,minWidth:190,backgroundColor:"#fff",borderWidth:1,borderColor:"#E9DED0",borderRadius:16,padding:13,flexDirection:"row-reverse",alignItems:"center",gap:10},quickIcon:{width:39,height:39,borderRadius:11,backgroundColor:"#F5E7E2",alignItems:"center",justifyContent:"center"},quickCopy:{flex:1},quickTitle:{fontSize:12,color:"#332A26",fontWeight:"900",textAlign:"right"},quickSub:{fontSize:9,color:"#98A2B3",marginTop:2,textAlign:"right"},chevron:{fontSize:19,color:"#98A2B3"}
});