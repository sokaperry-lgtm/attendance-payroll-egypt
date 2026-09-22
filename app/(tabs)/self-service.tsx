import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { trpc } from "@/lib/trpc";

export default function EmployeeSelfServiceScreen() {
  const { employee, records, requests, payroll } = useAppData();
  const year = new Date().getFullYear();
  const balance = trpc.leave.balance.useQuery({ year });
  const unread = (trpc.notifications.list.useQuery().data ?? []).filter((n:any) => !n.readAt).length;
  const annual = Math.max(0, (balance.data?.annualDays ?? 21) - (balance.data?.annualUsed ?? 0));
  const sick = Math.max(0, (balance.data?.sickDays ?? 14) - (balance.data?.sickUsed ?? 0));
  const emergency = Math.max(0, (balance.data?.emergencyDays ?? 6) - (balance.data?.emergencyUsed ?? 0));
  const present = records.filter(r => r.status === "حاضر" || r.status === "متأخر").length;
  const late = records.reduce((s,r) => s + (r.lateMinutes || 0), 0);
  const pending = requests.filter(r => r.status === "قيد المراجعة").length;

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <View style={styles.avatar}><IconSymbol name="person.fill" size={25} color="#FFFFFF" /></View>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>EMPLOYEE SELF-SERVICE</Text><Text style={styles.title}>ملفي</Text><Text style={styles.subtitle}>{employee.name} · كل بياناتك في مكان واحد</Text></View>
    </View>

    <View style={styles.profile}>
      <View style={styles.profileAvatar}><Text style={styles.initials}>{employee.initials}</Text></View>
      <View style={styles.profileCopy}><Text style={styles.name}>{employee.name}</Text><Text style={styles.meta}>{employee.title}</Text><Text style={styles.meta}>{employee.department}</Text></View>
      <View style={styles.badge}><Text style={styles.badgeText}>موظف</Text></View>
    </View>

    <View style={styles.section}><Text style={styles.sectionTitle}>ملخصك الآن</Text><View style={styles.grid}>
      <Card icon="calendar" value={String(present)} label="أيام حضور" />
      <Card icon="clock" value={String(late)} label="دقائق تأخير" />
      <Card icon="doc.text.fill" value={String(pending)} label="طلبات معلقة" />
      <Card icon="banknote" value={payroll.net.toLocaleString("ar-EG")} label="صافي الراتب" />
    </View></View>

    <View style={styles.section}><Text style={styles.sectionTitle}>أرصدة الإجازات</Text>
      <View style={styles.balanceRow}><Balance label="سنوية" value={annual} total={balance.data?.annualDays ?? 21} /><Balance label="مرضية" value={sick} total={balance.data?.sickDays ?? 14} /><Balance label="طارئة" value={emergency} total={balance.data?.emergencyDays ?? 6} /></View>
    </View>

    <View style={styles.section}><Text style={styles.sectionTitle}>آخر الطلبات</Text>
      {requests.slice(0,4).map((r:any) => <View key={r.id} style={styles.request}><View style={styles.requestIcon}><IconSymbol name="doc.text.fill" size={16} color="#163A63" /></View><View style={styles.requestCopy}><Text style={styles.requestType}>{r.type}</Text><Text style={styles.requestMeta}>{r.from} {r.to && r.to !== r.from ? "— "+r.to : ""}</Text></View><Text style={[styles.status, r.status === "مقبول" && styles.accepted, r.status === "مرفوض" && styles.rejected]}>{r.status}</Text></View>)}
      {!requests.length && <Text style={styles.empty}>لا توجد طلبات حتى الآن.</Text>}
    </View>

    <View style={styles.section}><Text style={styles.sectionTitle}>تنبيهات</Text><View style={styles.notice}><IconSymbol name="notifications" size={18} color="#163A63" /><View style={styles.noticeCopy}><Text style={styles.noticeTitle}>{unread ? `${unread} تنبيه يحتاج انتباهك` : "لا توجد تنبيهات جديدة"}</Text><Text style={styles.noticeText}>تابع الموافقات والطلبات وأي تحديثات تخص حسابك.</Text></View></View></View>
  </ScrollView></ScreenContainer>;
}

