import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

export default function EmployeeProfileScreen() {
  const router=useRouter();
  const { id }=useLocalSearchParams<{id:string}>();
  const { staffMembers, role }=useAppData();
  const employee=staffMembers.find(x=>x.id===String(id));
  const month=new Date().toISOString().slice(0,7);
  const reports=trpc.reports.month.useQuery({month},{enabled:role==="manager" || role==="supervisor"});
  const profile=trpc.hrTools.employee360.useQuery({staffAccountId:Number(id)},{enabled:(role==="manager" || role==="supervisor") && Boolean(id)});
  if(!employee) return <ScreenContainer><View style={styles.state}><IconSymbol name="person.fill" size={40} color="#2563EB"/><Text style={styles.stateTitle}>الموظف غير موجود</Text><Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>رجوع</Text></Pressable></View></ScreenContainer>;
  const stats=reports.data?.employees?.find((x:any)=>String(x.id)===employee.id);
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={()=>router.back()}><Text style={styles.backLink}>‹ رجوع للفريق</Text></Pressable>
    <View style={styles.hero}><View style={styles.avatar}><Text style={styles.avatarText}>{employee.initials}</Text></View><View style={{flex:1}}><Text style={styles.kicker}>EMPLOYEE PROFILE</Text><Text style={styles.name}>{employee.name}</Text><Text style={styles.role}>{employee.title} · {employee.department}</Text><View style={styles.status}><View style={styles.dot}/><Text style={styles.statusText}>{employee.active===false?"غير نشط":"موظف نشط"}</Text></View></View></View>
    <View style={styles.grid}>
      <Card title="بيانات أساسية"><Row label="رقم الهاتف" value={employee.phone||"—"}/><Row label="القسم" value={employee.department}/><Row label="المسمى الوظيفي" value={employee.title}/><Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)}/></Card>
      <Card title="مؤشرات الشهر"><Row label="أيام الحضور" value={String(stats?.presentDays??0)}/><Row label="أيام الغياب" value={String(stats?.absentDays??0)}/><Row label="دقائق التأخير" value={String(stats?.lateMinutes??0)}/><Row label="طلبات معلقة" value={String(stats?.pendingRequests??0)}/></Card>
    </View>
    <Card title="Payroll snapshot"><View style={styles.payroll}><Text style={styles.payrollValue}>{formatMoney(employee.baseSalary)}</Text><Text style={styles.payrollLabel}>الأساسي الشهري</Text></View><View style={styles.metrics}><Metric label="تعديلات راتب" value={String(profile.data?.adjustments?.length ?? 0)} /><Metric label="سلف" value={String(profile.data?.advances?.length ?? 0)} /><Metric label="مستندات" value={String(profile.data?.documents?.length ?? 0)} /><Metric label="مسيرات" value={String(profile.data?.payroll?.length ?? 0)} /></View></Card>
    <Card title="الوصول والصلاحيات"><Text style={styles.hint}>يمكن للإدارة تعديل بيانات الموظف، الدور، الحالة، والفرع من مركز إدارة الفريق.</Text></Card>
  </ScrollView></ScreenContainer>;
}
function Card({title,children}:{title:string;children:ReactNode}){return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>}
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>}
function Metric({label,value}:{label:string;value:string}){return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>}
const styles=StyleSheet.create({content:{padding:22,paddingBottom:60,maxWidth:1180,width:"100%",alignSelf:"center",gap:14},backLink:{color:"#2563EB",fontSize:12,fontWeight:"800",textAlign:"right"},hero:{backgroundColor:"#0B1220",borderRadius:26,padding:24,flexDirection:"row-reverse",alignItems:"center",gap:16},avatar:{width:76,height:76,borderRadius:24,backgroundColor:"#2563EB",alignItems:"center",justifyContent:"center"},avatarText:{color:"#FFF",fontSize:24,fontWeight:"900"},kicker:{color:"#93C5FD",fontSize:9,fontWeight:"900",textAlign:"right"},name:{color:"#FFF",fontSize:27,fontWeight:"900",textAlign:"right",marginTop:4},role:{color:"#94A3B8",fontSize:12,textAlign:"right",marginTop:4},status:{flexDirection:"row-reverse",alignItems:"center",gap:6,marginTop:10},dot:{width:8,height:8,borderRadius:4,backgroundColor:"#34D399"},statusText:{color:"#CBD5E1",fontSize:10},grid:{flexDirection:"row-reverse",gap:14},card:{flex:1,backgroundColor:"#FFF",borderWidth:1,borderColor:"#E2E8F0",borderRadius:20,padding:18},cardTitle:{color:"#0F172A",fontSize:15,fontWeight:"900",textAlign:"right",marginBottom:8},row:{flexDirection:"row-reverse",justifyContent:"space-between",paddingVertical:11,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},label:{color:"#64748B",fontSize:11},value:{color:"#0F172A",fontSize:12,fontWeight:"800"},payroll:{backgroundColor:"#EFF6FF",borderRadius:14,padding:16,alignItems:"flex-end"},payrollValue:{color:"#1D4ED8",fontSize:23,fontWeight:"900"},payrollLabel:{color:"#64748B",fontSize:10,marginTop:3},metrics:{flexDirection:"row-reverse",gap:8,marginTop:10},metric:{flex:1,backgroundColor:"#F8FAFC",borderRadius:12,padding:10,alignItems:"center"},metricValue:{color:"#0F172A",fontSize:16,fontWeight:"900"},metricLabel:{color:"#64748B",fontSize:8,marginTop:2},hint:{color:"#64748B",fontSize:11,lineHeight:20,textAlign:"right"},state:{flex:1,alignItems:"center",justifyContent:"center",gap:12},stateTitle:{fontSize:20,fontWeight:"900",color:"#0F172A"},back:{backgroundColor:"#2563EB",paddingHorizontal:20,paddingVertical:12,borderRadius:12},backText:{color:"#FFF",fontWeight:"800"}});