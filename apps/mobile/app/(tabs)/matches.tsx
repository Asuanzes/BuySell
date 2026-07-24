import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { BaseRecord, RecordType } from "@nidokey/shared";

import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { fonts } from "@/lib/fonts";
import { useQuery } from "@/lib/hooks/useQuery";
import { notifyDuplicatesChanged } from "@/lib/dup-signal";
import { categoryColor } from "@/lib/records/config";
import { useAppStyle } from "@/lib/app-style-context";
import { CategoryIcon } from "@/components/CategoryIcon";
import { Button, EmptyState, ResultModal, Screen } from "@/components/ui";

/**
 * Pestaña "Duplicados": detección on-demand de fichas repetidas (mismo libro en
 * varias ediciones, misma oferta cross-plataforma, mismo activo entre fuentes…).
 * Genérica por tipo: consume `/api/records/duplicates` (BaseRecord) y permite
 * FUSIONAR (conserva una ficha, borra el resto) o marcar "No son duplicados".
 */
type DupGroup = {
  type: RecordType;
  score: number;
  reasons: string[];
  records: BaseRecord[];
  /** El grupo mezcla idiomas → preguntar explícitamente antes de fusionar. */
  crossLanguage?: boolean;
};

const fetchGroups = () =>
  api<{ groups: DupGroup[] }>("/api/records/duplicates").then((d) => d.groups);

const groupKey = (g: DupGroup) => g.records.map((r) => r.id).slice().sort().join("|");