function Card({icon,value,label}:{icon:any,value:string,label:string}){return <View style={styles.card}><IconSymbol name={icon} size={19} color="#163A63" /><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>}
function Balance({label,value,total}:{label:string,value:number,total:number}){const p=total?Math.round(value/total*100):0;return <View style={styles.balance}><Text style={styles.balanceLabel}>{label}</Text><Text style={styles.balanceValue}>{value}</Text><Text style={styles.balanceTotal}>متبقي من {total}</Text><View style={styles.track}><View style={[styles.fill,{width:`${p}%`}]} /></View></View>}

const styles=StyleSheet.create({
 content:{padding:20,paddingBottom:50,gap:16},header:{flexDirection:"row-reverse",alignItems:"center",gap:13},avatar:{width:46,height:46,borderRadius:15,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},headerCopy:{flex:1},eyebrow:{fontSize:9,fontWeight:"800",color:"#6B7A8C",textAlign:"right",letterSpacing:1},title:{fontSize:28,fontWeight:"900",color:"#172033",textAlign:"right"},subtitle:{fontSize:11,color:"#667085",textAlign:"right",marginTop:2},profile:{backgroundColor:"#163A63",borderRadius:22,padding:18,flexDirection:"row-reverse",alignItems:"center",gap:13},profileAvatar:{width:62,height:62,borderRadius:20,backgroundColor:"#31577F",alignItems:"center",justifyContent:"center"},initials:{fontSize:20,fontWeight:"900",color:"#fff"},profileCopy:{flex:1},name:{fontSize:18,fontWeight:"900",color:"#fff",textAlign:"right"},meta:{fontSize:10,color:"#D9E6F2",textAlign:"right",marginTop:3},badge:{backgroundColor:"rgba(255,255,255,.14)",paddingHorizontal:10,paddingVertical:7,borderRadius:10},badgeText:{fontSize:9,fontWeight:"800",color:"#fff"},section:{gap:10},sectionTitle:{fontSize:14,fontWeight:"900",color:"#172033",textAlign:"right"},grid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:10},card:{width:"48%",backgroundColor:"#fff",borderWidth:1,borderColor:"#E8EDF3",borderRadius:18,padding:15,gap:6},value:{fontSize:22,fontWeight:"900",color:"#172033",textAlign:"right"},label:{fontSize:10,fontWeight:"700",color:"#667085",textAlign:"right"},balanceRow:{flexDirection:"row-reverse",gap:10},balance:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#E8EDF3",borderRadius:17,padding:13},balanceLabel:{fontSize:10,fontWeight:"800",color:"#667085",textAlign:"right"},balanceValue:{fontSize:24,fontWeight:"900",color:"#163A63",textAlign:"right",marginTop:4},balanceTotal:{fontSize:9,color:"#98A6B8",textAlign:"right"},track:{height:5,backgroundColor:"#EEF2F6",borderRadius:4,marginTop:9,overflow:"hidden"},fill:{height:5,backgroundColor:"#6FA9D8",borderRadius:4},request:{backgroundColor:"#fff",borderWidth:1,borderColor:"#E8EDF3",borderRadius:15,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:10},requestIcon:{width:34,height:34,borderRadius:11,backgroundColor:"#F2F5F8",alignItems:"center",justifyContent:"center"},requestCopy:{flex:1},requestType:{fontSize:11,fontWeight:"800",color:"#172033",textAlign:"right"},requestMeta:{fontSize:9,color:"#98A6B8",textAlign:"right",marginTop:3},status:{fontSize:9,fontWeight:"800",color:"#31577F"},accepted:{color:"#16805A"},rejected:{color:"#B54747"},empty:{fontSize:11,color:"#98A6B8",textAlign:"right"},notice:{backgroundColor:"#F2F5F8",borderWidth:1,borderColor:"#D9E6F2",borderRadius:17,padding:14,flexDirection:"row-reverse",gap:10,alignItems:"center"},noticeCopy:{flex:1},noticeTitle:{fontSize:11,fontWeight:"800",color:"#163A63",textAlign:"right"},noticeText:{fontSize:10,color:"#667085",textAlign:"right",marginTop:3}
});
