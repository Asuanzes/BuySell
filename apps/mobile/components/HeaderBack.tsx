import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/lib/theme";

/**
 * Botón atrás explícito para los headers nativos del Stack. El back NATIVO de
 * iOS no respondía en pantallas empujadas sobre el grupo (tabs) (que usa <Slot>,
 * no un navegador), mientras que `router.back()` (JS) sí funciona. Se cablea como
 * headerLeft global en `app/_layout.tsx` → arregla iOS en todas las pantallas.
 */
export function HeaderBack() {
  const router = useRouter();
  const { th } = useTheme();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      testID="header-back"
      hitSlop={14}
      style={{ paddingHorizontal: 2, paddingVertical: 4 }}
    >
      <Ionicons name="chevron-back" size={26} color={th.primary} />
    </Pressable>
  );
}
