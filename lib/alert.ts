import { Alert, Platform } from "react-native";

/**
 * React Native's Alert.alert() renders nothing on web (react-native-web
 * has no dialog implementation for it) — it just silently does nothing,
 * so any error/success message shown this way is invisible to users on
 * the website and the screen looks "stuck". This wrapper falls back to
 * the browser's own alert() on web so the message is always seen.
 */
export function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}
