import { after } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createFoodOrderEvent } from "@/lib/food/state";
import { notifyFoodOrder, sendFoodPush } from "@/lib/food/service";
import { paymentProvider } from "@/lib/payments/provider";

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerName } = await params;
  const provider = paymentProvider(providerName);
  if (!provider) return NextResponse.json({ error: "Proveedor no soportado" }, { status: 404 });

  const event = await provider.verifyWebhook(req);
  if (!event) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  try {
    await prisma.paymentWebhookEvent.create({
      data: {
        provider: providerName,
        eventId: event.eventId,
        type: event.type,
        payload: event.payload as object,
      },
    });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  const payment = await prisma.foodPayment.findUnique({
    where: { provider_providerIntentId: { provider: providerName, providerIntentId: event.intentId } },
    include: { order: true },
  });
  if (!payment) return NextResponse.json({ ok: true });

  await prisma.paymentWebhookEvent.updateMany({
    where: { provider: providerName, eventId: event.eventId },
    data: { orderId: payment.orderId },
  });

  if (event.amountCents !== payment.amountCents) {
    await prisma.foodPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED", errorCode: "AMOUNT_MISMATCH" },
    });
    return NextResponse.json({ ok: true });
  }

  if (event.type === "failed") {
    await prisma.foodPayment.update({ where: { id: payment.id }, data: { status: "FAILED", errorCode: "PROVIDER_FAILED" } });
    return NextResponse.json({ ok: true });
  }

  if (event.type === "refunded") {
    await prisma.foodPayment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    return NextResponse.json({ ok: true });
  }

  if (payment.order.status === "CANCELLED") {
    const refund = payment.providerIntentId ? await provider.refund(payment.providerIntentId).catch(() => null) : null;
    await prisma.foodPayment.update({
      where: { id: payment.id },
      data: { status: refund ? "REFUNDED" : "SUCCEEDED", providerRefundId: refund?.refundId, errorCode: refund ? null : "LATE_WEBHOOK_CANCELLED" },
    });
    return NextResponse.json({ ok: true });
  }

  if (payment.order.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(async (tx) => {
    await tx.foodPayment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", errorCode: null } });
    const updated = await tx.foodOrder.updateMany({
      where: { id: payment.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (updated.count > 0) {
      await createFoodOrderEvent(tx, {
        orderId: payment.orderId,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "PAID",
        actorType: "SYSTEM",
        meta: { provider: providerName, eventId: event.eventId },
      });
    }
  });

  after(async () => {
    await notifyFoodOrder(payment.orderId, null);
    await sendFoodPush(payment.orderId, "Pedido pagado", "El restaurante ya puede aceptarlo", null);
    // Embudo: pago de pedido confirmado (server-side, fuente de verdad).
    await prisma.analyticsEvent
      .create({
        data: {
          userId: payment.order.customerId,
          name: "food_order_paid",
          props: { amountCents: payment.amountCents, provider: providerName },
        },
      })
      .catch(() => {});
  });
  return NextResponse.json({ ok: true });
}
