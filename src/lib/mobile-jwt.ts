import * as jose from "jose";

/**
 * JWT propio para clientes móviles (Authorization: Bearer ...).
 * Firmado con el mismo AUTH_SECRET que NextAuth para mantener un único trust root.
 *
 * Independiente del JWT-de-cookie de NextAuth: usamos issuer distinto
 * ("nidokey-mobile") para evitar confusiones.
 */

const ALG = "HS256";
const ISSUER = "nidokey-mobile";
const EXPIRY = "90d"; // sesión móvil larga (usuario raras veces re-loguea en su propio dispositivo)

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET missing");
  return new TextEncoder().encode(s);
}

/**
 * `expiry` opcional: la sesión del móvil usa el default largo; los tokens
 * internos (bot) deben pedir uno corto — un JWT filtrado en un log solo
 * valdría minutos, no 90 días.
 */
export async function issueMobileJwt(userId: string, email: string, expiry: string = EXPIRY): Promise<string> {
  return await new jose.SignJWT({ email })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiry)
    .sign(getSecret());
}

export async function verifyMobileJwt(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, getSecret(), { issuer: ISSUER });
    if (!payload.sub || !payload.email) return null;
    return { userId: String(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}
