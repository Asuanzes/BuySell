import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import {
  assertCanCreateDecision,
  assertOwnedDecision,
  DecisionApiError,
  loadBaseRecordsForItems,
  normalizeDecisionStatus,
  normalizeDecisionTitle,
} from "@/lib/decisions";

type Ctx = { params: Promise<{ id: string }> };
type ChangedCountRow = { changedCount: bigint };

function errorResponse(error: unknown) {
  if (error instanceof DecisionApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  throw error;
}

async function changedCountForDecision(decisionId: string, userId: string) {
  const rows = await prisma.$queryRaw<ChangedCountRow[]>`
    SELECT COUNT(re.id)::bigint AS "changedCount"
    FROM "Decision" d
    JOIN "DecisionItem" di ON di."decisionId" = d.id
    JOIN "RecordEvent" re
      ON re."userId" = d."userId"
     AND re."recordType" = di."recordType"
     AND re."recordId" = di."recordId"
     AND re."observedAt" > COALESCE(d."lastVisitedAt", d."createdAt")
    WHERE d.id = ${decisionId}
      AND d."userId" = ${userId}
  `;
  return Number(rows[0]?.changedCount ?? 0);
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const decision = await prisma.decision.findFirst({
    where: { id, userId },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });
  if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const changedCount = await changedCountForDecision(decision.id, userId);
  const records = await loadBaseRecordsForItems(prisma, userId, decision.items);
  const items = decision.items.map((item) => ({
    recordType: item.recordType,
    recordId: item.recordId,
    addedAt: item.addedAt,
    record: records.get(`${item.recordType}\0${item.recordId}`) ?? null,
  }));

  await prisma.decision.update({ where: { id: decision.id }, data: { lastVisitedAt: new Date() } });

  return NextResponse.json({
    decision: {
      id: decision.id,
      title: decision.title,
      status: decision.status,
      lastVisitedAt: decision.lastVisitedAt,
      createdAt: decision.createdAt,
      updatedAt: decision.updatedAt,
    },
    items,
    changedCount,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { title?: unknown; status?: unknown };
    const current = assertOwnedDecision(await prisma.decision.findFirst({ where: { id, userId } }), userId);

    const data: { title?: string; status?: string } = {};
    if ("title" in body) data.title = normalizeDecisionTitle(body.title);
    if ("status" in body) {
      const nextStatus = normalizeDecisionStatus(body.status, current.status === "archived" ? "archived" : "open");
      if (nextStatus === "open" && current.status !== "open") {
        const openCount = await prisma.decision.count({ where: { userId, status: "open" } });
        assertCanCreateDecision(nextStatus, openCount);
      }
      data.status = nextStatus;
    }

    const decision = await prisma.decision.update({ where: { id: current.id }, data });
    return NextResponse.json({ decision });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await requireUserId();
  const deleted = await prisma.decision.deleteMany({ where: { id, userId } });
  if (deleted.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
