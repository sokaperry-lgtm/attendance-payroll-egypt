import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAppData, type Role } from "@/lib/app-data";
import { formatMoney } from "@/lib/payroll";

const roleLabels: Record<Role, string> = { manager: "مدير", supervisor: "سوبرفايزر", employee: "موظف عادي" };

export default function EmployeesScreen() {
  const router = useRouter();
  const { role, staffMembers, loading, createStaffAccount } = useAppData();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", password: "", title: "", department: "", baseSalary: "", role: "employee" as Role });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Role>("all");

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffMembers.filter((p) => {
      const matchesSearch = !q || [p.name, p.phone, p.title, p.department].some((v) => String(v || "").toLowerCase().includes(q));
      const matchesRole = filter === "all" || (p.role ?? "employee") === filter;
      return matchesSearch && matchesRole;
    });
  }, [staffMembers, search, filter]);

  const activeCount = staffMembers.filter((p) => p.active !== false).length;
  const managerCount = staffMembers.filter((p) => p.role === "manager").length;
  const supervisorCount = staffMembers.filter((p) => p.role === "supervisor").length;

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
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>PEOPLE · TEAM DIRECTORY</Text>
            <Text style={styles.title}>الموظفين</Text>
            <Text style={styles.sub}>دليل فريق الشركة وإدارة صلاحيات الدخول.</Text>
          </View>
          <View style={[styles.headerActions, compact && styles.headerActionsCompact]}>
            <View style={styles.count}><Text style={styles.countValue}>{staffMembers.length}</Text><Text style={styles.countLabel}>موظف</Text></View>
            <Pressable style={styles.addButton} onPress={() => setOpen(true)}>
              <IconSymbol name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>إضافة موظف</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statsGrid}>          <Stat label="إجمالي الفريق" value={String(staffMembers.length)} />          <Stat label="نشط الآن" value={String(activeCount)} />          <Stat label="مديرون" value={String(managerCount)} />          <Stat label="مشرفون" value={String(supervisorCount)} />        </View>        <View style={styles.workspace}>
          <View style={styles.workspaceIcon}><IconSymbol name="person.2.fill" size={24} color="#FFFFFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.workspaceTitle}>Team Workspace</Text>
            <Text style={styles.workspaceText}>أضف الموظفين وحدد الصلاحيات من نفس المكان. اضغط على أي موظف لفتح Employee 360.</Text>
          </View>
        </View>

        {filteredStaff.map(p => (
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
              <View style={[styles.dot, { backgroundColor: p.active === false ? "#667085" : "#163A63" }]} />
              <Text style={styles.active}>{p.active === false ? "موقوف" : "نشط"}</Text>
              <Text style={styles.salary}>{formatMoney(p.baseSalary)}</Text>
            </View>
          </Pressable>
        ))}
        {!filteredStaff.length && <View style={styles.empty}><Text style={styles.emptyIcon}>⌕</Text><Text style={styles.emptyTitle}>لا توجد نتائج</Text><Text style={styles.emptyText}>جرّب تغيير كلمة البحث أو الفلتر.</Text></View>}      </ScrollView>

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
                    <IconSymbol name={"person.2.fill"} size={21} color={form.role === item ? "#FFF" : "#163A63"} />
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

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }function State({ text, loading }: { text: string; loading?: boolean }) {
  return <View style={styles.state}>{loading && <ActivityIndicator color="#163A63" />}<IconSymbol name="person.2.fill" size={34} color="#163A63" /><Text style={styles.stateText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  content:{padding:22,paddingBottom:50,gap:14,maxWidth:1180,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:14},headerCompact:{flexDirection:"column",alignItems:"stretch"},
  headerText:{flex:1},headerActions:{flexDirection:"row-reverse",alignItems:"center",gap:10},headerActionsCompact:{justifyContent:"space-between"},
  eyebrow:{color:"#667085",fontSize:11,fontWeight:"800",textAlign:"right"},title:{color:"#172033",fontSize:30,fontWeight:"900",textAlign:"right"},sub:{color:"#667085",fontSize:12,textAlign:"right",marginTop:5},
  count:{backgroundColor:"#EEF4FB",borderRadius:16,padding:12,alignItems:"center"},countValue:{color:"#163A63",fontSize:22,fontWeight:"900"},countLabel:{color:"#163A63",fontSize:9},
  addButton:{backgroundColor:"#163A63",borderRadius:14,paddingHorizontal:16,paddingVertical:12,flexDirection:"row-reverse",alignItems:"center",gap:7},addButtonText:{color:"#FFFFFF",fontWeight:"800",fontSize:12},
  statsGrid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:10},
  stat:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E8EDF3",borderRadius:17,padding:15,flexGrow:1,flexBasis:170,minHeight:84,justifyContent:"center"},statValue:{color:"#163A63",fontSize:22,fontWeight:"900",textAlign:"right"},statLabel:{color:"#667085",fontSize:10,fontWeight:"700",textAlign:"right",marginTop:3},
  workspace:{backgroundColor:"#163A63",borderRadius:22,padding:19,flexDirection:"row-reverse",gap:12,alignItems:"center"},workspaceIcon:{width:46,height:46,borderRadius:14,backgroundColor:"rgba(255,255,255,0.14)",alignItems:"center",justifyContent:"center"},workspaceTitle:{color:"#FFFFFF",fontSize:16,fontWeight:"900",textAlign:"right"},workspaceText:{color:"#D9E6F2",fontSize:10,lineHeight:17,textAlign:"right",marginTop:4},
  toolbar:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E8EDF3",borderRadius:18,padding:12,gap:10},searchBox:{borderWidth:1,borderColor:"#E4E7EC",borderRadius:13,minHeight:46,flexDirection:"row-reverse",alignItems:"center",paddingHorizontal:12},searchIcon:{color:"#667085",fontSize:24,width:28,textAlign:"center"},searchInput:{flex:1,color:"#172033",fontSize:12,paddingVertical:10},filters:{flexDirection:"row-reverse",flexWrap:"wrap",gap:7},filter:{borderRadius:10,paddingHorizontal:12,paddingVertical:8,backgroundColor:"#F7F9FC"},filterActive:{backgroundColor:"#163A63"},filterText:{color:"#667085",fontSize:10,fontWeight:"800"},filterTextActive:{color:"#FFFFFF"},sectionHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",paddingTop:4},sectionTitle:{color:"#172033",fontSize:17,fontWeight:"900",textAlign:"right"},sectionHint:{color:"#98A6B8",fontSize:10,fontWeight:"700"},

  empty:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#E8EDF3",borderRadius:18,padding:32,alignItems:"center",gap:6},emptyIcon:{fontSize:32,color:"#98A6B8"},emptyTitle:{color:"#172033",fontSize:16,fontWeight:"900"},emptyText:{color:"#667085",fontSize:11},  person:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#F2F5F8",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",gap:11},avatar:{width:48,height:48,borderRadius:15,backgroundColor:"#163A63",alignItems:"center",justifyContent:"center"},avatarText:{color:"#FFFFFF",fontWeight:"900"},
  personCompact:{alignItems:"flex-start"},main:{flex:1},name:{color:"#172033",fontSize:14,fontWeight:"800",textAlign:"right"},role:{color:"#667085",fontSize:11,textAlign:"right",marginTop:3},phone:{color:"#667085",fontSize:10,textAlign:"right"},right:{alignItems:"flex-end",gap:3},dot:{width:9,height:9,borderRadius:5},active:{color:"#667085",fontSize:9},salary:{color:"#163A63",fontSize:10,fontWeight:"800"},
  metaRow:{flexDirection:"row-reverse",alignItems:"center",gap:7,marginTop:5},roleBadge:{borderRadius:7,paddingHorizontal:7,paddingVertical:3},managerBadge:{backgroundColor:"#EEF4FB"},supervisorBadge:{backgroundColor:"#EEF4FB"},employeeBadge:{backgroundColor:"#F7F9FC"},roleBadgeText:{fontSize:9,fontWeight:"800",color:"#98A6B8"},
  modalBackdrop:{flex:1,backgroundColor:"rgba(2,6,23,0.58)",justifyContent:"flex-end"},modalCard:{backgroundColor:"#FFFFFF",borderTopLeftRadius:28,borderTopRightRadius:28,maxHeight:"92%",padding:20},modalHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",marginBottom:10},modalEyebrow:{color:"#98A6B8",fontSize:9,fontWeight:"900",textAlign:"right"},modalTitle:{color:"#172033",fontSize:23,fontWeight:"900",textAlign:"right",marginTop:2},close:{width:36,height:36,borderRadius:18,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},closeText:{color:"#98A6B8",fontSize:25,lineHeight:28},form:{paddingBottom:30,gap:8},label:{color:"#667085",fontSize:11,fontWeight:"800",textAlign:"right",marginTop:7},input:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#667085",borderRadius:12,paddingHorizontal:13,paddingVertical:12,fontSize:13,color:"#172033"},roleOptions:{gap:8},roleOption:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#667085",borderRadius:14,padding:12,flexDirection:"row-reverse",alignItems:"center",gap:9},roleOptionActive:{backgroundColor:"#163A63",borderColor:"#163A63"},roleOptionTitle:{color:"#172033",fontSize:13,fontWeight:"900",minWidth:78,textAlign:"right"},roleOptionTitleActive:{color:"#FFFFFF"},roleOptionSub:{color:"#667085",fontSize:9,flex:1,textAlign:"right"},roleOptionSubActive:{color:"#D9E6F2"},saveButton:{backgroundColor:"#163A63",borderRadius:14,padding:14,marginTop:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8},saveText:{color:"#FFFFFF",fontWeight:"900",fontSize:13},disabled:{opacity:0.6},
  state:{flex:1,alignItems:"center",justifyContent:"center",gap:10},stateText:{color:"#172033",fontSize:18,fontWeight:"800"}
});