export default function MatchesScreen() {
  const { th } = useTheme();
  const { t } = useTranslation();
  const { data: groups, error, loading, refreshing, refetch } = useQuery(fetchGroups, []);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Confirmación de fusión (modal de la app, no Alert nativo) + aviso de error.
  const [confirm, setConfirm] = useState<DupGroup | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function doMerge(g: DupGroup) {
    const keep = g.records.find((r) => r.imageUrl) ?? g.records[0];
    const dropIds = g.records.filter((r) => r.id !== keep.id).map((r) => r.id);
    void run(g, () =>
      api("/api/records/duplicates/merge", {
        method: "POST",
        body: JSON.stringify({ type: g.type, keepId: keep.id, dropIds }),
      }),
    );
  }

  function dismiss(g: DupGroup) {
    run(g, () =>
      api("/api/records/duplicates/dismiss", {
        method: "POST",
        body: JSON.stringify({ type: g.type, ids: g.records.map((r) => r.id) }),
      }),
    );
  }

  async function run(g: DupGroup, action: () => Promise<unknown>) {
    setBusyKey(groupKey(g));
    try {
      await action();
      await refetch();
      notifyDuplicatesChanged(); // sincroniza el badge del layout
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("matches.action_error"));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Screen>
      {loading && !groups && (
        <View style={styles.center}>
          <ActivityIndicator color={th.primary} />
        </View>
      )}
      {error && (
        <EmptyState
          icon="cloud-offline-outline"
          title={t("matches.load_error")}
          description={error.message}
          actionLabel={t("common.retry")}
          onAction={refetch}
        />
      )}
      {groups && groups.length === 0 && !error && (
        <EmptyState
          icon="sparkles-outline"
          title={t("matches.empty_title")}
          description={t("matches.empty_desc")}
        />
      )}
      {groups && groups.length > 0 && (
        <FlatList
          data={groups}
          keyExtractor={groupKey}
          renderItem={({ item }) => (
            <GroupCard
              g={item}
              busy={busyKey === groupKey(item)}
              onMerge={() => setConfirm(item)}
              onDismiss={() => dismiss(item)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={th.primary} />
          }
        />
      )}

      {/* Confirmación de fusión (pregunta explícita si solo cambia el idioma) */}
      <ResultModal
        visible={!!confirm}
        tone="info"
        icon={confirm?.crossLanguage ? "language-outline" : "git-merge-outline"}
        title={confirm?.crossLanguage ? t("matches.cross_language_title") : t("matches.merge_title")}
        message={confirm ? mergeMessage(confirm, t) : undefined}
        actions={[
          {
            label: t("matches.merge"),
            variant: "danger",
            onPress: () => {
              const g = confirm;
              setConfirm(null);
              if (g) doMerge(g);
            },
          },
          { label: t("common.cancel"), variant: "ghost", onPress: () => setConfirm(null) },
        ]}
        onRequestClose={() => setConfirm(null)}
      />

      {/* Aviso de error con estilo de la app */}
      <ResultModal
        visible={!!notice}
        tone="error"
        title={t("matches.merge_error")}
        message={notice ?? undefined}
        actions={[{ label: t("common.understood"), onPress: () => setNotice(null) }]}
        onRequestClose={() => setNotice(null)}
      />
    </Screen>
  );
}

// Firma estrecha (evita TS2589 del TFunction genérico; ver lib/trends/sources.ts).
type MergeKey =
  | "matches.merge_message_cross"
  | "matches.merge_message"
  | `types.${RecordType}.singular`;
type TFn = (key: MergeKey, opts?: Record<string, string | number>) => string;

/** Texto del diálogo de fusión: explícito cuando lo único que cambia es el idioma. */
function mergeMessage(g: DupGroup, t: TFn): string {
  const count = Math.max(1, g.records.length - 1);
  const singular = t(`types.${g.type}.singular`).toLowerCase();
  return g.crossLanguage
    ? t("matches.merge_message_cross", { singular, count })
    : t("matches.merge_message", { count });
}

function GroupCard({
  g,
  busy,
  onMerge,
  onDismiss,
}: {
  g: DupGroup;
  busy: boolean;
  onMerge: () => void;
  onDismiss: () => void;
}) {
  const { th, dark } = useTheme();
  const { appStyle } = useAppStyle();
  const { t } = useTranslation();
  const accent = categoryColor(g.type, dark, appStyle);
  const scoreColor = g.score >= 90 ? "#15803D" : g.score >= 70 ? "#A86A17" : th.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: th.surface, borderColor: th.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.catChip, { backgroundColor: accent + "22" }]}>
          <CategoryIcon type={g.type} size={14} color={accent} />
          <Text style={[styles.catText, { color: accent }]}>{t(`types.${g.type}.label`)}</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + "22" }]}>
          <Text style={[styles.scoreText, { color: scoreColor }]}>{g.score}%</Text>
        </View>
      </View>
      {g.reasons.length > 0 && (
        <Text style={[styles.reasons, { color: th.textMuted }]} numberOfLines={2}>
          {g.reasons.join(" · ")}
        </Text>
      )}
      {g.crossLanguage && (
        <View style={[styles.langFlag, { backgroundColor: th.accentSoft }]}>
          <Ionicons name="language-outline" size={13} color={th.accent} />
          <Text style={[styles.langFlagText, { color: th.accent }]}>
            {t("matches.cross_language_flag")}
          </Text>
        </View>
      )}

      <View style={styles.tiles}>
        {g.records.map((r) => (
          <Tile key={r.id} r={r} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button label={t("matches.merge")} icon="git-merge-outline" size="sm" loading={busy} onPress={onMerge} style={styles.action} />
        <Button label={t("matches.not_duplicates")} variant="secondary" size="sm" disabled={busy} onPress={onDismiss} style={styles.action} />
      </View>
    </View>
  );
}

function Tile({ r }: { r: BaseRecord }) {
  const { th } = useTheme();
  return (
    <Link href={`/${r.type}/${r.id}` as never} asChild>
      <Pressable style={styles.tile}>
        {r.imageUrl ? (
          <Image source={{ uri: r.imageUrl }} style={styles.tileImage} contentFit="cover" />
        ) : (
          <View style={[styles.tileImage, { backgroundColor: th.imagePlaceholder }]} />
        )}
        <Text style={[styles.tileTitle, { color: th.text }]} numberOfLines={2}>{r.title}</Text>
        {r.subtitle ? (
          <Text style={[styles.tileMeta, { color: th.textMuted }]} numberOfLines={1}>{r.subtitle}</Text>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingTop: 0 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { borderRadius: 10, padding: 12, borderWidth: 1, marginBottom: 10, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  catText: { fontSize: 12, fontFamily: fonts.bodyBold },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  scoreText: { fontSize: 12, fontFamily: fonts.bodyBold },
  reasons: { fontSize: 11, marginTop: -2 },
  langFlag: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  langFlagText: { fontSize: 11, fontFamily: fonts.bodySemibold },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "30%", minWidth: 92, gap: 4 },
  tileImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: 6 },
  tileTitle: { fontSize: 12, fontFamily: fonts.bodyMedium },
  tileMeta: { fontSize: 11 },
  actions: { flexDirection: "row", gap: 8, marginTop: 2 },
  action: { flex: 1 },
});
