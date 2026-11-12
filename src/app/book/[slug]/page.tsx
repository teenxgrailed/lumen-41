import { notFound } from "next/navigation";

import { LuCalendarDays, LuClock3 } from "react-icons/lu";

import { PublicScope } from "@/components/needt3/states/PublicScope";

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
    <PublicScope>
      <main className="pub-page">
        <header className="pub-book-header">
          <div className="pub-kicker">
            <LuCalendarDays size={14} aria-hidden /> Needt booking
          </div>
          <h1 className="pub-title">{page.title}</h1>
          {page.description && <p className="pub-lead">{page.description}</p>}
          <div className="pub-kicker pub-book-duration">
            <LuClock3 size={14} aria-hidden /> {page.durationMinutes} minutes
          </div>
        </header>
        <BookingForm slug={page.slug} timeZone={page.timeZone} />
      </main>
    </PublicScope>
  );
}
