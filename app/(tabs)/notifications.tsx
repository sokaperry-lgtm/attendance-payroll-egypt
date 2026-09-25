import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useMemo, useState } from "react";
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
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const q = trpc.notifications.list.useQuery();
  const unreadCount = trpc.notifications.unreadCount.useQuery();
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: () => { q.refetch(); unreadCount.refetch(); } });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visible = useMemo(() => (q.data ?? []).filter((n) => filter === "all" || !n.readAt), [q.data, filter]);
  const smart = useMemo(() => {
    const items = q.data ?? [];
    const unread = items.filter((n) => !n.readAt);
    const urgent = unread.filter((n) => /طلب|غياب|تأخير|راتب|سلفة|اعتماد|مشكلة|رفض/i.test(`${n.title} ${n.body}`));
    if (!unread.length) return { title: "أنت على اطلاع", text: "مفيش تحديثات غير مقروءة تحتاج متابعة دلوقتي.", count: 0 };
    if (urgent.length) return { title: "في تحديثات محتاجة متابعة", text: `عندك ${urgent.length} إشعار مهم من إجمالي ${unread.length} غير مقروء.`, count: urgent.length };
    return { title: "في إشعارات جديدة", text: `عندك ${unread.length} إشعار غير مقروء.`, count: unread.length };
  }, [q.data]);
  const read = trpc.notifications.read.useMutation({
    onSuccess: () => { q.refetch(); unreadCount.refetch(); },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={[styles.content, compact && styles.contentCompact]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>WORKSPACE · ALERTS</Text>
            <Text style={styles.title}>مركز الإشعارات</Text>
            <Text style={styles.sub}>كل تحديثات الطلبات والحضور والرواتب في مكان واحد.</Text>
          </View>
          <View style={styles.iconBox}>
            <IconSymbol name="notifications" size={23} color={UI.navy} />
          </View>
        </View>

        <View style={styles.smartCard}>
          <View style={styles.smartIcon}><Text style={styles.smartIconText}>✦</Text></View>
          <View style={styles.smartCopy}>
            <Text style={styles.smartEyebrow}>SMART ALERTS</Text>
            <Text style={styles.smartTitle}>{smart.title}</Text>
            <Text style={styles.smartText}>{smart.text}</Text>
          </View>
          {smart.count > 0 && <View style={styles.smartCount}><Text style={styles.smartCountText}>{smart.count}</Text></View>}
        </View>

        <View style={styles.toolbar}>
          <View style={styles.filters}>
            <Pressable onPress={() => setFilter("all")} style={[styles.filter, filter === "all" && styles.filterActive]}><Text style={[styles.filterText, filter === "all" && styles.filterTextActive]}>الكل</Text></Pressable>
            <Pressable onPress={() => setFilter("unread")} style={[styles.filter, filter === "unread" && styles.filterActive]}><Text style={[styles.filterText, filter === "unread" && styles.filterTextActive]}>غير مقروء ({unreadCount.data ?? 0})</Text></Pressable>
          </View>
          {(unreadCount.data ?? 0) > 0 && <Pressable disabled={markAll.isPending} onPress={() => markAll.mutate()} style={styles.markAll}><Text style={styles.markAllText}>{markAll.isPending ? "جاري..." : "تحديد الكل كمقروء"}</Text></Pressable>}
        </View>

        {q.isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={UI.navy} />
            <Text style={styles.stateText}>جاري تحميل الإشعارات...</Text>
          </View>
        ) : visible.length ? (
          visible.map((n) => {
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
  content: { padding: 22, paddingBottom: 60, gap: 12, maxWidth: 900, width: "100%", alignSelf: "center" }, contentCompact: { padding: 14, paddingBottom: 34, gap: 10 },
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
  smartCard:{backgroundColor:"#F7F9FC",borderWidth:1,borderColor:"#D9E2EC",borderRadius:18,padding:15,flexDirection:"row-reverse",alignItems:"center",gap:11},
  smartIcon:{width:40,height:40,borderRadius:13,backgroundColor:UI.navy,alignItems:"center",justifyContent:"center"},
  smartIconText:{color:UI.white,fontSize:18,fontWeight:"900"},
  smartCopy:{flex:1},
  smartEyebrow:{color:UI.muted,fontSize:9,fontWeight:"900",letterSpacing:1,textAlign:"right"},
  smartTitle:{color:UI.navy,fontSize:14,fontWeight:"900",textAlign:"right",marginTop:2},
  smartText:{color:UI.muted,fontSize:10,fontWeight:"600",textAlign:"right",lineHeight:17,marginTop:2},
  smartCount:{minWidth:30,height:30,borderRadius:10,backgroundColor:UI.navySoft,alignItems:"center",justifyContent:"center"},
  smartCountText:{color:UI.navy,fontSize:11,fontWeight:"900"},
  toolbar: { backgroundColor: UI.white, borderWidth: 1, borderColor: UI.border, borderRadius: 16, padding: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  filters: { flexDirection: "row-reverse", gap: 6, flex: 1 },
  filter: { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "#F8FAFC" },
  filterActive: { backgroundColor: UI.navy },
  filterText: { color: UI.muted, fontSize: 10, fontWeight: "800" },
  filterTextActive: { color: UI.white },
  markAll: { paddingHorizontal: 8, paddingVertical: 8 },
  markAllText: { color: UI.navy, fontSize: 10, fontWeight: "900" },
});
