import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/db";
import {
  assertCanAddDecisionItem,
  DecisionApiError,
  isPrismaUniqueError,
  normalizeDecisionRecordType,
} from "@/lib/decisions";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof DecisionApiError) {
    return NextResponse.json({ error: error.message, detail: error.detail }, { status: error.status });
  }
  throw error;
}

function normalizeRecordId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new DecisionApiError(400, "recordId es obligatorio");
  }
  return value.trim();
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { recordType?: unknown; recordId?: unknown };
    const recordType = normalizeDecisionRecordType(body.recordType);
    const recordId = normalizeRecordId(body.recordId);

    const decision = await prisma.decision.findFirst({
      where: { id, userId },
      include: { _count: { select: { items: true } } },
    });
    if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });
    assertCanAddDecisionItem(decision._count.items);

    try {
      const item = await prisma.decisionItem.create({ data: { decisionId: decision.id, recordType, recordId } });
      return NextResponse.json({ item, created: true }, { status: 201 });
    } catch (error) {
      if (!isPrismaUniqueError(error)) throw error;
      const item = await prisma.decisionItem.findFirst({ where: { decisionId: decision.id, recordType, recordId } });
      return NextResponse.json({ item, created: false, ok: true });
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const userId = await requireUserId();
    const body = (await req.json()) as { recordType?: unknown; recordId?: unknown };
    const recordType = normalizeDecisionRecordType(body.recordType);
    const recordId = normalizeRecordId(body.recordId);

    const decision = await prisma.decision.findFirst({ where: { id, userId }, select: { id: true } });
    if (!decision) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const deleted = await prisma.decisionItem.deleteMany({ where: { decisionId: decision.id, recordType, recordId } });
    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    return errorResponse(error);
  }
}
