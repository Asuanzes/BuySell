import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import {
  applyChangedCounts,
  assertCanCreateDecision,
  DecisionApiError,
  normalizeDecisionStatus,
  normalizeDecisionTitle,
} from "@/lib/decisions";

type ChangedCountRow = { decisionId: string; changedCount: bigint };

function errorResponse(error: unknown) {
  if (error instanceof DecisionApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  throw error;
}

export async function GET() {
  const userId = await requireUserId();
  const decisions = await prisma.decision.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { _count: { select: { items: true } } },
  });

  const changedRows = await prisma.$queryRaw<ChangedCountRow[]>`
    SELECT d.id AS "decisionId", COUNT(re.id)::bigint AS "changedCount"
    FROM "Decision" d
    JOIN "DecisionItem" di ON di."decisionId" = d.id
    JOIN "RecordEvent" re
      ON re."userId" = d."userId"
     AND re."recordType" = di."recordType"
     AND re."recordId" = di."recordId"
     AND re."observedAt" > COALESCE(d."lastVisitedAt", d."createdAt")
    WHERE d."userId" = ${userId}
    GROUP BY d.id
  `;

  return NextResponse.json({ items: applyChangedCounts(decisions, changedRows) });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { title?: unknown; status?: unknown };
    const userId = await requireUserId();
    const title = normalizeDecisionTitle(body.title);
    const status = normalizeDecisionStatus(body.status);

    const openCount =
      status === "open" ? await prisma.decision.count({ where: { userId, status: "open" } }) : 0;
    assertCanCreateDecision(status, openCount);

    const decision = await prisma.decision.create({ data: { userId, title, status } });
    return NextResponse.json({ decision }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    return errorResponse(error);
  }
}
