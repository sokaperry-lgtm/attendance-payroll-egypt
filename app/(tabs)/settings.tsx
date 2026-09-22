import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { showAlert } from "@/lib/alert";
import { trpc } from "@/lib/trpc";
import { useAppData } from "@/lib/app-data";

export default function SettingsScreen() {
  const router = useRouter();
  const { role, branch } = useAppData();
  const { width } = useWindowDimensions();
  const compact = width < 760;

  const overview = trpc.companyAdmin.overview.useQuery();
  const branches = trpc.companyAdmin.branches.useQuery();
  const members = trpc.companyAdmin.members.useQuery();
  const subscription = trpc.companyAdmin.subscription.useQuery();
  const security = trpc.companyAdmin.security.useQuery();

  const updateCompany = trpc.companyAdmin.updateCompany.useMutation();
  const createBranch = trpc.companyAdmin.createBranch.useMutation();
  const updateBranch = trpc.companyAdmin.updateBranch.useMutation();
  const toggleBranch = trpc.companyAdmin.toggleBranch.useMutation();
  const assignBranch = trpc.companyAdmin.assignBranch.useMutation();
  const updateRole = trpc.companyAdmin.role.useMutation();

  const [companyName, setCompanyName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [branchForm, setBranchForm] = useState({ name: "", address: "", latitude: "", longitude: "", radiusMeters: "200" });
  const [showNewBranch, setShowNewBranch] = useState(false);

  useEffect(() => {
    if (overview.data?.company) {
      setCompanyName(overview.data.company.name ?? "");
      setLegalName(overview.data.company.legalName ?? "");
      setCompanyEmail(overview.data.company.email ?? "");
      setCompanyPhone(overview.data.company.phone ?? "");
    }
  }, [overview.data?.company?.id]);

  useEffect(() => {
    const rows = branches.data ?? [];
    if (!selectedBranchId && rows.length) setSelectedBranchId(rows[0].id);
    if (selectedBranchId && !rows.some(b => b.id === selectedBranchId)) setSelectedBranchId(rows[0]?.id ?? null);
  }, [branches.data, selectedBranchId]);

  const selectedBranch = useMemo(
    () => (branches.data ?? []).find(b => b.id === selectedBranchId) ?? null,
    [branches.data, selectedBranchId],
  );

  useEffect(() => {
    if (selectedBranch) {
      setBranchForm({
        name: selectedBranch.name,
        address: selectedBranch.address,
        latitude: selectedBranch.latitude,
        longitude: selectedBranch.longitude,
        radiusMeters: String(selectedBranch.radiusMeters),
      });
    }
  }, [selectedBranch?.id]);

  if (role !== "manager") {
    return <ScreenContainer><View style={styles.denied}><IconSymbol name="settings" size={35} color="#163A63"/><Text style={styles.deniedTitle}>الإعدادات للمدير فقط</Text></View></ScreenContainer>;
  }

  async function saveCompany() {
    if (!companyName.trim()) return showAlert("بيانات ناقصة", "اكتب اسم الشركة.");
    try {
      await updateCompany.mutateAsync({ name: companyName, legalName: legalName || undefined, email: companyEmail || undefined, phone: companyPhone || undefined });
      overview.refetch();
      showAlert("تم الحفظ", "تم تحديث بيانات الشركة.");
    } catch (e: any) { showAlert("تعذر الحفظ", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  async function saveBranch() {
    if (!selectedBranch) return;
    const radius = Number(branchForm.radiusMeters);
    if (!branchForm.name.trim() || !branchForm.address.trim() || !Number.isFinite(radius) || radius < 50) {
      return showAlert("بيانات غير صحيحة", "راجع اسم الفرع والعنوان ونطاق GPS.");
    }
    try {
      await updateBranch.mutateAsync({ branchId: selectedBranch.id, ...branchForm, radiusMeters: radius });
      await branches.refetch();
      showAlert("تم الحفظ", "تم تحديث بيانات الفرع.");
    } catch (e: any) { showAlert("تعذر الحفظ", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  async function addBranch() {
    const radius = Number(branchForm.radiusMeters);
    if (!branchForm.name.trim() || !branchForm.address.trim() || !Number.isFinite(radius) || radius < 50) {
      return showAlert("بيانات ناقصة", "اكتب اسم الفرع والعنوان ونطاق GPS صحيح.");
    }
    try {
      const created = await createBranch.mutateAsync({ ...branchForm, radiusMeters: radius });
      await branches.refetch();
      setSelectedBranchId(created?.id ?? null);
      setShowNewBranch(false);
      showAlert("تم إنشاء الفرع", "الفرع الجديد أصبح متاحًا للإدارة.");
    } catch (e: any) { showAlert("تعذر إنشاء الفرع", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  async function setBranchActive(id: number, active: boolean) {
    try {
      await toggleBranch.mutateAsync({ branchId: id, active });
      await branches.refetch();
      showAlert(active ? "تم تفعيل الفرع" : "تم إيقاف الفرع", active ? "الفرع متاح الآن للحضور." : "لن يتم استخدامه لتسجيل حضور جديد.");
    } catch (e: any) { showAlert("تعذر تغيير الحالة", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  async function moveMember(staffAccountId: number, branchId: number | null) {
    try {
      await assignBranch.mutateAsync({ staffAccountId, branchId });
      await members.refetch();
      await branches.refetch();
    } catch (e: any) { showAlert("تعذر نقل الموظف", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  async function changeRole(staffAccountId: number, nextRole: CompanyRole) {
    try {
      await updateRole.mutateAsync({ staffAccountId, role: nextRole });
      await members.refetch();
      showAlert("تم تحديث الصلاحية", "تم تطبيق الدور الجديد على حساب الموظف.");
    } catch (e: any) { showAlert("تعذر تغيير الصلاحية", e?.message ?? "حدث خطأ غير متوقع."); }
  }

  const activeBranch = branches.data?.filter(b => b.active).length ?? 0;
  const employeeCount = overview.data?.employeeCount ?? 0;

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, compact && styles.headerCompact]}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>ADMIN · COMPANY CONTROL</Text>
            <Text style={styles.title}>الشركة والفروع</Text>
            <Text style={styles.sub}>مركز إدارة الشركة، الفروع، توزيع الموظفين وسياسات الحضور.</Text>
          </View>
          <View style={styles.icon}><IconSymbol name="settings" size={23} color="#163A63"/></View>
        </View>

        <View style={[styles.hero, compact && styles.heroCompact]}>
          <View style={styles.heroIcon}><IconSymbol name="building.2.fill" size={23} color="#FFFFFF"/></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{(overview.data?.company?.name ?? companyName) || "الشركة"}</Text>
            <Text style={styles.heroText}>لوحة تحكم متعددة الفروع · Egypt / EGP / Africa-Cairo</Text>
          </View>
          <View style={styles.heroStats}>
            <Stat value={String(employeeCount)} label="موظف"/>
            <Stat value={String(overview.data?.branchCount ?? 0)} label="فرع"/>
            <Stat value={String(activeBranch)} label="نشط"/>
          </View>
        </View>

        <Section title="بيانات الشركة" subtitle="المعلومات الأساسية للحساب التجاري.">
          <View style={[styles.grid, compact && styles.gridOne]}>
            <Field label="اسم الشركة" value={companyName} set={setCompanyName}/>
            <Field label="الاسم القانوني" value={legalName} set={setLegalName}/>
            <Field label="البريد الإلكتروني" value={companyEmail} set={setCompanyEmail} keyboard="email-address"/>
            <Field label="رقم الهاتف" value={companyPhone} set={setCompanyPhone} keyboard="phone-pad"/>
          </View>
          <Pressable onPress={saveCompany} style={styles.primaryButton}><Text style={styles.primaryText}>{updateCompany.isPending ? "جاري الحفظ..." : "حفظ بيانات الشركة"}</Text></Pressable>
        </Section>

        <Section title="إدارة الفروع" subtitle="كل فرع له موقع GPS ونطاق حضور وحالة مستقلة.">
          <View style={[styles.branchLayout, compact && styles.branchLayoutCompact]}>
            <View style={styles.branchList}>
              {(branches.data ?? []).map(b => (
                <Pressable key={b.id} onPress={() => setSelectedBranchId(b.id)} style={[styles.branchCard, selectedBranchId === b.id && styles.branchCardActive]}>
                  <View style={styles.branchCardTop}>
                    <View style={[styles.statusDot, { backgroundColor: b.active ? "#2E7D68" : "#98A2B3" }]} />
                    <Text style={styles.branchName}>{b.name}</Text>
                  </View>
                  <Text style={styles.branchMeta}>{b.address}</Text>
                  <View style={styles.branchMiniRow}><Text style={styles.miniValue}>{b.employeeCount ?? 0}</Text><Text style={styles.miniLabel}>موظف</Text><Text style={styles.miniValue}>{b.radiusMeters}m</Text><Text style={styles.miniLabel}>GPS</Text></View>
                </Pressable>
              ))}
              <Pressable onPress={() => { setShowNewBranch(true); setBranchForm({ name:"", address:"", latitude:"30.0444", longitude:"31.2357", radiusMeters:"200" }); }} style={styles.addBranch}><Text style={styles.addBranchText}>＋ إضافة فرع جديد</Text></Pressable>
            </View>

            <View style={styles.editor}>
              <View style={styles.editorHeader}><View><Text style={styles.cardTitle}>{showNewBranch ? "فرع جديد" : selectedBranch?.name ?? "اختر فرعًا"}</Text><Text style={styles.editorSub}>{showNewBranch ? "إنشاء موقع تشغيل جديد" : "تعديل بيانات وموقع الفرع"}</Text></View><View style={styles.badge}><Text style={styles.badgeText}>{showNewBranch ? "NEW" : selectedBranch?.active ? "ACTIVE" : "PAUSED"}</Text></View></View>
              <View style={[styles.grid, compact && styles.gridOne]}>
                <Field label="اسم الفرع" value={branchForm.name} set={v => setBranchForm(x => ({...x,name:v}))}/>
                <Field label="العنوان" value={branchForm.address} set={v => setBranchForm(x => ({...x,address:v}))}/>
                <Field label="Latitude" value={branchForm.latitude} set={v => setBranchForm(x => ({...x,latitude:v}))}/>
                <Field label="Longitude" value={branchForm.longitude} set={v => setBranchForm(x => ({...x,longitude:v}))}/>
                <Field label="نطاق GPS بالمتر" value={branchForm.radiusMeters} set={v => setBranchForm(x => ({...x,radiusMeters:v}))} keyboard="numeric"/>
              </View>
              {showNewBranch ? (
                <View style={styles.actionRow}><Pressable onPress={addBranch} style={styles.primaryButton}><Text style={styles.primaryText}>إنشاء الفرع</Text></Pressable><Pressable onPress={() => setShowNewBranch(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>إلغاء</Text></Pressable></View>
              ) : selectedBranch ? (
                <View style={styles.actionRow}><Pressable onPress={saveBranch} style={styles.primaryButton}><Text style={styles.primaryText}>حفظ التعديلات</Text></Pressable><Pressable onPress={() => setBranchActive(selectedBranch.id, !selectedBranch.active)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{selectedBranch.active ? "إيقاف الفرع" : "تفعيل الفرع"}</Text></Pressable></View>
              ) : null}
            </View>
          </View>
        </Section>

        <Section title="توزيع الموظفين" subtitle="انقل الموظف بين الفروع مباشرة من نفس المركز.">
          <View style={styles.memberList}>
            {(members.data ?? []).map((member: any) => (
              <View key={member.id} style={[styles.memberRow, compact && styles.memberRowCompact]}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberMeta}>{member.title ?? "موظف"} · {member.branchName ?? "بدون فرع"}</Text>
                  <Text style={styles.roleCaption}>الدور الحالي: {roleLabel(member.membershipRole)}</Text>
                </View>
                <View style={styles.memberControls}>
                  <View style={styles.branchChips}>
                    {(branches.data ?? []).filter(b => b.active).map(b => (
                      <Pressable key={b.id} onPress={() => moveMember(member.id, b.id)} style={[styles.chip, member.branchId === b.id && styles.chipActive]}>
                        <Text style={[styles.chipText, member.branchId === b.id && styles.chipTextActive]}>{b.name}</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => moveMember(member.id, null)} style={[styles.chip, !member.branchId && styles.chipActive]}><Text style={[styles.chipText, !member.branchId && styles.chipTextActive]}>بدون فرع</Text></Pressable>
                  </View>
                  <View style={styles.roleChips}>
                    {(["hr","manager","supervisor","accountant","employee"] as CompanyRole[]).map(r => (
                      <Pressable key={r} onPress={() => changeRole(member.id, r)} style={[styles.chip, member.membershipRole === r && styles.roleChipActive]}>
                        <Text style={[styles.chipText, member.membershipRole === r && styles.chipTextActive]}>{roleLabel(r)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            ))}
            {(members.data ?? []).length === 0 && <Text style={styles.hint}>لا يوجد موظفون مرتبطون بالشركة.</Text>}
          </View>
        </Section>

        <View style={[styles.bottomGrid, compact && styles.bottomGridOne]}>
          <Section title="SaaS & Security" subtitle="حالة الاشتراك والحماية.">
            <Row label="الباقة" value={subscription.data?.plan === "trial" ? "تجريبية" : subscription.data?.plan ?? "—"}/>
            <Row label="الحالة" value={subscription.data?.status === "trialing" ? "تجريبية" : subscription.data?.status ?? "—"}/>
            <Row label="المقاعد" value={String(subscription.data?.seats ?? "—")}/>
            <Row label="تشفير كلمات المرور" value={security.data?.passwordHash ?? "—"}/>
            <Row label="Audit Log" value={security.data?.auditLog ? "مفعّل" : "—"}/>
            <Pressable onPress={() => router.push("/audit")} style={styles.securityButton}><IconSymbol name="lock.shield.fill" size={17} color="#FFFFFF"/><Text style={styles.securityButtonText}>فتح مركز الأمان وسجل العمليات</Text></Pressable>
          </Section>
          <Section title="حالة النظام" subtitle="ملخص سريع.">
            <Row label="الفروع النشطة" value={String(activeBranch)}/>
            <Row label="إجمالي الموظفين" value={String(employeeCount)}/>
            <Row label="تسجيل الموقع" value="GPS مفعّل"/>
            <Row label="الرواتب" value="محسوبة تلقائيًا"/>
            <Row label="العملة" value="EGP"/>
            <Row label="المنطقة الزمنية" value="Africa/Cairo"/>
          </Section>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, subtitle, children }: { title:string; subtitle:string; children:ReactNode }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardSub}>{subtitle}</Text>{children}</View>;
}
function Field({ label, value, set, keyboard="default" }: { label:string; value:string; set:(v:string)=>void; keyboard?:any }) {
  return <View style={{ flex:1, minWidth:170 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={set} keyboardType={keyboard} style={styles.input} textAlign="right"/></View>;
}
function Row({ label, value }: { label:string; value:string }) {
  return <View style={styles.statusRow}><Text style={styles.value}>{value}</Text><Text style={styles.label}>{label}</Text></View>;
}
function Stat({ value, label }: { value:string; label:string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}
type CompanyRole = "owner" | "hr" | "manager" | "supervisor" | "accountant" | "employee";
function roleLabel(role?: string) {
  return ({ owner:"مالك", hr:"HR", manager:"مدير", supervisor:"مشرف", accountant:"محاسب", employee:"موظف" } as Record<string,string>)[role ?? ""] ?? role ?? "—";
}

const styles=StyleSheet.create({
  content:{padding:22,paddingBottom:60,gap:16,maxWidth:1200,width:"100%",alignSelf:"center"},
  header:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center",gap:16},
  headerCompact:{alignItems:"flex-end"},
  headerText:{flex:1},eyebrow:{color:"#667085",fontSize:11,fontWeight:"800",textAlign:"right"},title:{color:"#172033",fontSize:30,fontWeight:"900",textAlign:"right"},sub:{color:"#667085",fontSize:12,textAlign:"right",marginTop:5},icon:{width:52,height:52,borderRadius:17,backgroundColor:"#EEF4FB",alignItems:"center",justifyContent:"center"},
  hero:{backgroundColor:"#163A63",borderRadius:24,padding:20,flexDirection:"row-reverse",gap:14,alignItems:"center"},heroCompact:{flexWrap:"wrap"},heroIcon:{width:46,height:46,borderRadius:14,backgroundColor:"rgba(255,255,255,.14)",alignItems:"center",justifyContent:"center"},heroTitle:{color:"#FFFFFF",fontSize:18,fontWeight:"900",textAlign:"right"},heroText:{color:"#D8E6F5",fontSize:10,textAlign:"right",marginTop:4},heroStats:{flexDirection:"row-reverse",gap:8},stat:{minWidth:58,alignItems:"center",backgroundColor:"rgba(255,255,255,.1)",borderRadius:13,paddingVertical:8,paddingHorizontal:7},statValue:{color:"#FFFFFF",fontSize:16,fontWeight:"900"},statLabel:{color:"#D8E6F5",fontSize:8,marginTop:2},
  card:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#F2F5F8",borderRadius:20,padding:18,gap:8},cardTitle:{color:"#172033",fontSize:16,fontWeight:"900",textAlign:"right"},cardSub:{color:"#98A2B3",fontSize:10,textAlign:"right",marginBottom:6},
  grid:{flexDirection:"row-reverse",flexWrap:"wrap",gap:10},gridOne:{flexDirection:"column"},label:{color:"#667085",fontSize:10,fontWeight:"700",textAlign:"right",marginBottom:5},input:{borderWidth:1,borderColor:"#D9E0E8",borderRadius:11,padding:10,color:"#172033",fontSize:12,backgroundColor:"#FBFCFE",marginBottom:8},primaryButton:{backgroundColor:"#163A63",borderRadius:13,padding:13,alignItems:"center",justifyContent:"center",flex:1},primaryText:{color:"#FFFFFF",fontWeight:"900",fontSize:12},secondaryButton:{borderWidth:1,borderColor:"#D9E0E8",borderRadius:13,padding:12,alignItems:"center",justifyContent:"center",flex:1},secondaryText:{color:"#163A63",fontWeight:"900",fontSize:12},actionRow:{flexDirection:"row-reverse",gap:9,marginTop:4},
  branchLayout:{flexDirection:"row-reverse",gap:12},branchLayoutCompact:{flexDirection:"column"},branchList:{width:300,gap:8},branchCard:{borderWidth:1,borderColor:"#EDF1F5",borderRadius:15,padding:13,backgroundColor:"#FBFCFE",gap:5},branchCardActive:{borderColor:"#9CB8D5",backgroundColor:"#F5F9FD"},branchCardTop:{flexDirection:"row-reverse",alignItems:"center",gap:7},statusDot:{width:8,height:8,borderRadius:4},branchName:{color:"#172033",fontSize:13,fontWeight:"900",textAlign:"right",flex:1},branchMeta:{color:"#667085",fontSize:9,textAlign:"right"},branchMiniRow:{flexDirection:"row-reverse",gap:5,alignItems:"center"},miniValue:{color:"#163A63",fontSize:10,fontWeight:"900"},miniLabel:{color:"#98A2B3",fontSize:8},addBranch:{borderWidth:1,borderStyle:"dashed",borderColor:"#9CB8D5",borderRadius:14,padding:13,alignItems:"center"},addBranchText:{color:"#163A63",fontWeight:"900",fontSize:11},
  editor:{flex:1,borderWidth:1,borderColor:"#EDF1F5",borderRadius:17,padding:15,gap:8},editorHeader:{flexDirection:"row-reverse",justifyContent:"space-between",alignItems:"center"},editorSub:{color:"#98A2B3",fontSize:9,textAlign:"right",marginTop:2},badge:{backgroundColor:"#E7F4EF",paddingHorizontal:9,paddingVertical:5,borderRadius:8},badgeText:{color:"#2E7D68",fontSize:8,fontWeight:"900"},
  memberList:{gap:7},memberRow:{borderWidth:1,borderColor:"#EDF1F5",borderRadius:14,padding:11,flexDirection:"row-reverse",alignItems:"center",gap:12},memberRowCompact:{flexDirection:"column",alignItems:"stretch"},memberInfo:{minWidth:190,flex:1},memberName:{color:"#172033",fontSize:12,fontWeight:"900",textAlign:"right"},memberMeta:{color:"#98A2B3",fontSize:9,textAlign:"right",marginTop:2},roleCaption:{color:"#163A63",fontSize:9,fontWeight:"800",textAlign:"right",marginTop:4},memberControls:{flex:2,gap:7},branchChips:{flexDirection:"row-reverse",flexWrap:"wrap",gap:6},roleChips:{flexDirection:"row-reverse",flexWrap:"wrap",gap:6},chip:{borderWidth:1,borderColor:"#D9E0E8",borderRadius:10,paddingHorizontal:9,paddingVertical:7,backgroundColor:"#FFFFFF"},chipActive:{backgroundColor:"#163A63",borderColor:"#163A63"},roleChipActive:{backgroundColor:"#2E7D68",borderColor:"#2E7D68"},chipText:{color:"#667085",fontSize:9,fontWeight:"800"},chipTextActive:{color:"#FFFFFF"},
  bottomGrid:{flexDirection:"row-reverse",gap:12},bottomGridOne:{flexDirection:"column"},statusRow:{flexDirection:"row-reverse",justifyContent:"space-between",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#F7F9FC"},value:{color:"#163A63",fontSize:11,fontWeight:"900"},securityButton:{marginTop:8,backgroundColor:"#163A63",borderRadius:12,padding:12,flexDirection:"row-reverse",alignItems:"center",justifyContent:"center",gap:8},securityButtonText:{color:"#FFFFFF",fontSize:10,fontWeight:"800"},hint:{color:"#667085",fontSize:11,textAlign:"right"},denied:{flex:1,alignItems:"center",justifyContent:"center",gap:12},deniedTitle:{color:"#172033",fontSize:19,fontWeight:"800"}
});