import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { createFoodOrderEvent } from "@/lib/food/state";
import { paymentProvider, paymentsConfigured } from "@/lib/payments/provider";

function appUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://nidokey.es").replace(/\/+$/, "");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const order = await prisma.foodOrder.findFirst({
    where: { id, customerId: userId },
    include: { payment: true },
  });
  if (!order) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (order.status === "CANCELLED" || order.status === "DELIVERED") {
    return NextResponse.json({ error: "Pedido cerrado" }, { status: 400 });
  }
  if (order.payment?.status === "SUCCEEDED") {
    return NextResponse.json({ checkoutUrl: order.payment.checkoutUrl, payment: order.payment });
  }
  // Sin PAYMENT_WEBHOOK_SECRET no se puede firmar el intent: 503 explícito en
  // vez del 500 que saldría al intentar firmar. Permite desplegar con los pagos
  // apagados a propósito.
  if (!paymentsConfigured()) {
    return NextResponse.json({ error: "Los pagos no están disponibles todavía." }, { status: 503 });
  }
  const provider = paymentProvider("fake");
  if (!provider) return NextResponse.json({ error: "Proveedor no disponible" }, { status: 500 });
  const returnUrl = `${appUrl()}/food/pay/return?orderId=${encodeURIComponent(order.id)}`;
  const intent = await provider.createIntent({
    amountCents: order.totalCents,
    currency: order.currency,
    orderId: order.id,
    returnUrl,
  });

  const payment = await prisma.$transaction(async (tx) => {
    if (order.status === "CREATED") {
      const updated = await tx.foodOrder.updateMany({
        where: { id: order.id, status: "CREATED" },
        data: { status: "PENDING_PAYMENT" },
      });
      if (updated.count === 0) throw new Error("El pedido ya ha cambiado de estado");
      await createFoodOrderEvent(tx, {
        orderId: order.id,
        fromStatus: "CREATED",
        toStatus: "PENDING_PAYMENT",
        actorType: "SYSTEM",
      });
    }
    if (order.payment) {
      return tx.foodPayment.update({
        where: { orderId: order.id },
        data: {
          provider: "fake",
          providerIntentId: intent.intentId,
          status: "PENDING",
          amountCents: order.totalCents,
          currency: order.currency,
          checkoutUrl: intent.checkoutUrl,
          errorCode: null,
        },
      });
    }
    return tx.foodPayment.create({
      data: {
        orderId: order.id,
        provider: "fake",
        providerIntentId: intent.intentId,
        status: "PENDING",
        amountCents: order.totalCents,
        currency: order.currency,
        checkoutUrl: intent.checkoutUrl,
      },
    });
  });
  return NextResponse.json({ checkoutUrl: intent.checkoutUrl, payment });
}
