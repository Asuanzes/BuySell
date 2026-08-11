/**
 * Coordinación entre SURFACES de React en el MISMO proceso JS.
 *
 * En Android, cuando una app NATIVA comparte con FLAG_ACTIVITY_NEW_TASK, el
 * sistema monta una 2ª instancia del root React (un nuevo `Running "main"` con
 * otro rootTag) en este mismo proceso — dos NavigationContainers que corrompen la
 * navegación (crash efectivo). No se puede evitar a nivel nativo (los flags del
 * que comparte mandan sobre launchMode=singleTask).
 *
 * Como TODAS las surfaces comparten este módulo, lo usamos como canal de
 * coordinación: solo la PRIMERA surface ocupa el "slot primario" y renderiza la
 * app completa; cualquier surface posterior se renderiza inerte (ver
 * `app/_layout.tsx`), dejando la primaria intacta.
 *
 * Toda MUTACIÓN del contador ocurre en `useEffect`/cleanup (solo árboles que React
 * llega a commitear) — nunca en render — para no corromperlo con renders
 * descartados de React 19 / React Compiler / render concurrente. La DECISIÓN
 * ("¿soy duplicada?") es una lectura pura latcheada una vez.
 */

let activeSurfaces = 0;
const freeListeners = new Set<() => void>();

/** ¿Está libre el slot primario? true → esta surface puede ser la app completa. */
export function isPrimaryFree(): boolean {
  return activeSurfaces === 0;
}

/** Ocupa el slot en el montaje (desde un useEffect o desde un listener de
 *  `onPrimaryFree` — nunca en render). Devuelve la función de liberación para el
 *  cleanup (idempotente, clamp a 0). */
export function acquireSurface(): () => void {
  activeSurfaces += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeSurfaces = Math.max(0, activeSurfaces - 1);
    if (activeSurfaces === 0) {
      // Snapshot: un listener puede promocionarse (y desuscribirse) durante el aviso.
      for (const listener of [...freeListeners]) listener();
    }
  };
}

/**
 * Avisa cuando el slot primario queda LIBRE. Es la pieza que arregla el share en
 * frío (BUG-15): la entrega ShareIntentActivity→MainActivity monta dos surfaces
 * SOLAPADAS (la 2ª nace antes de que muera la 1ª), así que la 2ª ve el slot
 * ocupado… durante unos milisegundos. Sin este aviso se quedaba clavada en el
 * cartel de duplicada para siempre. El listener que promociona debe re-comprobar
 * `isPrimaryFree()` y ocupar el slot SÍNCRONAMENTE: entre varios duplicados solo
 * el primero del bucle gana; el resto sigue suscrito.
 */
export function onPrimaryFree(listener: () => void): () => void {
  freeListeners.add(listener);
  return () => {
    freeListeners.delete(listener);
  };
}
