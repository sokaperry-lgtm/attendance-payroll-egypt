import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type Role } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";

const roleLabels: Record<Role, string> = { manager: "مدير", supervisor: "سوبرفايزر", employee: "موظف عادي" };

export default function EmployeesScreen() {
  const router = useRouter();
  const { role, staffMembers, loading, createStaffAccount } = useAppData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", password: "", title: "", department: "", baseSalary: "", role: "employee" as Role });

  if (role !== "manager") return <ScreenContainer><State text="إدارة الموظفين للمدير فقط" /></ScreenContainer>;
  if (loading) return <ScreenContainer><State text="جاري تحميل الفريق..." loading /></ScreenContainer>;

  const reset = () => {
    setForm({ name: "", phone: "", password: "", title: "", department: "", baseSalary: "", role: "employee" });
    setOpen(false);
  };

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim() || form.password.length < 6) {
      Alert.alert("بيانات ناقصة", "اكتب الاسم ورقم الهاتف وكلمة مرور لا تقل عن 6 أحرف.");
      return;
    }
    setSaving(true);
    try {
      await createStaffAccount({
        name: form.name.trim(),
        phone: form.phone.trim(),
        password: form.password,
        title: form.title.trim() || roleLabels[form.role],
        department: form.department.trim() || "عام",
        baseSalary: Number(form.baseSalary) || 0,
        role: form.role,
      });
      Alert.alert("تم إنشاء الحساب", "تم إضافة " + form.name + " كـ " + roleLabels[form.role] + " ويمكنه تسجيل الدخول من صفحة الدخول.");
      reset();
    } catch (error) {
      Alert.alert("تعذر إنشاء الحساب", error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>PEOPLE · TEAM DIRECTORY</Text>
            <Text style={styles.title}>الموظفين</Text>
            <Text style={styles.sub}>دليل فريق الشركة وإدارة صلاحيات الدخول.</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.count}><Text style={styles.countValue}>{staffMembers.length}</Text><Text style={styles.countLabel}>موظف</Text></View>
            <Pressable style={styles.addButton} onPress={() => setOpen(true)}>
              <IconSymbol name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>إضافة موظف</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <IconSymbol name="person.2.fill" size={25} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Team Workspace</Text>
            <Text style={styles.heroText}>عند إضافة موظف جديد اختر مستوى الوصول: مدير، سوبرفايزر أو موظف عادي.</Text>
          </View>
        </View>

        {staffMembers.map(p => (
          <Pressable key={p.id} style={styles.person} onPress={() => router.push(("/employee/" + p.id) as never)}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{p.initials}</Text></View>
            <View style={styles.main}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.role}>{p.title} · {p.department}</Text>
              <View style={styles.metaRow}>
                <View style={[styles.roleBadge, p.role === "manager" ? styles.managerBadge : p.role === "supervisor" ? styles.supervisorBadge : styles.employeeBadge]}>
                  <Text style={styles.roleBadgeText}>{roleLabels[p.role ?? "employee"]}</Text>
                </View>
                <Text style={styles.phone}>{p.phone || "لا يوجد رقم هاتف"}</Text>
              </View>
            </View>
            <View style={styles.right}>
              <View style={[styles.dot, { backgroundColor: p.active === false ? "#8A918D" : "#2E7D68" }]} />
              <Text style={styles.active}>{p.active === false ? "موقوف" : "نشط"}</Text>
              <Text style={styles.salary}>{formatMoney(p.baseSalary)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => !saving && setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalEyebrow}>NEW TEAM MEMBER</Text><Text style={styles.modalTitle}>إضافة موظف جديد</Text></View>
              <Pressable disabled={saving} onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
              <Text style={styles.label}>الاسم بالكامل</Text>
              <TextInput style={styles.input} value={form.name} onChangeText={name => setForm(f => ({ ...f, name }))} placeholder="مثال: أحمد محمد" textAlign="right" />

              <Text style={styles.label}>رقم الهاتف</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={phone => setForm(f => ({ ...f, phone }))} placeholder="01xxxxxxxxx" keyboardType="phone-pad" textAlign="right" />

              <Text style={styles.label}>كلمة مرور الدخول</Text>
              <TextInput style={styles.input} value={form.password} onChangeText={password => setForm(f => ({ ...f, password }))} placeholder="6 أحرف على الأقل" secureTextEntry textAlign="right" />

              <Text style={styles.label}>نوع الحساب والصلاحية</Text>
              <View style={styles.roleOptions}>
                {(["manager", "supervisor", "employee"] as Role[]).map(item => (
                  <Pressable key={item} onPress={() => setForm(f => ({ ...f, role: item }))} style={[styles.roleOption, form.role === item && styles.roleOptionActive]}>
                    <IconSymbol name={"person.2.fill"} size={21} color={form.role === item ? "#FFF" : "#668C7F"} />
                    <Text style={[styles.roleOptionTitle, form.role === item && styles.roleOptionTitleActive]}>{roleLabels[item]}</Text>
                    <Text style={[styles.roleOptionSub, form.role === item && styles.roleOptionSubActive]}>{item === "manager" ? "صلاحيات إدارية كاملة" : item === "supervisor" ? "إدارة وتشغيل الفريق" : "وصول الموظف الشخصي"}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>المسمى الوظيفي</Text>
              <TextInput style={styles.input} value={form.title} onChangeText={title => setForm(f => ({ ...f, title }))} placeholder="مثال: Operations Manager" textAlign="right" />

              <Text style={styles.label}>القسم</Text>
              <TextInput style={styles.input} value={form.department} onChangeText={department => setForm(f => ({ ...f, department }))} placeholder="مثال: Operations" textAlign="right" />

              <Text style={styles.label}>المرتب الأساسي</Text>
              <TextInput style={styles.input} value={form.baseSalary} onChangeText={baseSalary => setForm(f => ({ ...f, baseSalary }))} placeholder="0" keyboardType="numeric" textAlign="right" />

              <Pressable style={[styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={save}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <><IconSymbol name="checkmark" size={18} color="#FFFFFF" /><Text style={styles.saveText}>إنشاء الحساب</Text></>}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function State({ text, loading }: { text: string; loading?: boolean }) {
  return <View style={styles.state}>{loading && <ActivityIndicator color="#668C7F" />}<IconSymbol name="person.2.fill" size={34} color="#668C7F" /><Text style={styles.stateText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  content:{padding:22,paddingBottom:50,gap:14,maxWidth:1180,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:14},
  headerText:{flex:1},headerActions:{flexDirection:"row-reverse",alignItems:"center",gap:10},
  eyebrow:{color:"#7B817E",fontSize:11,fontWeight:"800",textAlign:"right"},title:{color:"#303735",fontSize:30,fontWeight:"900",textAlign:"right"},sub:{color:"#7B817E",fontSize:12,textAlign:"right",marginTop:5},
  count:{backgroundColor:"#E8EEE9",borderRadius:16,padding:12,alignItems:"center"},countValue:{color:"#668C7F",fontSize:22,fontWeight:"900"},countLabel:{color:"#668C7F",fontSize:9},
  addButton:{backgroundColor:"#668C7F",borderRadius:14,paddingHorizontal:16,paddingVertical:12,flexDirection:"row-reverse",alignItems:"center",gap:7},addButtonText:{color:"#FFFFFF",fontWeight:"800",fontSize:12},
  hero:{backgroundColor:"#FFFFFF",borderRadius:24,padding:19,flexDirection:"row-reverse",gap:12,alignItems:"center"},heroTitle:{color:"#FFFFFF",fontSize:16,fontWeight:"800",textAlign:"right"},heroText:{color:"#8A918D",fontSize:10,textAlign:"right",marginTop:4},
  person:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E7E2D9",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",gap:11},avatar:{width:48,height:48,borderRadius:15,backgroundColor:"#668C7F",alignItems:"center",justifyContent:"center"},avatarText:{color:"#FFFFFF",fontWeight:"900"},
  main:{flex:1},name:{color:"#303735",fontSize:14,fontWeight:"800",textAlign:"right"},role:{color:"#7B817E",fontSize:11,textAlign:"right",marginTop:3},phone:{color:"#8A918D",fontSize:10,textAlign:"right"},right:{alignItems:"flex-end",gap:3},dot:{width:9,height:9,borderRadius:5},active:{color:"#7B817E",fontSize:9},salary:{color:"#668C7F",fontSize:10,fontWeight:"800"},
  metaRow:{flexDirection:"row-reverse",alignItems:"center",gap:7,marginTop:5},roleBadge:{borderRadius:7,paddingHorizontal:7,paddingVertical:3},managerBadge:{backgroundColor:"#E8EEE9"},supervisorBadge:{backgroundColor:"#EEE9F4"},employeeBadge:{backgroundColor:"#F3F0EA"},roleBadgeText:{fontSize:9,fontWeight:"800",color:"#AAB4C4"},
  modalBackdrop:{flex:1,backgroundColor:"rgba(2,6,23,0.58)",justifyContent:"flex-end"},modalCard:{backgroundColor:"#10161F",borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"92%",padding:20},modalHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",marginBottom:10},modalEyebrow:{color:"#7B817E",fontSize:9,fontWeight:"900",textAlign:"right"},modalTitle:{color:"#303735",fontSize:23,fontWeight:"900",textAlign:"right",marginTop:2},close:{width:36,height:36,borderRadius:18,backgroundColor:"#1E2733",alignItems:"center",justifyContent:"center"},closeText:{color:"#AAB4C4",fontSize:25,lineHeight:28},form:{paddingBottom:30,gap:8},label:{color:"#AAB4C4",fontSize:11,fontWeight:"800",textAlign:"right",marginTop:7},input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#8B96A8",borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:13,color:"#303735"},roleOptions:{gap:8},roleOption:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#8B96A8",borderRadius:14,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:9},roleOptionActive:{backgroundColor:"#668C7F",borderColor:"#668C7F"},roleOptionTitle:{color:"#303735",fontSize:13,fontWeight:"900",minWidth:78,textAlign:"right"},roleOptionTitleActive:{color:"#FFFFFF"},roleOptionSub:{color:"#7B817E",fontSize:9,flex:1,textAlign:"right"},roleOptionSubActive:{color:"#BFDBFE"},saveButton:{backgroundColor:"#FFFFFF",borderRadius:14,padding:14,marginTop:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8},saveText:{color:"#FFFFFF",fontWeight:"900",fontSize:13},disabled:{opacity:0.6},
  state:{flex:1,alignItems:"center",justifyContent:"center",gap:10},stateText:{color:"#303735",fontSize:18,fontWeight:"800"}
});