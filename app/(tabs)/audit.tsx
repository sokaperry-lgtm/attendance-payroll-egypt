import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const query = trpc.audit.list.useQuery(undefined, { retry: false });
  const logs = query.data ?? [];
  const stats = useMemo(() => ({
    total: logs.length,
    logins: logs.filter((x) => x.action === "auth.login").length,
    changes: logs.filter((x) => !x.action.startsWith("auth.")).length,
  }), [logs]);

  if (query.isLoading) {
    return <ScreenContainer><View style={styles.state}><ActivityIndicator color={UI.primary} /><Text style={styles.stateText}>جاري تحميل سجل العمليات...</Text></View></ScreenContainer>;
  }

  if (query.isError) {
    return <ScreenContainer><View style={styles.state}><Text style={styles.errorTitle}>تعذر تحميل سجل العمليات</Text><Text style={styles.stateText}>هذه الشاشة متاحة لمالك الشركة فقط.</Text></View></ScreenContainer>;
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PageHeader eyebrow="SECURITY · AUDIT TRAIL" title="سجل العمليات" subtitle="سجل مركزي ومرئي للتغييرات والأنشطة الحساسة داخل الشركة." icon="lock.shield.fill" />
        <View style={styles.stats}>
          <Stat label="إجمالي العمليات" value={stats.total} icon="list.bullet" />
          <Stat label="تسجيلات الدخول" value={stats.logins} icon="person.badge.key.fill" />
          <Stat label="عمليات التعديل" value={stats.changes} icon="pencil" />
        </View>
        <SurfaceCard>
          <SectionTitle title="آخر النشاطات" subtitle="الأحدث يظهر أولًا · حتى 100 عملية" />
          <View style={styles.list}>
            {logs.length ? logs.map((log) => (
              <View key={log.id} style={styles.row}>
                <View style={[styles.dot, { backgroundColor: actionTone(log.action) }]} />
                <View style={styles.copy}>
                  <Text style={styles.action}>{actionLabel(log.action)}</Text>
                  <Text style={styles.meta}>المستخدم #{log.staffAccountId}{log.entityId ? " · " + (log.entity ?? "عنصر") + " #" + log.entityId : ""}</Text>
                  <Text style={styles.time}>{new Date(log.createdAt).toLocaleString("ar-EG")}</Text>
                </View>
              </View>
            )) : <Text style={styles.empty}>لا توجد عمليات مسجلة حتى الآن.</Text>}
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.securityCard}>
          <View style={styles.securityIcon}><IconSymbol name="lock.shield.fill" size={20} color={UI.primary} /></View>
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>حالة الحماية</Text>
            <Text style={styles.securityText}>عزل بيانات الشركات · صلاحيات حسب الدور · كلمات مرور مشفرة · سجل تدقيق للعمليات الحساسة</Text>
          </View>
        </SurfaceCard>
      </ScrollView>
    </ScreenContainer>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return <SurfaceCard style={styles.stat}><View style={styles.statIcon}><IconSymbol name={icon as never} size={16} color={UI.primary} /></View><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></SurfaceCard>;
}

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 14, maxWidth: 1240, width: "100%", alignSelf: "center" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { color: UI.muted, fontSize: 12, textAlign: "center" },
  errorTitle: { color: UI.ink, fontSize: 18, fontWeight: "900" },
  stats: { flexDirection: "row-reverse", gap: 10, flexWrap: "wrap" },
  stat: { flex: 1, minWidth: 190, minHeight: 110 },
  statIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#F0F5F3", alignItems: "center", justifyContent: "center", marginBottom: 9 },
  statLabel: { color: UI.muted, fontSize: 10, textAlign: "right" },
  statValue: { color: UI.ink, fontSize: 24, fontWeight: "900", textAlign: "right", marginTop: 3 },
  list: { marginTop: 8 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#EEF1F0" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  copy: { flex: 1 },
  action: { color: UI.ink, fontSize: 12, fontWeight: "900", textAlign: "right" },
  meta: { color: UI.muted, fontSize: 9, marginTop: 3, textAlign: "right" },
  time: { color: "#98A2B3", fontSize: 8, marginTop: 3, textAlign: "right" },
  empty: { color: UI.muted, fontSize: 11, textAlign: "center", padding: 30 },
  securityCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  securityIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#F0F5F3", alignItems: "center", justifyContent: "center" },
  securityCopy: { flex: 1 },
  securityTitle: { color: UI.ink, fontSize: 12, fontWeight: "900", textAlign: "right" },
  securityText: { color: UI.muted, fontSize: 10, lineHeight: 17, marginTop: 4, textAlign: "right" },
});
