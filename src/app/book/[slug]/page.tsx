import { notFound } from "next/navigation";

import { CalendarDays, Clock3 } from "lucide-react";

import { prisma } from "@/lib/prisma";

import { BookingForm } from "./BookingForm";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await prisma.bookingPage.findFirst({
    where: {
      slug,
      isActive: true,
      user: { emailVerified: { not: null } },
    },
    select: {
      slug: true,
      title: true,
      description: true,
      durationMinutes: true,
      timeZone: true,
    },
  });
  if (!page) notFound();

  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:py-16">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 max-w-2xl">
          <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Needt booking
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {page.title}
          </h1>
          {page.description && (
            <p className="mt-3 text-base text-muted-foreground">
              {page.description}
            </p>
          )}
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" /> {page.durationMinutes} minutes
          </div>
        </header>
        <BookingForm slug={page.slug} timeZone={page.timeZone} />
      </div>
    </main>
  );
}
