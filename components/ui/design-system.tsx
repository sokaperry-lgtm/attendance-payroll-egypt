import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";

export const UI = {
  navy: "#75282E",
  primary: "#75282E",
  ink: "#332A26",
  muted: "#806F68",
  border: "#E9DED0",
  canvas: "#FFF8E7",
  surface: "#FFFCF4",
  success: "#66836D",
  warning: "#B8794A",
  danger: "#5C1F25",
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
  const palette = {
    success: ["#EAF2E9", UI.success],
    warning: ["#FFF0E1", UI.warning],
    danger: ["#F5E7E2", UI.danger],
    neutral: ["#F5EFE7", UI.muted],
  }[tone];
  return <View style={[styles.badge, { backgroundColor: palette[0] }]}><View style={[styles.dot, { backgroundColor: palette[1] }]} /><Text style={[styles.badgeText, { color: palette[1] }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  copy: { flex: 1 },
  eyebrow: { color: UI.muted, fontSize: 11, fontWeight: "800", textAlign: "right", letterSpacing: 0.3 },
  title: { color: UI.ink, fontSize: 28, fontWeight: "900", marginTop: 5, textAlign: "right" },
  subtitle: { color: UI.muted, fontSize: 12, marginTop: 5, textAlign: "right" },
  icon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "#F5E7E2", alignItems: "center", justifyContent: "center" },
  section: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: UI.ink, fontSize: 17, fontWeight: "900", textAlign: "right" },
  sectionSubtitle: { color: UI.muted, fontSize: 10, marginTop: 3, textAlign: "right" },
  action: { color: UI.primary, fontSize: 11, fontWeight: "800" },
  card: { backgroundColor: UI.surface, borderWidth: 1, borderColor: UI.border, borderRadius: 18, padding: 16 },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "800" },
});