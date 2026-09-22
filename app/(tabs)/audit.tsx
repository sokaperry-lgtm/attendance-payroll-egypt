import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { PageHeader, SectionTitle, SurfaceCard, UI } from "@/components/ui/design-system";
import { trpc } from "@/lib/trpc";

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "auth.login": "تسجيل دخول",
    "auth.logout": "تسجيل خروج",
    "staff.updated": "تعديل موظف",
    "role.updated": "تعديل صلاحية",
    "attendance.updated": "تعديل حضور",
    "attendance.exception.approve": "اعتماد مخالفة حضور",
    "attendance.exception.cancel": "إلغاء مخالفة حضور",
    "leave.request.مقبول": "اعتماد إجازة",
    "leave.request.مرفوض": "رفض إجازة",
    "request.reviewed": "مراجعة طلب",
    "salary_adjustment.created": "إضافة تعديل راتب",
    "subscription.updated": "تعديل الاشتراك",
  };
  return labels[action] ?? action.replaceAll(".", " · ");
}

function actionTone(action: string) {
  if (action.includes("login") || action.includes("approve") || action.includes("مقبول")) return "#2E7D68";
  if (action.includes("logout") || action.includes("cancel") || action.includes("مرفوض")) return "#B85C5C";
  return UI.primary;
}

export default function AuditScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "auth" | "changes">("all");
  const query = trpc.audit.list.useQuery(undefined, { retry: false });
  const security = trpc.companyAdmin.security.useQuery(undefined, { retry: false });
  const logs = query.data ?? [];

  const filtered = useMemo(() => {
    if (filter === "auth") return logs.filter((x) => x.action.startsWith("auth."));
    if (filter === "changes") return logs.filter((x) => !x.action.startsWith("auth."));
    return logs;
  }, [filter, logs]);

  const stats = useMemo(() => ({
    total: logs.length,
    logins: logs.filter((x) => x.action === "auth.login").length,
    changes: logs.filter((x) => !x.action.startsWith("auth.")).length,
  }), [logs]);

  if (query.isLoading) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color={UI.primary} /><Text style={styles.stateText}>جاري تحميل مركز الأمان...</Text></View></ScreenContainer>;
  }

  if (query.isError) {
    return <ScreenContainer><View style={styles.state}><Text style={styles.errorTitle}>تعذر تحميل مركز الأمان</Text><Text style={styles.stateText}>هذه الشاشة متاحة لمالك الشركة فقط.</Text></View></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow="SECURITY · CONTROL CENTER" title="مركز الأمان" subtitle="رؤية واضحة لكل العمليات الحساسة داخل الشركة، مع سجل تدقيق مركزي وحالة حماية النظام." icon="lock.shield.fill" />

        <SurfaceCard style={styles.securityHero}>
          <View style={styles.shield}><IconSymbol name="lock.shield.fill" size={25} color="#FFFFFF" /></View>
          <View style={styles.securityHeroCopy}>
            <Text style={styles.securityHeroTitle}>النظام محمي ومراقَب</Text>
            <Text style={styles.securityHeroText}>عزل بيانات الشركات والصلاحيات حسب الدور وسجل العمليات مفعّلون.</Text>
          </View>
          <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>ACTIVE</Text></View>
        </SurfaceCard>

        <View style={styles.stats}>
          <Stat label="إجمالي العمليات" value={stats.total} icon="list.bullet" />
          <Stat label="تسجيلات الدخول" value={stats.logins} icon="person.badge.key.fill" />
          <Stat label="عمليات التعديل" value={stats.changes} icon="pencil" />
        </View>

        <View style={styles.grid}>
          <SurfaceCard style={styles.panel}>
            <SectionTitle title="حالة الحماية" subtitle="مؤشرات الأمان الأساسية" />
            <SecurityRow label="عزل بيانات الشركات" value={security.data?.tenantIsolation ?? "—"} ok={!!security.data?.tenantIsolation} />
            <SecurityRow label="الصلاحيات حسب الدور" value={security.data?.roleBasedAccess ? "مفعّل" : "—"} ok={!!security.data?.roleBasedAccess} />
            <SecurityRow label="تشفير كلمات المرور" value={security.data?.passwordHash ?? "—"} ok={!!security.data?.passwordHash} />
            <SecurityRow label="Audit Log" value={security.data?.auditLog ? "مفعّل" : "—"} ok={!!security.data?.auditLog} />
            <SecurityRow label="سياسة الجلسة" value={security.data?.sessionPolicy ?? "—"} ok={!!security.data?.sessionPolicy} />
          </SurfaceCard>

          <SurfaceCard style={styles.panel}>
            <SectionTitle title="إدارة الأمان" subtitle="اختصارات للمدير" />
            <Pressable style={styles.actionCard} onPress={() => router.push("/settings")}>
              <View style={styles.actionIcon}><IconSymbol name="settings" size={18} color={UI.primary} /></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>إعدادات الشركة</Text><Text style={styles.actionText}>السياسات والفرع والصلاحيات</Text></View>
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            <Pressable style={styles.actionCard} onPress={() => router.push("/employees")}>
              <View style={styles.actionIcon}><IconSymbol name="person.2.fill" size={18} color={UI.primary} /></View>
              <View style={styles.actionCopy}><Text style={styles.actionTitle}>إدارة الموظفين</Text><Text style={styles.actionText}>الحسابات والأدوار والحالة</Text></View>
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
          </SurfaceCard>
        </View>

        <SurfaceCard>
          <View style={styles.activityHeader}>
            <SectionTitle title="سجل العمليات" subtitle="الأحدث يظهر أولًا" />
            <Text style={styles.count}>{filtered.length} عملية</Text>
          </View>
          <View style={styles.filters}>
            <Filter label="الكل" active={filter === "all"} onPress={() => setFilter("all")} />
            <Filter label="الدخول والخروج" active={filter === "auth"} onPress={() => setFilter("auth")} />
            <Filter label="التعديلات" active={filter === "changes"} onPress={() => setFilter("changes")} />
          </View>
          <View style={styles.list}>
            {filtered.length ? filtered.map((log) => (
              <View key={log.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: actionTone(log.action) }]} />
                <View style={styles.copy}>
                  <Text style={styles.action}>{actionLabel(log.action)}</Text>
                  <Text style={styles.meta}>المستخدم #{log.staffAccountId}{log.entityId ? " · " + (log.entity ?? "عنصر") + " #" + log.entityId : ""}</Text>
                  <Text style={styles.time}>{new Date(log.createdAt).toLocaleString("ar-EG")}</Text>
                </View>
              </View>
            )) : <Text style={styles.empty}>لا توجد عمليات ضمن الفلتر الحالي.</Text>}
          </View>
        </SurfaceCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return <SurfaceCard style={styles.stat}><View style={styles.statIcon}><IconSymbol name={icon as never} size={16} color={UI.primary} /></View><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></SurfaceCard>;
}

function SecurityRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <View style={styles.securityRow}><View style={[styles.check, { backgroundColor: ok ? "#E7F4EF" : "#FDECEC" }]}><Text style={{ color: ok ? "#2E7D68" : "#B85C5C", fontWeight: "900" }}>{ok ? "✓" : "!"}</Text></View><Text style={styles.securityValue}>{value}</Text><Text style={styles.securityLabel}>{label}</Text></View>;
}

function Filter({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.filter, active && styles.filterActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1240, width: "100%", alignSelf: "center" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { color: UI.muted, fontSize: 12, textAlign: "center" },
  errorTitle: { color: UI.ink, fontSize: 18, fontWeight: "900" },
  securityHero: { flexDirection: "row-reverse", alignItems: "center", gap: 13, backgroundColor: "#163A63", borderColor: "#163A63" },
  shield: { width: 48, height: 48, borderRadius: 15, backgroundColor: "rgba(255,255,255,.14)", alignItems: "center", justifyContent: "center" },
  securityHeroCopy: { flex: 1 },
  securityHeroTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900", textAlign: "right" },
  securityHeroText: { color: "#D8E6F5", fontSize: 10, lineHeight: 16, marginTop: 4, textAlign: "right" },
  live: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,.12)", flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#65C18C" },
  liveText: { color: "#FFFFFF", fontSize: 8, fontWeight: "900" },
  stats: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 190, minHeight: 110 },
  statIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F0F5F3", alignItems: "center", justifyContent: "center", marginBottom: 9 },
  statLabel: { color: UI.muted, fontSize: 10, textAlign: "right" },
  statValue: { color: UI.ink, fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 3 },
  grid: { flexDirection: "row-reverse", gap: 14, flexWrap: "wrap" },
  panel: { flex: 1, minWidth: 330 },
  securityRow: { flexDirection: "row-reverse", alignItems: "center", gap: 9, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EEF1F0" },
  check: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  securityValue: { flex: 1, color: UI.primary, fontSize: 10, fontWeight: "800", textAlign: "left" },
  securityLabel: { flex: 1.4, color: UI.ink, fontSize: 10, fontWeight: "700", textAlign: "right" },
  actionCard: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EEF1F0" },
  actionIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#F0F5F3", alignItems: "center", justifyContent: "center" },
  actionCopy: { flex: 1 },
  actionTitle: { color: UI.ink, fontSize: 11, fontWeight: "900", textAlign: "right" },
  actionText: { color: UI.muted, fontSize: 9, marginTop: 2, textAlign: "right" },
  arrow: { color: "#98A2B3", fontSize: 20 },
  activityHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  count: { color: UI.muted, fontSize: 9 },
  filters: { flexDirection: "row-reverse", gap: 7, marginTop: 8, flexWrap: "wrap" },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#F6F8FA" },
  filterActive: { backgroundColor: "#EAF2FA" },
  filterText: { color: UI.muted, fontSize: 9, fontWeight: "700" },
  filterTextActive: { color: UI.primary },
  list: { marginTop: 8 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EEF1F0" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  copy: { flex: 1 },
  action: { color: UI.ink, fontSize: 12, fontWeight: "900", textAlign: "right" },
  meta: { color: UI.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  time: { color: "#98A2B3", fontSize: 8, marginTop: 3, textAlign: "right" },
  empty: { color: UI.muted, fontSize: 11, textAlign: "center", padding: 30 },
});
