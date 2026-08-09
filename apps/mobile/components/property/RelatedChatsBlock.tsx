import { RelatedChatsPanel } from "@/components/records/RelatedChatsBlock";
import type { RelatedChat } from "@/lib/records/related-chats";

/**
 * Wrapper legacy de property: mantiene intacto el contrato que ya usa
 * app/property/[id].tsx mientras el bloque vive en components/records.
 */
export function RelatedChatsBlock({
  chats,
  loading,
  onOpenChat,
  onShare,
}: {
  chats: RelatedChat[] | null;
  loading: boolean;
  onOpenChat: (conversationId: string, hasPreview: boolean) => void;
  onShare: () => void;
}) {
  return (
    <RelatedChatsPanel
      recordType="property"
      chats={chats}
      loading={loading}
      onOpenChat={onOpenChat}
      onShare={onShare}
    />
  );
}

