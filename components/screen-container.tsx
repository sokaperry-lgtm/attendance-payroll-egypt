import { Platform, Pressable, Text, View, useWindowDimensions, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { usePathname, useRouter } from "expo-router";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer className="p-4">
 *   <Text className="text-2xl font-bold text-foreground">
 *     Welcome
 *   </Text>
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isMobileLayout = Platform.OS !== "web" || width < 900;
  const showHome = isMobileLayout && pathname !== "/" && pathname !== "/login";
  return (
    <View
      className={cn(
        "flex-1",
        "bg-background",
        containerClassName
      )}
      {...props}
    >
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={style}
      >
        <View className={cn("flex-1", className)}>
          {children}
          {showHome && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="العودة إلى الرئيسية"
              onPress={() => router.replace("/")}
              style={{ position: "absolute", top: 12, right: 16, zIndex: 50, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE5EE", shadowColor: "#102A47", shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}
            >
              <IconSymbol name="house.fill" size={15} color="#163A63" />
              <Text style={{ color: "#163A63", fontSize: 10, fontWeight: "900" }}>الرئيسية</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
