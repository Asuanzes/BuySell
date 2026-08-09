import type { ToolRunner } from "@/lib/chat/agent";
import { trackEvent } from "@/lib/analytics-events";
import { WRITE_TOOLS } from "@/lib/chat/tool-defs";

type Tracker = typeof trackEvent;

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function withBotWriteToolAudit(
  inner: ToolRunner,
  ctx: { userId: string; conversationId: string },
  tracker: Tracker = trackEvent,
): ToolRunner {
  return async (name, argsJson) => {
    const result = await inner(name, argsJson);
    if (!name || !(WRITE_TOOLS as readonly string[]).includes(name)) return result;

    const args = parseJsonObject(argsJson);
    const parsed = parseJsonObject(result);
    await tracker("bot_write_tool", {
      userId: ctx.userId,
      props: {
        conversationId: ctx.conversationId,
        tool: name,
        type: pickString(args.type),
        id: pickString(args.id) ?? pickString(args.keep_id) ?? pickString(parsed.id),
        resultOk: !parsed.error,
      },
    });
    return result;
  };
}
