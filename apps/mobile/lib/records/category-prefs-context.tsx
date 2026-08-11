import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type RecordType } from "@nidokey/shared";

import {
  applyCategoryOrder,
  getHiddenCategories,
  MANAGED_RECORD_TYPES,
  getSavedCategoryOrder,
  getStartCategory,
  resetAllPreferences,
  saveCategoryOrder,
  saveHiddenCategories,
  saveStartCategory,
} from "@/lib/records/category-prefs";
import { RECORD_TYPE_CONFIG } from "@/lib/records/config";

/**
 * Preferencias VIVAS del menú de categorías, compartidas por TODO el árbol (root):
 * el rail/selector en las tabs y la pantalla `category-settings` (hermana de las
 * tabs). Sustituye al antiguo `RecordCategoryProvider` y además centraliza el
 * orden, las ocultas y la categoría de inicio.
 *
 * Persistencia LOCAL (SecureStore, ver `category-prefs.ts`). Reglas: nunca se
 * puede dejar el menú sin categorías (≥1 visible), y la categoría activa cae a la
 * primera visible si se oculta.
 */
// Chat = categoría principal al abrir la app (decisión 2026-06-11). El usuario
// puede elegir otra en Cuenta → Gestionar categorías → Categoría de inicio.
// Exportada para que la pantalla de ajustes marque el default real.
export const DEFAULT_CATEGORY: RecordType = "chat";

type Managed = { type: RecordType; hidden: boolean };

type Ctx = {
  ready: boolean;
  /** Orden aplicado, SIN ocultas → para el rail (Registros) y el selector (Importar). */
  orderedVisible: RecordType[];
  /** TODAS las categorías en orden, con su flag de oculta → para la pantalla de ajustes. */
  managed: Managed[];
  category: RecordType;
  setCategory: (t: RecordType) => void;
  /** Reordenado EN VIVO durante el arrastre (no persiste). */
  reorder: (next: RecordType[]) => void;
  /** Al soltar: persiste el orden. */
  commitOrder: (next: RecordType[]) => void;
  /** Ocultar/mostrar (inmediato). Rechaza ocultar si dejaría 0 visibles. */
  toggleHidden: (t: RecordType) => void;
  startCategory: RecordType | null;
  setStartCategory: (t: RecordType) => void;
  /** Vuelve a fábrica (orden, ocultas, inicio, tema y orden de registros). */
  reset: () => void;
};

const CategoryPrefsContext = createContext<Ctx | null>(null);

export function CategoryPrefsProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<RecordType[]>(() => [...MANAGED_RECORD_TYPES]);
  const [hidden, setHidden] = useState<Set<RecordType>>(() => new Set());
  const [startCategory, setStartCategoryState] = useState<RecordType | null>(null);
  const [category, setCategoryState] = useState<RecordType>(DEFAULT_CATEGORY);
  const [ready, setReady] = useState(false);
  const didInit = useRef(false);

  // Una elección EXPLÍCITA de categoría gana siempre al init de la hidratación.
  // En el share en frío, Importar hace setCategory("book") unos ms ANTES de que
  // SecureStore termine de hidratar; sin esto, el init-once posterior la pisaba
  // con la categoría de inicio (chat) y el usuario aterrizaba en "Añadir chat"
  // con el import de libro corriendo invisible (BUG-15, cola).
  const setCategory = useCallback((t: RecordType) => {
    didInit.current = true;
    setCategoryState(t);
  }, []);

  // Hidratar de SecureStore una vez al montar.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [savedOrder, savedHidden, start] = await Promise.all([
        getSavedCategoryOrder(),
        getHiddenCategories(),
        getStartCategory(),
      ]);
      if (!alive) return;
      setOrder(applyCategoryOrder(savedOrder));
      setHidden(new Set(savedHidden));
      setStartCategoryState(start);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const orderedVisible = useMemo(() => order.filter((t) => !hidden.has(t)), [order, hidden]);
  const managed = useMemo<Managed[]>(
    () => order.map((t) => ({ type: t, hidden: hidden.has(t) })),
    [order, hidden]
  );

  // Init-once de la categoría activa al terminar la hidratación: la categoría de
  // inicio si es USABLE (visible + DESARROLLADA), si no Inmobiliarias, si no la
  // primera usable. Nunca arranca en una categoría "Próximamente" → no se queda en
  // blanco por elegir como inicio una categoría sin desarrollar.
  useEffect(() => {
    if (!ready || didInit.current) return;
    didInit.current = true;
    const usable = (t: RecordType) => !hidden.has(t) && RECORD_TYPE_CONFIG[t].enabled;
    const pick =
      (startCategory && usable(startCategory) && startCategory) ||
      (usable(DEFAULT_CATEGORY) && DEFAULT_CATEGORY) ||
      order.find(usable) ||
      DEFAULT_CATEGORY;
    setCategory(pick);
  }, [ready, order, hidden, startCategory]);

  // Fallback: si la categoría activa queda oculta, saltar a la primera visible.
  useEffect(() => {
    if (!ready) return;
    if (orderedVisible.length > 0 && !orderedVisible.includes(category)) {
      setCategory(orderedVisible[0]);
    }
  }, [orderedVisible, category, ready]);

  const reorder = useCallback((next: RecordType[]) => setOrder(next), []);
  const commitOrder = useCallback((next: RecordType[]) => {
    setOrder(next);
    void saveCategoryOrder(next);
  }, []);

  const toggleHidden = useCallback(
    (t: RecordType) => {
      const willHide = !hidden.has(t);
      if (willHide && orderedVisible.filter((x) => x !== t).length === 0) return; // ≥1 visible
      const next = new Set(hidden);
      if (willHide) next.add(t);
      else next.delete(t);
      setHidden(next);
      void saveHiddenCategories([...next]);
    },
    [hidden, orderedVisible]
  );

  const setStartCategory = useCallback((t: RecordType) => {
    setStartCategoryState(t);
    void saveStartCategory(t);
  }, []);

  const reset = useCallback(() => {
    setOrder([...MANAGED_RECORD_TYPES]);
    setHidden(new Set());
    setStartCategoryState(null);
    setCategory(DEFAULT_CATEGORY);
    void resetAllPreferences();
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      orderedVisible,
      managed,
      category,
      setCategory,
      reorder,
      commitOrder,
      toggleHidden,
      startCategory,
      setStartCategory,
      reset,
    }),
    [
      ready,
      orderedVisible,
      managed,
      category,
      reorder,
      commitOrder,
      toggleHidden,
      startCategory,
      setStartCategory,
      reset,
    ]
  );

  return <CategoryPrefsContext.Provider value={value}>{children}</CategoryPrefsContext.Provider>;
}

export function useCategoryPrefs(): Ctx {
  const ctx = useContext(CategoryPrefsContext);
  if (!ctx) throw new Error("useCategoryPrefs fuera de CategoryPrefsProvider");
  return ctx;
}

/** Alias retrocompatible: la categoría activa compartida (lista ↔ importar). */
export function useRecordCategory(): { category: RecordType; setCategory: (t: RecordType) => void } {
  const { category, setCategory } = useCategoryPrefs();
  return { category, setCategory };
}
