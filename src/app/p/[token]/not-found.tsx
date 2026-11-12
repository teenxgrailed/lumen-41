import type { Metadata } from "next";

import { LuFileText } from "react-icons/lu";

import { PublicScope } from "@/components/needt3/states/PublicScope";

export const metadata: Metadata = {
  title: "Page not found | Needt",
  description: "This public Page link is invalid or no longer exists.",
  robots: { index: false, follow: false },
};

export default function PublishedPageNotFound() {
  return (
    <PublicScope>
      <main className="pub-center">
        <div className="pub-card is-small">
          <LuFileText size={32} className="pub-icon" aria-hidden />
          <h1 className="pub-card-title">Page not found</h1>
          <p className="pub-lead">
            This public link is invalid or no longer exists.
          </p>
        </div>
      </main>
    </PublicScope>
  );
}
