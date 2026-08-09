import { NextRequest, NextResponse } from "next/server";

import { requireUserId } from "@/lib/auth-helpers";
import { getRelatedChatsForRecord } from "@/lib/chat/related-chats";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/records/[id]/related-chats?type=X
 *
 * Conversaciones vinculadas a cualquier registro soportado por `RecordType`.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const viewerId = await requireUserId();
  const result = await getRelatedChatsForRecord(viewerId, req.nextUrl.searchParams.get("type"), id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ chats: result.chats });
}
