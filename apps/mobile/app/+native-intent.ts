import { getShareExtensionKey } from "expo-share-intent";

// Con la app YA ABIERTA, el share llega como deep-link `<scheme>://dataUrl=…`
// que expo-router intenta enrutar; sin este interceptor no matchea nada y el
// intent se pierde en silencio (en frío el provider lo lee nativo y sí va).
// Devolvemos "/" y el efecto de _layout.tsx (useShareIntentContext) hace el
// resto: clasifica el texto y navega a /importar.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return "/";
  } catch {
    // ponytail: si el parseo del intent falla, dejamos pasar la URL tal cual
  }
  return path;
}
