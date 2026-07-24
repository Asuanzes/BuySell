import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { baseUrl, signPaymentWebhook } from "@/lib/payments/provider";
import { verifyFakeSubToken } from "@/lib/billing/provider";
import { PREMIUM_PLAN } from "@/lib/billing/plans";

/**
 * POST /api/billing/fake/[ref] — confirmación del checkout FAKE de suscripción
 * (espejo de /api/payments/fake). Verifica el token firmado de la página y
 * reentra por el webhook firmado — el mismo camino que seguiría Stripe.
 */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const form = await req.formData();
  const token = String(form.get("t") ?? "");

  const sub = await prisma.subscription.findUnique({ where: { id: ref }, select: { id: true } });
  if (!sub) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!verifyFakeSubToken(ref, token)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 403 });
  }

  const ok = form.get("result") !== "ko";
  const payload = JSON.stringify({
    eventId: `fsub_evt_${ref}_${ok ? "ok" : "ko"}_${Date.now().toString(36)}`,
    type: ok ? "activated" : "payment_failed",
    subscriptionRef: ref,
    amountCents: PREMIUM_PLAN.priceCents,
    periodEndISO: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
  const origin = baseUrl();
  const res = await fetch(`${origin}/api/billing/webhook/fake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-nidokey-payment-signature": signPaymentWebhook(payload),
    },
    body: payload,
  });
  if (!res.ok) {
    return NextResponse.json({ error: "No se pudo simular el pago" }, { status: 500 });
  }
  return NextResponse.redirect(`${origin}/billing/pay/return?status=${ok ? "success" : "failed"}`, 303);
}
