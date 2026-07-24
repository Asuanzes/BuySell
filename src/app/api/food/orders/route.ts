import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FoodOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth-helpers";
import { assertInDeliveryRadius, foodOrderDto, FOOD_PAYMENT_TTL_MS, orderCode, quoteFoodOrder } from "@/lib/food/service";
import { createFoodOrderEvent } from "@/lib/food/state";

const Item = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive().max(20),
  notes: z.string().max(280).optional().nullable(),
});

const Body = z.object({
  restaurantId: z.string().min(1),
  clientId: z.string().min(6).max(120),
  addressId: z.string().min(1).optional(),
  address: z
    .object({
      line: z.string().min(4),
      city: z.string().min(2),
      latitude: z.number(),
      longitude: z.number(),
      notes: z.string().max(280).optional().nullable(),
    })
    .optional(),
  items: z.array(Item).min(1),
});

export async function POST(req: Request) {
  const customerId = await requireUserId();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido", detail: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.foodOrder.findUnique({
    where: { customerId_clientId: { customerId, clientId: parsed.data.clientId } },
    include: { restaurant: true, items: true, payment: true, events: { orderBy: { createdAt: "asc" } } },
  });
  if (existing) return NextResponse.json({ order: foodOrderDto(existing), idempotent: true });

  const address = parsed.data.addressId
    ? await prisma.foodAddress.findFirst({ where: { id: parsed.data.addressId, userId: customerId } })
    : null;
  if (parsed.data.addressId && !address) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const snapshot = address
    ? {
        line: address.line,
        city: address.city,
        latitude: address.latitude,
        longitude: address.longitude,
        notes: address.notes,
      }
    : parsed.data.address;
  if (!snapshot) return NextResponse.json({ error: "Dirección requerida" }, { status: 400 });

  try {
    const quote = await quoteFoodOrder(parsed.data.restaurantId, parsed.data.items);
    assertInDeliveryRadius(quote.restaurant, snapshot.latitude, snapshot.longitude);
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.foodOrder.create({
        data: {
          code: orderCode(),
          customerId,
          restaurantId: parsed.data.restaurantId,
          clientId: parsed.data.clientId,
          deliveryAddress: snapshot.line,
          deliveryCity: snapshot.city,
          deliveryLat: snapshot.latitude,
          deliveryLng: snapshot.longitude,
          deliveryNotes: snapshot.notes ?? null,
          subtotalCents: quote.subtotalCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          totalCents: quote.totalCents,
          currency: quote.currency,
          expiresAt: new Date(Date.now() + FOOD_PAYMENT_TTL_MS),
          items: { create: quote.items },
        },
      });
      await createFoodOrderEvent(tx, {
        orderId: created.id,
        toStatus: "CREATED",
        actorType: "CUSTOMER",
        actorId: customerId,
      });
      return tx.foodOrder.findUniqueOrThrow({
        where: { id: created.id },
        include: { restaurant: true, items: true, payment: true, events: { orderBy: { createdAt: "asc" } } },
      });
    });
    return NextResponse.json({ order: foodOrderDto(order), idempotent: false }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo crear el pedido" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  const role = req.nextUrl.searchParams.get("role") ?? "customer";
  const rawStatus = req.nextUrl.searchParams.get("status") ?? undefined;
  const active = req.nextUrl.searchParams.get("active") === "1";
  const activeStatuses: FoodOrderStatus[] = [FoodOrderStatus.CREATED, FoodOrderStatus.PENDING_PAYMENT, FoodOrderStatus.PAID, FoodOrderStatus.PREPARING, FoodOrderStatus.READY, FoodOrderStatus.IN_DELIVERY];
  const status = rawStatus && rawStatus in FoodOrderStatus ? (rawStatus as FoodOrderStatus) : undefined;
  const statusWhere = active ? { in: activeStatuses } : status ? status : undefined;

  if (role === "restaurant") {
    const staff = await prisma.restaurantStaff.findMany({ where: { userId }, select: { restaurantId: true } });
    const orders = await prisma.foodOrder.findMany({
      where: { restaurantId: { in: staff.map((s) => s.restaurantId) }, ...(statusWhere ? { status: statusWhere } : {}) },
      // P2 auditoría: las LISTAS no cargan el histórico de eventos (el detalle sí).
      include: { restaurant: true, items: true, payment: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ orders: orders.map(foodOrderDto) });
  }

  if (role === "courier") {
    const courier = await prisma.courierProfile.findUnique({ where: { userId } });
    if (!courier) return NextResponse.json({ orders: [] });
    const orders = await prisma.foodOrder.findMany({
      where: { courierId: userId, ...(statusWhere ? { status: statusWhere } : {}) },
      include: { restaurant: true, items: true, payment: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ orders: orders.map(foodOrderDto) });
  }

  const orders = await prisma.foodOrder.findMany({
    where: { customerId: userId, ...(statusWhere ? { status: statusWhere } : {}) },
    include: { restaurant: true, items: true, payment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ orders: orders.map(foodOrderDto) });
}
