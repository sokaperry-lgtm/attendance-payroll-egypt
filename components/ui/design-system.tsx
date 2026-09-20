import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

export const UI = {
  navy: "#33443F",
  primary: "#668C7F",
  ink: "#303735",
  muted: "#7B817E",
  border: "#E7E2D9",
  canvas: "#F7F4EE",
  surface: "#FFFFFF",
  success: "#2E7D68",
  warning: "#B18452",
  danger: "#B86F6B",
} as const;

export function PageHeader({ eyebrow, title, subtitle, icon }: { eyebrow: string; title: string; subtitle?: string; icon: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.icon}><IconSymbol name={icon as never} size={24} color={UI.primary} /></View>
    </View>
  );
}

export function SectionTitle({ title, subtitle, action, onPress }: { title: string; subtitle?: string; action?: string; onPress?: () => void }) {
  return (
    <View style={styles.section}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action && onPress ? <Pressable onPress={onPress}><Text style={styles.action}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function SurfaceCard({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const palette = { success: ["#E6F1EC", UI.success], warning: ["#F7EBDD", UI.warning], danger: ["#F7E7E7", UI.danger], neutral: ["#F3F0EA", UI.muted] }[tone];
  return <View style={[styles.badge, { backgroundColor: palette[0] }]}><View style={[styles.dot, { backgroundColor: palette[1] }]} /><Text style={[styles.badgeText, { color: palette[1] }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  copy: { flex: 1 },
  eyebrow: { color: UI.muted, fontSize: 11, fontWeight: "800", textAlign: "right", letterSpacing: 0.3 },
  title: { color: UI.ink, fontSize: 28, fontWeight: "900", marginTop: 5, textAlign: "right" },
  subtitle: { color: UI.muted, fontSize: 12, marginTop: 5, textAlign: "right" },
  icon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#EEF3EF", alignItems: "center", justifyContent: "center" },
  section: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: UI.ink, fontSize: 17, fontWeight: "900", textAlign: "right" },
  sectionSubtitle: { color: UI.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  action: { color: UI.primary, fontSize: 11, fontWeight: "800" },
  card: { backgroundColor: UI.surface, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 16 },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "800" },
});
