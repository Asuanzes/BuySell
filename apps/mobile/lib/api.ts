/**
 * Cliente HTTP para hablar con el backend de Nidokey.
 *
 * Lee la URL de EXPO_PUBLIC_API_URL (env de Expo, expuesta al cliente).
 * Si hay token de sesión, lo añade como `Authorization: Bearer`.
 */
import i18n from "i18next";

import { getItem } from "./secure-store";
import { localeForLang } from "./i18n/languages";

/**
 * URL base del backend de Nidokey — ORIGEN, sin "/api".
 * Cada endpoint incluye su ruta completa, p.ej. api("/api/auth/mobile/request").
 *
 * Resolución por prioridad:
 *  1. EXPO_PUBLIC_API_URL → override explícito sin recompilar. Úsalo para
 *     apuntar Expo Go a producción, o a tu IP local de LAN en desarrollo:
 *       EXPO_PUBLIC_API_URL=https://nidokey.es
 *       EXPO_PUBLIC_API_URL=http://192.168.1.77:4200   (← tu IP local en dev)
 *  2. Build de producción (__DEV__ === false) → https://nidokey.es (HTTPS).
 *  3. Desarrollo (Expo Go / Metro, __DEV__ === true) → IP local de LAN.
 *
 * Producción SIEMPRE por HTTPS; el http:// solo aplica al dev server en LAN.
 */
const PROD_URL = "https://nidokey.es";
// ⚠️ DEV: cambia esta IP por la de tu máquina en la LAN (ipconfig / ifconfig),
// o mejor define EXPO_PUBLIC_API_URL para no recompilar.
const DEV_URL = "http://192.168.1.77:4200";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (__DEV__ ? DEV_URL : PROD_URL);
export const TOKEN_KEY = "nidokey.mobile.token";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export type ApiOptions = RequestInit & { skipAuth?: boolean; timeoutMs?: number };

/**
 * Timeout por defecto de toda petición. Sin él, un POST sobre red móvil
 * degradada puede colgar minutos y dejar la UI en "enviando…" para siempre
 * (P1 de la auditoría del chat). AbortController manual: Hermes no trae
 * AbortSignal.timeout.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Construye el header Authorization con el JWT móvil emitido por el servidor.
 * Reutilizable; devuelve {} si no hay token.
 */
export function getAuthHeaders(mobileJwt?: string | null): { Authorization?: string } {
  return mobileJwt ? { Authorization: `Bearer ${mobileJwt}` } : {};
}

async function authHeader(): Promise<{ Authorization?: string }> {
  const token = await getItem(TOKEN_KEY);
  return getAuthHeaders(token);
}

/**
 * Idioma de la app para el backend.
 *
 * Hasta ahora el servidor no sabía en qué idioma estaba la app, así que las
 * noticias de mercados, cripto y tendencias salían SIEMPRE en español: los
 * proveedores llevaban la región escrita a mano porque no tenían alternativa.
 * Va por `Accept-Language`, que es la cabecera estándar para esto, y así lo
 * aprovecha cualquier ruta —incluidas las que aún no existen— sin tocar cada
 * llamada.
 *
 * Se lee de i18next en cada petición, no se captura al arrancar: el idioma se
 * cambia en caliente desde Ajustes.
 */
function languageHeader(): { "Accept-Language"?: string } {
  try {
    const lang = i18n.language === "en" ? "en" : "es";
    return { "Accept-Language": `${localeForLang(lang)},${lang};q=0.9` };
  } catch {
    return {};
  }
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { skipAuth, headers, timeoutMs, ...rest } = opts;
  const auth = skipAuth ? {} : await authHeader();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...languageHeader(),
        ...auth,
        // Lo que pida el llamante manda: puede sobrescribir el idioma si alguna
        // pantalla necesitara pedir en otro.
        ...(headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    // Abort → error entendible (el caller lo enseña tal cual al usuario).
    if (controller.signal.aborted) throw new ApiError(0, "Sin respuesta del servidor, reintenta", null);
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* not json */ }
  if (!res.ok) {
    const msg =
      (body as { error?: string })?.error ??
      (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

// ─── Endpoints auth ───

export async function authRequestOtp(email: string): Promise<{ ok: true }> {
  return api("/api/auth/mobile/request", {
    method: "POST",
    body: JSON.stringify({ email }),
    skipAuth: true,
  });
}

export async function authVerifyOtp(
  email: string,
  code: string
): Promise<{
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    username: string | null;
    needsOnboarding: boolean;
  };
}> {
  return api("/api/auth/mobile/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
    skipAuth: true,
  });
}
