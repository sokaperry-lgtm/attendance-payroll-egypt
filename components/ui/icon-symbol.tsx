import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "keyboard-arrow-down",
  calendar: "calendar-today",
  "doc.text.fill": "description",
  "person.2.fill": "groups",
  location: "location-on",
  clock: "schedule",
  wallet: "account-balance-wallet",
  checkmark: "check",
  arrow: "arrow-forward",
  settings: "settings",
  logout: "logout",
  edit: "edit",
  plus: "add",
  "chart.bar.fill": "bar-chart",
  info: "info-outline",
  "chart.bar": "bar-chart",
  "doc.text": "description",
  sparkles: "auto-awesome",
  notifications: "notifications-none",
  history: "history",
  login: "login",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
