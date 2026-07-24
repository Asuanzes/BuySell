import { createHmac, randomInt } from "node:crypto";
import { FoodOrderStatus, type FoodOrder, type FoodOrderActor, type Prisma } from "@prisma/client";
import { haversineMeters } from "@nidokey/shared";
import { prisma } from "@/lib/db";

export const FOOD_PAYMENT_TTL_MS = 30 * 60 * 1000;

export type FoodCartItemInput = { menuItemId: string; quantity: number; notes?: string | null };

export function orderCode(): string {
  // CSPRNG (P3 auditoría): Math.random es predecible; los códigos de pedido se
  // muestran a restaurante/repartidor y no deben ser adivinables.
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[randomInt(alphabet.length)];
  return `NK-${code}`;
}

export async function quoteFoodOrder(restaurantId: string, items: FoodCartItemInput[]) {
  const ids = [...new Set(items.map((i) => i.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids }, restaurantId, available: true, restaurant: { active: true, isOpen: true } },
    select: { id: true, name: true, priceCents: true, restaurant: true },
  });
  const byId = new Map(menuItems.map((i) => [i.id, i]));
  const lines = items.map((raw) => {
    const item = byId.get(raw.menuItemId);
    const quantity = Math.max(1, Math.min(20, Math.floor(raw.quantity)));
    if (!item) throw new Error("Producto no disponible");
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      unitPriceCents: item.priceCents,
      quantity,
      totalCents: item.priceCents * quantity,
      notes: raw.notes?.slice(0, 280) ?? null,
    };
  });
  if (lines.length === 0) throw new Error("Carrito vacío");
  const restaurant = menuItems[0]?.restaurant;
  if (!restaurant) throw new Error("Restaurante no disponible");
  const subtotalCents = lines.reduce((sum, item) => sum + item.totalCents, 0);
  if (subtotalCents < restaurant.minOrderCents) throw new Error("Pedido mínimo no alcanzado");
  const deliveryFeeCents = restaurant.deliveryFeeCents;
  return {
    restaurant,
    items: lines,
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents,
    currency: restaurant.currency,
  };
}

export function assertInDeliveryRadius(restaurant: { latitude: number; longitude: number; deliveryRadiusM: number }, lat: number, lng: number) {
  const distanceM = haversineMeters(restaurant.latitude, restaurant.longitude, lat, lng);
  if (distanceM > restaurant.deliveryRadiusM) throw new Error("Fuera del radio de reparto");
  return Math.round(distanceM);
}

export function foodOrderDto(
  order: FoodOrder & {
    restaurant?: { id: string; name: string; imageUrl: string | null; address: string; latitude: number; longitude: number } | null;
    items?: {
      id: string;
      menuItemId: string | null;
      nameSnapshot: string;
      unitPriceCents: number;
      quantity: number;
      totalCents: number;
      notes: string | null;
    }[];
    payment?: { status: string; checkoutUrl: string | null } | null;
    events?: {
      id: string;
      fromStatus: FoodOrderStatus | null;
      toStatus: FoodOrderStatus;
      actorType: FoodOrderActor;
      createdAt: Date;
      meta: Prisma.JsonValue;
    }[];
  }
) {
  return {
    id: order.id,
    code: order.code,
    status: order.status,
    restaurant: order.restaurant,
    courierId: order.courierId,
    deliveryAddress: order.deliveryAddress,
    deliveryCity: order.deliveryCity,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    deliveryNotes: order.deliveryNotes,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    currency: order.currency,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancelReason: order.cancelReason,
    items: order.items ?? [],
    payment: order.payment ? { status: order.payment.status, checkoutUrl: order.payment.checkoutUrl } : null,
    events: (order.events ?? []).map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorType: e.actorType,
      createdAt: e.createdAt.toISOString(),
      meta: e.meta,
    })),
  };
}

const gatewayUrl = () => process.env.CHAT_GATEWAY_URL?.trim().replace(/\/+$/, "");
const gatewaySecret = () => process.env.CHAT_GATEWAY_SECRET || "";

export async function notifyFoodOrder(orderId: string, actorUserId?: string | null): Promise<void> {
  if (!gatewayUrl() || !gatewaySecret()) return;
  const order = await prisma.foodOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      customerId: true,
      courierId: true,
      restaurant: { select: { staff: { select: { userId: true } } } },
    },
  });
  if (!order) return;
  const participantIds = [
    order.customerId,
    ...order.restaurant.staff.map((s) => s.userId),
    order.courierId,
  ].filter((u): u is string => !!u && u !== actorUserId);
  if (participantIds.length === 0) return;
  const body = JSON.stringify({ event: "order", orderId: order.id, status: order.status, participantIds, actorUserId });
  const signature = "sha256=" + createHmac("sha256", gatewaySecret()).update(body).digest("hex");
  await fetch(`${gatewayUrl()}/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nidokey-signature": signature },
    body,
    signal: AbortSignal.timeout(2000),
  }).catch((e) => console.error(`[food-gw] notify error: ${e instanceof Error ? e.message : String(e)}`));
}

type FoodPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { type: "food"; orderId: string };
  channelId: "default";
};

export async function sendFoodPush(orderId: string, title: string, body: string, actorUserId?: string | null) {
  const order = await prisma.foodOrder.findUnique({
    where: { id: orderId },
    select: {
      customerId: true,
      courierId: true,
      restaurant: { select: { staff: { select: { userId: true } } } },
    },
  });
  if (!order) return;
  const users = [
    order.customerId,
    ...order.restaurant.staff.map((s) => s.userId),
    order.courierId,
  ].filter((u): u is string => !!u && u !== actorUserId);
  if (!users.length) return;
  const devices = await prisma.device.findMany({
    where: { userId: { in: users } },
    select: { expoPushToken: true },
  });
  if (!devices.length) return;
  const messages: FoodPushMessage[] = devices.map((d) => ({
    to: d.expoPushToken,
    title,
    body,
    sound: "default",
    data: { type: "food", orderId },
    channelId: "default",
  }));
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  }).catch((e) => console.error(`[food-push] error: ${e instanceof Error ? e.message : String(e)}`));
}
