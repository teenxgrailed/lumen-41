import { CancelBookingButton } from "./CancelBookingButton";

export default async function CancelBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <h1 className="text-xl font-semibold">Cancel this booking?</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          The time will become available again. This action cannot be undone.
        </p>
        <CancelBookingButton token={token} />
      </section>
    </main>
  );
}
