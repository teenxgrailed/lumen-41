"use client";

import type { ComponentProps } from "react";

import { HaEndDay } from "./HaEndDay";
import { HaReview } from "./HaReview";
import { HaSheet } from "./HaSheet";

/** End day (5): the design's sheet in the phone sheet or the desktop dialog. */
export function HaEndDaySheet({
  open,
  phone,
  ...body
}: ComponentProps<typeof HaEndDay> & { open: boolean; phone?: boolean }) {
  return (
    <HaSheet open={open} phone={phone} label="End day" onClose={body.onClose}>
      <HaEndDay {...body} />
    </HaSheet>
  );
}

/** The weekly review (10), the same way. */
export function HaReviewSheet({
  open,
  phone,
  ...body
}: ComponentProps<typeof HaReview> & { open: boolean; phone?: boolean }) {
  return (
    <HaSheet
      open={open}
      phone={phone}
      label="Weekly review"
      onClose={body.onClose}
    >
      <HaReview {...body} />
    </HaSheet>
  );
}
