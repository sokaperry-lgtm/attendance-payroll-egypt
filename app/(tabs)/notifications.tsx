import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

const UI = {
  navy: "#163A63",
  navySoft: "#EEF4FA",
  text: "#172033",
  muted: "#667085",
  border: "#E4E7EC",
  white: "#FFFFFF",
};

export default function NotificationsScreen() {
  const q = trpc.notifications.list.useQuery();
  const read = trpc.notifications.read.useMutation({
    onSuccess: () => q.refetch(),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>WORKSPACE · ALERTS</Text>
            <Text style={styles.title}>الإشعارات</Text>
            <Text style={styles.sub}>كل تحديثات الطلبات والحضور والرواتب في مكان واحد.</Text>
          </View>
          <View style={styles.iconBox}>
            <IconSymbol name="notifications" size={23} color={UI.navy} />
          </View>
        </View>

        {q.isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={UI.navy} />
            <Text style={styles.stateText}>جاري تحميل الإشعارات...</Text>
          </View>
        ) : q.data?.length ? (
          q.data.map((n) => {
            const unread = !n.readAt;
            return (
              <Pressable
                key={n.id}
                onPress={() => unread && read.mutate({ id: n.id })}
                style={({ pressed }) => [styles.card, unread && styles.unread, pressed && styles.pressed]}
              >
                <View style={[styles.dot, unread && styles.dotUnread]} />
                <View style={styles.copy}>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>{n.title}</Text>
                    {unread && <Text style={styles.badge}>جديد</Text>}
                  </View>
                  <Text style={styles.body}>{n.body}</Text>
                  <Text style={styles.date}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString("ar-EG") : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <IconSymbol name="checkmark" size={25} color={UI.navy} />
            </View>
            <Text style={styles.emptyTitle}>مفيش إشعارات جديدة</Text>
            <Text style={styles.emptyText}>أول ما يحصل تحديث مهم هيظهر هنا.</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 60, gap: 12, maxWidth: 900, width: "100%", alignSelf: "center" },
  header: {
    backgroundColor: UI.white,
    borderWidth: 1,
    borderColor: UI.border,
    borderRadius: 22,
    padding: 20,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: UI.navy, fontSize: 9, fontWeight: "900", textAlign: "right", letterSpacing: 1 },
  title: { color: UI.text, fontSize: 27, fontWeight: "900", textAlign: "right", marginTop: 4 },
  sub: { color: UI.muted, fontSize: 11, textAlign: "right", marginTop: 4, lineHeight: 18 },
  iconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 16, flexDirection: "row-reverse", gap: 11 },
  unread: { borderColor: "#B8CDE3", backgroundColor: "#F7FAFD" },
  pressed: { opacity: 0.78 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#98A2B3", marginTop: 5 },
  dotUnread: { backgroundColor: UI.navy },
  copy: { flex: 1, gap: 5 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, color: UI.text, fontSize: 14, fontWeight: "900", textAlign: "right" },
  badge: { color: UI.navy, backgroundColor: UI.navySoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, fontSize: 9, fontWeight: "900" },
  body: { color: UI.muted, fontSize: 12, lineHeight: 19, textAlign: "right" },
  date: { color: "#98A2B3", fontSize: 9, textAlign: "right" },
  state: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 10 },
  stateText: { color: UI.muted, fontSize: 11 },
  empty: { backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 22, padding: 34, alignItems: "center", gap: 8 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: UI.navySoft, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { color: UI.text, fontSize: 16, fontWeight: "900" },
  emptyText: { color: UI.muted, fontSize: 11 },
});
