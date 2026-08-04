import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { Chip, Screen } from "@/components/ui";
import { SharedWithMeList } from "@/components/shares/shared-with-me-list";
import { MySharesList } from "@/components/shares/my-shares-list";

/**
 * Hub de Compartidos (Cuenta → Organización): unifica en una pantalla lo que
 * me han compartido (solo lectura, adoptar copia) y lo que yo he concedido
 * (retirable). Las rutas legadas /shared y /my-shares redirigen aquí.
 */
export default function SharesScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<"received" | "mine">(params.tab === "mine" ? "mine" : "received");

  // Sincronizar si el query cambia con la pantalla ya montada (p. ej. otra
  // redirección legada); un valor ausente no pisa la elección del usuario.
  useEffect(() => {
    if (params.tab === "mine" || params.tab === "received") setTab(params.tab);
  }, [params.tab]);

  return (
    <Screen>
      <View style={styles.tabs}>
        <Chip
          label={t("shares.tab_received")}
          icon="download-outline"
          selected={tab === "received"}
          onPress={() => setTab("received")}
        />
        <Chip
          label={t("shares.tab_mine")}
          icon="paper-plane-outline"
          selected={tab === "mine"}
          onPress={() => setTab("mine")}
        />
      </View>
      {tab === "received" ? <SharedWithMeList /> : <MySharesList />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
});
