import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useState, type ReactNode } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";
import { trpc } from "@/lib/trpc";

export default function HrToolsScreen(){
 const {role,staffMembers}=useAppData(); const month=new Date().toISOString().slice(0,7);
 const canManage=role==="owner" || role==="manager" || role==="hr";
 const adjustments=trpc.hrTools.adjustments.useQuery({month},{enabled:role==="owner" || role==="manager"});
 const advances=trpc.hrTools.advances.useQuery(undefined,{enabled:role==="owner" || role==="manager"});
 const addAdjustment=trpc.hrTools.addAdjustment.useMutation({onSuccess:()=>adjustments.refetch()});
 const addAdvance=trpc.hrTools.addAdvance.useMutation({onSuccess:()=>advances.refetch()});
 const [document,setDocument]=useState({type:"بطاقة شخصية",title:"",documentNumber:"",expiryDate:"",note:""});
 const documentQuery=trpc.hrTools.documents.useQuery({staffAccountId:Number(staffId)},{enabled:canManage && Boolean(staffId)});
 const addDocument=trpc.hrTools.addDocument.useMutation({onSuccess:()=>documentQuery.refetch()});
 const deleteDocument=trpc.hrTools.deleteDocument.useMutation({onSuccess:()=>documentQuery.refetch()});
 const [staffId,setStaffId]=useState(""); const [amount,setAmount]=useState(""); const [title,setTitle]=useState(""); const [type,setType]=useState<"bonus"|"incentive"|"penalty"|"deduction">("incentive"); const [advance,setAdvance]=useState({amount:"",installment:"",staffId:""});
 if(!canManage) return <ScreenContainer><View style={styles.denied}><IconSymbol name="lock" size={34} color="#163A63"/><Text style={styles.deniedTitle}>أدوات الموارد البشرية غير متاحة لهذا الحساب</Text></View></ScreenContainer>;
 const submitAdjustment=async()=>{if(!staffId||!amount||!title)return Alert.alert("بيانات ناقصة","اختار موظف واكتب المبلغ والوصف.");try{await addAdjustment.mutateAsync({staffAccountId:Number(staffId),month,type,title,amount:Number(amount)});setAmount("");setTitle("");Alert.alert("تم","تم تسجيل التعديل وربطه بالمسير.");}catch(e){Alert.alert("خطأ",e instanceof Error?e.message:"تعذر الحفظ.")}};
 const submitAdvance=async()=>{if(!advance.staffId||!advance.amount||!advance.installment)return Alert.alert("بيانات ناقصة","اكمل بيانات السلفة.");try{await addAdvance.mutateAsync({staffAccountId:Number(advance.staffId),amount:Number(advance.amount),installmentAmount:Number(advance.installment),startMonth:month});setAdvance({amount:"",installment:"",staffId:""});Alert.alert("تم","تم تسجيل السلفة.");}catch(e){Alert.alert("خطأ",e instanceof Error?e.message:"تعذر الحفظ.")}};
 return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
  <View style={styles.hero}><View style={styles.heroCopy}><Text style={styles.eyebrow}>PAYROLL 2.0 · HR TOOLS</Text><Text style={styles.title}>الحوافز والجزاءات والسلف</Text><Text style={styles.sub}>إدارة التعديلات المالية والسلف من مكان واحد، مع ربطها مباشرة بمسير الرواتب.</Text></View><View style={styles.heroIcon}><IconSymbol name="banknote" size={26} color="#FFFFFF"/></View></View>
  <Section title="إضافة حافز / جزاء" hint="أضف أي تعديل مالي للموظف قبل اعتماد المسير"><SelectStaff value={staffId} setValue={setStaffId} staff={staffMembers}/><View style={styles.types}>{(["incentive","bonus","penalty","deduction"] as const).map(x=><Pressable key={x} onPress={()=>setType(x)} style={[styles.type,type===x&&styles.typeActive]}><Text style={[styles.typeText,type===x&&styles.typeTextActive]}>{x==="incentive"?"حافز":x==="bonus"?"مكافأة":x==="penalty"?"جزاء":"خصم"}</Text></Pressable>)}</View><TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="وصف التعديل" placeholderTextColor="#8A98AA" textAlign="right"/><TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="المبلغ بالجنيه" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right"/><Pressable style={styles.button} onPress={submitAdjustment}><Text style={styles.buttonText}>حفظ التعديل</Text></Pressable></Section>
  <Section title={`تعديلات شهر ${month}`} hint="آخر التعديلات المرتبطة بمسير الرواتب">{adjustments.data?.length ? adjustments.data.map(a=><View key={a.id} style={styles.item}><View style={styles.amountPill}><Text style={styles.money}>{formatMoney(a.amount)}</Text></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{a.title}</Text><Text style={styles.itemSub}>{staffMembers.find(s=>Number(s.id)===a.staffAccountId)?.name??("موظف #"+a.staffAccountId)} · {a.type}</Text></View></View>) : <Empty text="لا توجد تعديلات مسجلة لهذا الشهر."/>}</Section>
  <Section title="إضافة سلفة / قرض موظف" hint="حدد الموظف وإجمالي السلفة وقيمة القسط الشهري"><SelectStaff value={advance.staffId} setValue={v=>setAdvance(x=>({...x,staffId:v}))} staff={staffMembers}/><TextInput style={styles.input} value={advance.amount} onChangeText={v=>setAdvance(x=>({...x,amount:v}))} placeholder="إجمالي السلفة" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right"/><TextInput style={styles.input} value={advance.installment} onChangeText={v=>setAdvance(x=>({...x,installment:v}))} placeholder="قيمة القسط الشهري" placeholderTextColor="#8A98AA" keyboardType="numeric" textAlign="right"/><Pressable style={styles.button} onPress={submitAdvance}><Text style={styles.buttonText}>تسجيل السلفة</Text></Pressable></Section>
  <Section title="السلف الحالية" hint="الرصيد المتبقي والقسط الشهري لكل سلفة">{advances.data?.length ? advances.data.map(a=><View key={a.id} style={styles.item}><View style={styles.amountPill}><Text style={styles.money}>{formatMoney(a.remainingAmount)}</Text></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{staffMembers.find(s=>Number(s.id)===a.staffAccountId)?.name??("موظف #"+a.staffAccountId)}</Text><Text style={styles.itemSub}>قسط {formatMoney(a.installmentAmount)} · {a.status}</Text></View></View>) : <Empty text="لا توجد سلف حالية."/>}</Section>
  <Section title="مستندات الموظف" hint="اختر موظفًا لإضافة ومراجعة مستنداته.">
   {!staffId ? <Empty text="اختار موظف أولاً لعرض مستنداته."/> : <>
    <View style={styles.documentHeader}><Text style={styles.documentEmployee}>{staffMembers.find(s=>Number(s.id)===Number(staffId))?.name ?? "الموظف المحدد"}</Text><Text style={styles.documentCount}>{documentQuery.data?.length ?? 0} مستند</Text></View>
    <View style={styles.types}>{["بطاقة شخصية","عقد","شهادة","تأمينات","أخرى"].map(x=><Pressable key={x} onPress={()=>setDocument(d=>({...d,type:x}))} style={[styles.type,document.type===x&&styles.typeActive]}><Text style={[styles.typeText,document.type===x&&styles.typeTextActive]}>{x}</Text></Pressable>)}</View>
    <TextInput style={styles.input} value={document.title} onChangeText={v=>setDocument(d=>({...d,title:v}))} placeholder="اسم المستند" placeholderTextColor="#8A98AA" textAlign="right"/>
    <TextInput style={styles.input} value={document.documentNumber} onChangeText={v=>setDocument(d=>({...d,documentNumber:v}))} placeholder="رقم المستند (اختياري)" placeholderTextColor="#8A98AA" textAlign="right"/>
    <TextInput style={styles.input} value={document.expiryDate} onChangeText={v=>setDocument(d=>({...d,expiryDate:v}))} placeholder="تاريخ الانتهاء YYYY-MM-DD (اختياري)" placeholderTextColor="#8A98AA" textAlign="right"/>
    <TextInput style={styles.input} value={document.note} onChangeText={v=>setDocument(d=>({...d,note:v}))} placeholder="ملاحظة (اختياري)" placeholderTextColor="#8A98AA" textAlign="right"/>
    <Pressable style={styles.button} disabled={addDocument.isPending} onPress={async()=>{if(!document.title.trim())return Alert.alert("بيانات ناقصة","اكتب اسم المستند.");try{await addDocument.mutateAsync({staffAccountId:Number(staffId),type:document.type,title:document.title.trim(),documentNumber:document.documentNumber||undefined,expiryDate:document.expiryDate||undefined,note:document.note||undefined});setDocument(d=>({...d,title:"",documentNumber:"",expiryDate:"",note:""}));Alert.alert("تم","تم حفظ المستند.");}catch(e){Alert.alert("خطأ",e instanceof Error?e.message:"تعذر حفظ المستند.");}}}><Text style={styles.buttonText}>{addDocument.isPending?"جاري الحفظ...":"إضافة المستند"}</Text></Pressable>
    {documentQuery.isLoading ? <ActivityIndicator color="#163A63"/> : documentQuery.data?.length ? documentQuery.data.map(d=><View key={d.id} style={styles.item}><View style={styles.itemCopy}><Text style={styles.itemTitle}>{d.title}</Text><Text style={styles.itemSub}>{d.type}{d.documentNumber?" · "+d.documentNumber:""}{d.expiryDate?" · ينتهي "+d.expiryDate:""}</Text></View><Pressable onPress={()=>deleteDocument.mutate({id:d.id})}><Text style={styles.deleteText}>حذف</Text></Pressable></View>) : <Empty text="لا توجد مستندات مسجلة لهذا الموظف."/>}
   </>}
  </Section>
 </ScrollView></ScreenContainer>
}
function SelectStaff({value,setValue,staff}:{value:string;setValue:(v:string)=>void;staff:{id:string;name:string}[]}){return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffRow}>{staff.map(s=><Pressable key={s.id} onPress={()=>setValue(s.id)} style={[styles.staffChip,value===s.id&&styles.staffChipActive]}><Text style={[styles.staffChipText,value===s.id&&styles.staffChipTextActive]}>{s.name}</Text></Pressable>)}</ScrollView>}
function Section({title,hint,children}:{title:string;hint?:string;children?:ReactNode}){return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{hint?<Text style={styles.sectionHint}>{hint}</Text>:null}{children}</View>}
function Empty({text}:{text:string}){return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>}
const styles=StyleSheet.create({
 content:{padding:22,paddingBottom:60,gap:14,maxWidth:1100,width:"100%",alignSelf:"center"},
 hero:{backgroundColor:"#163A63",borderRadius:24,padding:22,flexDirection:"row-reverse",alignItems:"center",gap:16},
 heroCopy:{flex:1},
 heroIcon:{width:48,height:48,borderRadius:15,backgroundColor:"#2B5685",alignItems:"center",justifyContent:"center"},
 eyebrow:{color:"#BFD3EA",fontSize:9,fontWeight:"900",textAlign:"right",letterSpacing:0.7},
 title:{color:"#FFFFFF",fontSize:25,fontWeight:"900",textAlign:"right",marginTop:4},
 sub:{color:"#D8E5F2",fontSize:11,lineHeight:18,textAlign:"right",marginTop:5},
 section:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E4EAF1",borderRadius:20,padding:18,gap:10,shadowColor:"#163A63",shadowOpacity:0.04,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:1},
 sectionTitle:{color:"#163A63",fontSize:16,fontWeight:"900",textAlign:"right"},
 sectionHint:{color:"#728198",fontSize:10,lineHeight:16,textAlign:"right"},
 staffRow:{gap:8,flexDirection:"row-reverse",paddingVertical:2},
 staffChip:{borderWidth:1,borderColor:"#D5DEE9",borderRadius:12,paddingHorizontal:13,paddingVertical:9,backgroundColor:"#F8FAFC"},
 staffChipActive:{backgroundColor:"#163A63",borderColor:"#163A63"},
 staffChipText:{color:"#42536A",fontSize:10,fontWeight:"600"},
 staffChipTextActive:{color:"#FFFFFF",fontWeight:"800"},
 types:{flexDirection:"row-reverse",gap:8},
 type:{flex:1,minHeight:42,borderWidth:1,borderColor:"#CBD5E1",borderRadius:12,paddingHorizontal:8,paddingVertical:10,alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF"},
 typeActive:{backgroundColor:"#163A63",borderColor:"#163A63"},
 typeText:{color:"#42536A",fontSize:10,fontWeight:"800"},
 typeTextActive:{color:"#FFFFFF",fontWeight:"800"},
 input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#CBD5E1",borderRadius:12,paddingHorizontal:13,paddingVertical:12,color:"#163A63",fontSize:12,fontWeight:"600"},
 button:{backgroundColor:"#163A63",borderRadius:12,paddingVertical:13,alignItems:"center",marginTop:2},
 buttonText:{color:"#FFFFFF",fontWeight:"900",fontSize:12},
 item:{flexDirection:"row-reverse",alignItems:"center",gap:12,borderTopWidth:1,borderTopColor:"#EDF1F5",paddingVertical:12},
 itemCopy:{flex:1},
 amountPill:{minWidth:88,paddingHorizontal:10,paddingVertical:8,borderRadius:10,backgroundColor:"#EEF4FA",alignItems:"center"},
 money:{color:"#163A63",fontWeight:"900",fontSize:11},
 itemTitle:{color:"#1E3148",fontWeight:"800",fontSize:12,textAlign:"right"},
 itemSub:{color:"#728198",fontSize:10,textAlign:"right",marginTop:3},
 empty:{backgroundColor:"#F8FAFC",borderRadius:12,padding:14,alignItems:"center"},
 emptyText:{color:"#7B8798",fontSize:10,fontWeight:"600"},
 denied:{flex:1,alignItems:"center",justifyContent:"center",gap:12},
 deniedTitle:{fontSize:19,fontWeight:"900",color:"#163A63"}
});