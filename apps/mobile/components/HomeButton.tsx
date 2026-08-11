import { Image, Pressable, StyleSheet } from "react-native";
import { router, useNavigation } from "expo-router";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/lib/theme";

/** La pila de la app: `(tabs)` es UNA pantalla del Stack raíz y todo el detalle
 *  se abre encima, así que al profundizar desaparece la barra de pestañas y con
 *  ella la única vía visible al inicio. Este botón es esa vía. */
const TABS_ROUTE = "(tabs)";

/**
 * El botón lleva el MONOGRAMA NK, no un icono de casa.
 *
 * Por qué no una casa: `home-outline` ya es el icono de la categoría Inmuebles
 * (RECORD_TYPE_CONFIG.property), así que en una ficha de piso el mismo glifo
 * aparecía dos veces con dos significados. Y la metáfora tampoco encajaba: al
 * llegar no hay una casa, hay la rejilla de categorías.
 *
 * Por qué la marca: un logotipo que lleva al inicio es convención universal
 * (toda web lo hace) y, por construcción, NO PUEDE colisionar con ninguna
 * categoría presente ni futura — ninguna vertical se va a llamar «NK».
 *
 * `brand-mark.png` es silueta blanca sobre transparente, así que `tintColor` la
 * pinta del color que toque y adopta el tema igual que el chevron de atrás. Es
 * un asset PROPIO (96 px, 1,1 KB) recortado al monograma: reutilizar el del
 * icono adaptativo obligaba a compensar su zona segura con un factor y a
 * decodificar 1024² en memoria para pintar 24 px. Un monograma necesita un
 * pelín más de tamaño que un pictograma para leerse: 24 px, no 22.
 */
const MARK = require("../assets/images/brand-mark.png");

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
      <Image
        source={MARK}
        style={{
          width: variant === "float" ? 20 : 24,
          height: variant === "float" ? 20 : 24,
          // Sobre las fotos de la ficha va en blanco; en cabecera adopta el
          // acento del tema, para que marca y chevron de atrás lean como pareja.
          tintColor: variant === "float" ? "#fff" : th.primary,
        }}
        resizeMode="contain"
      />
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
