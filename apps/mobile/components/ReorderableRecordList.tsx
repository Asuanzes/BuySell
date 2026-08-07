import { useMemo, useRef, useState } from "react";
import {
  RefreshControl,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";

import type { BaseRecord } from "@nidokey/shared";
import { RecordCard } from "@/components/RecordCard";

/**
 * Lista de registros con reordenado por arrastre (orden local, ver
 * `lib/local-order.ts`). Reutiliza el modo edición de la pantalla:
 *  - Fuera de edición: lista virtualizada; toca para abrir, mantén pulsado
 *    para entrar en edición.
 *  - En edición: cada ficha muestra ✕ (borrar) y, manteniéndola pulsada ~200ms,
 *    se "coge" y se arrastra; las demás se reacomodan con LinearTransition. El
 *    scroll se desactiva mientras se arrastra (sin conflicto de gestos).
 *
 * VIRTUALIZADA (Animated.FlatList): con decenas/cientos de registros el
 * ScrollView original montaba todas las fichas de golpe. La animación de
 * recolocación vive ahora en `itemLayoutAnimation` (nivel celda): dentro de una
 * lista virtualizada el `layout` por fila no ve moverse su frame. Durante el
 * arrastre se apaga a propósito: la compensación `accShift` del gesto asume
 * saltos de layout instantáneos, no transiciones de 180ms. Las alturas de
 * filas desmontadas caen al fallback DEFAULT_ROW_HEIGHT; los vecinos del
 * arrastre siempre están en viewport (montados y medidos).
 *
 * Sin dependencias nativas nuevas: react-native-gesture-handler + reanimated ya
 * están en el build. El gesto corre en JS (runOnJS) y solo escribe el shared
 * value de la ficha activa, así que no hay re-render por frame.
 */

const DEFAULT_ROW_HEIGHT = 112;

type Props = {
  data: BaseRecord[];
  editing: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Long-press sobre una ficha (entra en modo edición). */
  onEnterEdit: () => void;
  onDelete: (record: BaseRecord) => void;
  /** Reordenado en vivo durante el arrastre (no persiste). */
  onReorder: (next: BaseRecord[]) => void;
  /** Al soltar: persiste el orden final (lista de ids). */
  onCommit: (ids: string[]) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  tintColor: string;
  contentStyle?: StyleProp<ViewStyle>;
};

function move<T>(arr: T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export function ReorderableRecordList({
  data,
  editing,
  refreshing,
  onRefresh,
  onEnterEdit,
  onDelete,
  onReorder,
  onCommit,
  onDragStart,
  onDragEnd,
  tintColor,
  contentStyle,
}: Props) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const heights = useRef<Map<string, number>>(new Map());
  const accShift = useRef(0); // compensa el salto de layout al cruzar vecinos

  const activeIdSV = useSharedValue("");
  const dragTY = useSharedValue(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  const heightOf = (id: string) => heights.current.get(id) ?? DEFAULT_ROW_HEIGHT;

  function startDrag(id: string) {
    accShift.current = 0;
    dragTY.value = 0;
    activeIdSV.value = id;
    setActiveId(id);
    onDragStart?.();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function updateDrag(id: string, translationY: number) {
    const items = dataRef.current;
    const idx = items.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const displacement = translationY - accShift.current;
    const next = items[idx + 1];
    const prev = items[idx - 1];
    if (next && displacement > heightOf(next.id) / 2) {
      onReorder(move(items, idx, idx + 1));
      accShift.current += heightOf(next.id);
    } else if (prev && displacement < -heightOf(prev.id) / 2) {
      onReorder(move(items, idx, idx - 1));
      accShift.current -= heightOf(prev.id);
    }
    dragTY.value = translationY - accShift.current;
  }

  function endDrag() {
    dragTY.value = withTiming(0, { duration: 160 });
    activeIdSV.value = "";
    setActiveId(null);
    onCommit(dataRef.current.map((r) => r.id));
    onDragEnd?.();
  }

  const renderItem = ({ item: record }: ListRenderItemInfo<BaseRecord>) => (
    <Row
      record={record}
      editing={editing}
      activeIdSV={activeIdSV}
      dragTY={dragTY}
      onEnterEdit={onEnterEdit}
      onDelete={onDelete}
      onMeasure={(h) => heights.current.set(record.id, h)}
      onStart={() => startDrag(record.id)}
      onUpdate={(ty) => updateDrag(record.id, ty)}
      onEnd={endDrag}
    />
  );

  return (
    <Animated.FlatList
      testID="records-list"
      data={data}
      keyExtractor={(record: BaseRecord) => record.id}
      renderItem={renderItem}
      // Las filas dependen de `editing` además de `data`: sin esto las celdas
      // visibles no se repintan al entrar/salir de edición. (El resaltado de la
      // ficha activa va por shared values, no necesita re-render.)
      extraData={editing}
      scrollEnabled={activeId == null}
      // En Android el clipping nativo recorta vistas TRANSFORMADAS fuera de su
      // frame original: la ficha arrastrada (translateY) desaparecería al salir
      // de sus bounds. Hallazgo derivado de la revisión Codex 2af6d5a6.
      removeClippedSubviews={false}
      contentContainerStyle={contentStyle}
      itemLayoutAnimation={activeId == null ? LinearTransition.duration(180) : undefined}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tintColor} />
      }
    />
  );
}

type RowProps = {
  record: BaseRecord;
  editing: boolean;
  activeIdSV: SharedValue<string>;
  dragTY: SharedValue<number>;
  onEnterEdit: () => void;
  onDelete: (record: BaseRecord) => void;
  onMeasure: (height: number) => void;
  onStart: () => void;
  onUpdate: (translationY: number) => void;
  onEnd: () => void;
};

function Row({
  record,
  editing,
  activeIdSV,
  dragTY,
  onEnterEdit,
  onDelete,
  onMeasure,
  onStart,
  onUpdate,
  onEnd,
}: RowProps) {
  const id = record.id;

  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIdSV.value === id;
    return {
      transform: [
        { translateY: active ? dragTY.value : 0 },
        { scale: active ? 1.03 : 1 },
      ],
      zIndex: active ? 20 : 0,
      shadowColor: "#000",
      shadowOpacity: active ? 0.18 : 0,
      shadowRadius: active ? 8 : 0,
      shadowOffset: { width: 0, height: active ? 4 : 0 },
      elevation: active ? 8 : 0,
    };
  });

  // El gesto se "arma" tras ~200ms de pulsación (deja pasar el scroll rápido) y
  // corre en JS para poder reordenar el array directamente.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(200)
        .runOnJS(true)
        .onStart(onStart)
        .onUpdate((e) => onUpdate(e.translationY))
        .onFinalize(onEnd),
    // onStart/onUpdate/onEnd leen refs siempre frescos; basta recrear por id/edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, editing],
  );

  const onLayout = (e: LayoutChangeEvent) => onMeasure(e.nativeEvent.layout.height);

  if (!editing) {
    return (
      <Animated.View testID={`record-row-${id}`} onLayout={onLayout}>
        <RecordCard record={record} onLongPress={onEnterEdit} />
      </Animated.View>
    );
  }

  return (
    <Animated.View onLayout={onLayout} style={animatedStyle}>
      <GestureDetector gesture={pan}>
        <View>
          <RecordCard record={record} editing onDelete={onDelete} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
