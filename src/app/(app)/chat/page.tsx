import { AIChatSurface } from "@/components/ai/AIChatSurface";

import { sectionMetadata } from "@/lib/needt3/section-titles";

export const metadata = sectionMetadata("chat");

export default function ChatPage() {
  return (
    <div className="h-full">
      <AIChatSurface />
    </div>
  );
}
