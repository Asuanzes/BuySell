import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";

/** La pila de la app: `(tabs)` es UNA pantalla del Stack raíz y todo el detalle
 *  se abre encima, así que al profundizar desaparece la barra de pestañas y con
 *  ella la única vía visible al inicio. Este botón es esa vía. */
const TABS_ROUTE = "(tabs)";

export function HomeButton({ variant = "header" }: { variant?: "header" | "float" }) {
  const navigation = useNavigation();
  const { th } = useTheme();
  const { t } = useTranslation();

  // Sin profundidad no hay nada de lo que salir: en una pantalla que ya está
  // sobre las pestañas el botón sería ruido que compite con el back.
  const depth = navigation.getState()?.routes.length ?? 0;
  if (depth < 2) return null;

  const goHome = () => {
    const before = navigation.getState();
    // `dismissAll` es POP_TO_TOP de ESTA pila, así que solo vale si debajo están
    // las pestañas: en un arranque en frío por notificación push, routes[0]
    // puede ser `login` u `onboarding`, y colapsar ahí dejaría al usuario fuera
    // de la app en vez de en su inicio.
    if (before?.routes[0]?.name === TABS_ROUTE) {
      router.dismissAll();
      // Verificación POSITIVA, no try/catch: el router descarta acciones
      // devolviendo null SIN warning (target que no casa, índice 0, nombre que
      // no está en routeNames), así que un dispatch que "no lanza" no significa
      // que haya funcionado. Si el resultado no es el esperado, se fuerza.
      const after = navigation.getState();
      if (after?.routes[after.routes.length - 1]?.name === TABS_ROUTE) return;
    }
    router.replace("/");
  };

  return (
    <Pressable
      onPress={goHome}
      testID="nav-home"
      accessibilityRole="button"
      accessibilityLabel={t("common.home")}
      hitSlop={8}
      style={({ pressed }) => [
        variant === "float" ? styles.float : styles.header,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons name="home-outline" size={variant === "float" ? 20 : 22} color={variant === "float" ? "#fff" : th.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 4, paddingVertical: 4 },
  // Mismo cuerpo que los botones flotantes que ya existen sobre las fotos de la
  // ficha (property/[id] styles.floatBtn), para no inventar una afordancia más.
  float: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
});
