import { PublicScope } from "@/components/needt3/states/PublicScope";

import { CancelBookingButton } from "./CancelBookingButton";

export default async function CancelBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <PublicScope>
      <main className="pub-center">
        <section className="pub-card is-small">
          <h1 className="pub-card-title">Cancel this booking?</h1>
          <p className="pub-lead" style={{ marginBottom: 20 }}>
            The time will become available again. This action cannot be undone.
          </p>
          <CancelBookingButton token={token} />
        </section>
      </main>
    </PublicScope>
  );
}
