import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueMobileJwt } from "@/lib/mobile-jwt";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const Body = z.object({
  email: z.string().email().max(200),
  code: z.string().regex(/^\d{6}$/, "Código debe ser 6 dígitos"),
});

// Máximo de intentos fallidos por OTP emitido. Al alcanzarlo, el código se
// invalida (anti fuerza bruta sobre el espacio de 1.000.000 de combinaciones).
const MAX_ATTEMPTS = 5;

/**
 * POST /api/auth/mobile/verify
 * Body: { email, code }
 *
 * Verifica el OTP. Si es correcto:
 *  - Consume el código (delete).
 *  - Marca `emailVerified`.
 *  - Devuelve JWT (Authorization: Bearer ...) + datos del usuario.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.flatten() },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  const email = parsed.data.email.trim().toLowerCase();
  const code = parsed.data.code;

  // Rate limit por IP: complementa el candado de 5 intentos por código (que un
  // atacante multi-email eludiría) y sobre todo protege la cuenta de revisión
  // de abajo, cuya comparación directa NO pasa por el contador de intentos.
  const ipLimit = await rateLimit("otp-verify-ip", clientIp(req), { limit: 30, windowMs: 15 * 60_000 });
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Inténtalo más tarde." },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  // Cuenta de revisión (App Store): permite a los revisores entrar sin acceso
  // al email. Solo activo si REVIEW_LOGIN_EMAIL y REVIEW_LOGIN_CODE están puestas.
  const reviewEmail = process.env.REVIEW_LOGIN_EMAIL?.trim().toLowerCase();
  const reviewCode = process.env.REVIEW_LOGIN_CODE;
  if (reviewEmail && reviewCode && email === reviewEmail && code === reviewCode) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, emailVerified: new Date() },
      update: { emailVerified: new Date() },
    });
    const token = await issueMobileJwt(user.id, user.email);
    return NextResponse.json(
      { token, user: { id: user.id, email: user.email, name: user.name } },
      { headers: CORS_HEADERS }
    );
  }

  // Buscamos el OTP pendiente por EMAIL (no por el código tecleado): así
  // podemos contar intentos fallidos aunque el código no coincida. request/
  // borra los anteriores, por lo que hay como mucho uno por email.
  const vt = await prisma.verificationToken.findFirst({
    where: { identifier: email, token: { startsWith: "mobile:" } },
  });
  if (!vt) {
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401, headers: CORS_HEADERS });
  }
  if (vt.expires < new Date()) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: vt.token } },
    });
    return NextResponse.json({ error: "Código caducado" }, { status: 401, headers: CORS_HEADERS });
  }
  // Demasiados intentos → invalidamos el código y obligamos a pedir uno nuevo.
  if (vt.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationToken.delete({
      where: { identifier_token: { identifier: email, token: vt.token } },
    });
    return NextResponse.json(
      { error: "Demasiados intentos. Pide un código nuevo." },
      { status: 429, headers: CORS_HEADERS }
    );
  }
  // Código incorrecto → sumamos un intento y rechazamos (sin consumir el OTP).
  if (vt.token !== `mobile:${code}`) {
    await prisma.verificationToken.update({
      where: { identifier_token: { identifier: email, token: vt.token } },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401, headers: CORS_HEADERS });
  }

  // Correcto → consumir el código (one-time use)
  await prisma.verificationToken.delete({
    where: { identifier_token: { identifier: email, token: vt.token } },
  });

  // Marcar email como verificado
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, emailVerified: new Date() },
    update: { emailVerified: new Date() },
  });

  const token = await issueMobileJwt(user.id, user.email);
  return NextResponse.json(
    {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        needsOnboarding: user.onboardingCompletedAt == null,
      },
    },
    { headers: CORS_HEADERS }
  );
}
