import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

export default function EmployeeProfileScreen() {
  const router=useRouter();
  const params=useLocalSearchParams<{id?:string|string[]}>();
  const id=Array.isArray(params.id)?params.id[0]:params.id;
  const staffAccountId=Number(id);
  const {staffMembers,role}=useAppData();
  const employee=staffMembers.find(x=>String(x.id)===String(id));
  const profile=trpc.hrTools.employee360.useQuery({staffAccountId},{enabled:(role==="manager"||role==="supervisor")&&Number.isInteger(staffAccountId)&&staffAccountId>0,retry:false});

  if(!employee) return <ScreenContainer><View style={styles.center}><Text style={styles.title}>الموظف غير موجود</Text><Text style={styles.muted}>رقم الموظف: {String(id||"غير معروف")}</Text><Pressable onPress={()=>router.back()} style={styles.button}><Text style={styles.buttonText}>رجوع</Text></Pressable></View></ScreenContainer>;
  if(profile.isLoading) return <ScreenContainer><View style={styles.center}><ActivityIndicator size="large" color="#163A63"/><Text style={styles.title}>جاري تحميل بيانات الموظف...</Text></View></ScreenContainer>;
  if(profile.isError) return <ScreenContainer><View style={styles.center}><Text style={styles.title}>تعذر تحميل البيانات</Text><Text style={styles.muted}>{profile.error?.message||"حدث خطأ أثناء الاتصال بقاعدة البيانات."}</Text><Pressable onPress={()=>profile.refetch()} style={styles.button}><Text style={styles.buttonText}>إعادة المحاولة</Text></Pressable></View></ScreenContainer>;

  const data=profile.data;
  const attendance=data?.attendance??[];
  const requests=data?.requests??[];
  const docs=data?.documents??[];
  const payroll=data?.payroll??[];
  const adjustments=data?.adjustments??[];
  const advances=data?.advances??[];
  const present=attendance.filter((r:any)=>r.status==="حاضر"||r.status==="متأخر").length;
  const absent=attendance.filter((r:any)=>r.status==="غياب").length;
  const late=attendance.reduce((s:number,r:any)=>s+Number(r.lateMinutes||0),0);

  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={()=>router.back()}><Text style={styles.back}>‹ رجوع للموظفين</Text></Pressable>
    <View style={styles.hero}><View style={styles.avatar}><Text style={styles.avatarText}>{employee.initials||"م"}</Text></View><View style={styles.heroText}><Text style={styles.kicker}>EMPLOYEE 360</Text><Text style={styles.name}>{employee.name}</Text><Text style={styles.role}>{employee.title||"موظف"} · {employee.department||"—"}</Text></View></View>

    <View style={styles.grid}>
      <Card title="بيانات الموظف"><Row label="الهاتف" value={employee.phone||"—"}/><Row label="القسم" value={employee.department||"—"}/><Row label="الوظيفة" value={employee.title||"—"}/><Row label="الراتب الأساسي" value={formatMoney(employee.baseSalary)}/></Card>
      <Card title="ملخص الحضور"><Row label="أيام الحضور" value={String(present)}/><Row label="أيام الغياب" value={String(absent)}/><Row label="دقائق التأخير" value={String(late)}/><Row label="سجلات الحضور" value={String(attendance.length)}/></Card>
    </View>

    <Card title="الحضور"><SectionEmpty text="لا توجد سجلات حضور." show={!attendance.length}/>{attendance.slice(0,20).map((r:any)=><Row key={r.id} label={r.date} value={r.checkIn&&r.checkOut?String(r.checkIn)+" → "+String(r.checkOut):String(r.status||"—")}/>)}</Card>
    <Card title="الطلبات"><SectionEmpty text="لا توجد طلبات." show={!requests.length}/>{requests.slice(0,12).map((r:any)=><Row key={r.id} label={r.type+" · "+r.fromDate} value={String(r.status||"—")}/>)}</Card>
    <Card title="الرواتب"><SectionEmpty text="لا توجد مسيرات مسجلة." show={!payroll.length}/>{payroll.slice(0,12).map((r:any)=><Row key={r.id} label={String(r.month)} value={formatMoney(Number(r.netSalary||0))}/>)}</Card>
    <Card title="التعديلات والسلف"><Row label="تعديلات الراتب" value={String(adjustments.length)}/><Row label="السلف" value={String(advances.length)}/></Card>
    <Card title="المستندات"><SectionEmpty text="لا توجد مستندات." show={!docs.length}/>{docs.map((d:any)=><Row key={d.id} label={d.type+" · "+d.title} value={d.expiryDate?String(d.expiryDate):"—"}/>)}</Card>
  </ScrollView></ScreenContainer>;
}

function Card({title,children}:{title:string;children:React.ReactNode}){return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>}
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>}
function SectionEmpty({show,text}:{show:boolean;text:string}){return show?<Text style={styles.muted}>{text}</Text>:null}

const styles=StyleSheet.create({
 content:{padding:22,paddingBottom:60,gap:14,maxWidth:1180,width:"100%",alignSelf:"center"},
 back:{color:"#163A63",fontSize:13,fontWeight:"800",textAlign:"right",paddingVertical:6},
 hero:{backgroundColor:"#163A63",borderRadius:24,padding:22,flexDirection:"row-reverse",alignItems:"center",gap:14},
 avatar:{width:68,height:68,borderRadius:20,backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},
 avatarText:{color:"#163A63",fontSize:22,fontWeight:"900"},
 heroText:{flex:1},kicker:{color:"#D9E6F2",fontSize:9,fontWeight:"900",textAlign:"right"},
 name:{color:"#FFFFFF",fontSize:25,fontWeight:"900",textAlign:"right",marginTop:4},
 role:{color:"#D9E6F2",fontSize:12,textAlign:"right",marginTop:4},
 grid:{flexDirection:"row-reverse",gap:14},
 card:{flex:1,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E4E7EC",borderRadius:18,padding:18},
 cardTitle:{color:"#172033",fontSize:16,fontWeight:"900",textAlign:"right",marginBottom:8},
 row:{flexDirection:"row-reverse",justifyContent:"space-between",paddingVertical:11,borderBottomWidth:1,borderBottomColor:"#E4E7EC",gap:10},
 label:{color:"#667085",fontSize:11},value:{color:"#172033",fontSize:12,fontWeight:"800",maxWidth:"70%",textAlign:"right"},
 center:{flex:1,alignItems:"center",justifyContent:"center",gap:12,padding:24},
 title:{color:"#172033",fontSize:21,fontWeight:"900",textAlign:"center"},
 muted:{color:"#667085",fontSize:12,lineHeight:21,textAlign:"right"},
 button:{backgroundColor:"#163A63",borderRadius:12,paddingHorizontal:22,paddingVertical:12},
 buttonText:{color:"#FFFFFF",fontWeight:"800"}
});