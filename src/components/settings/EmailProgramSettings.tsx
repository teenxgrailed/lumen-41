"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { logger } from "@/lib/logger";
import { notify } from "@/lib/notifications";

const LOG_SOURCE = "EmailProgramSettings";

type Stored = {
  emailFooterName: string | null;
  emailFooterAddress: string | null;
  emailTrialPromoCode: string | null;
  emailTrackingEndsAt: string | null;
};

const EMPTY: Stored = {
  emailFooterName: null,
  emailFooterAddress: null,
  emailTrialPromoCode: null,
  emailTrackingEndsAt: null,
};

/** "2026-12-02" for a date input from a stored ISO instant. */
const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : "");

/**
 * The four values the email programme needs from the owner. Until the footer
 * name and address are both set, only account email goes out: nothing optional
 * is sent and the admin sees why.
 */
export function EmailProgramSettings() {
  const [stored, setStored] = useState<Stored>(EMPTY);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [promo, setPromo] = useState("");
  const [trackingEnd, setTrackingEnd] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/system-settings")
      .then((res) => res.json())
      .then((data: Partial<Stored>) => {
        const next: Stored = {
          emailFooterName: data.emailFooterName ?? null,
          emailFooterAddress: data.emailFooterAddress ?? null,
          emailTrialPromoCode: data.emailTrialPromoCode ?? null,
          emailTrackingEndsAt: data.emailTrackingEndsAt ?? null,
        };
        setStored(next);
        setName(next.emailFooterName ?? "");
        setAddress(next.emailFooterAddress ?? "");
        setPromo(next.emailTrialPromoCode ?? "");
        setTrackingEnd(toDateInput(next.emailTrackingEndsAt));
        setLoaded(true);
      })
      .catch((error) => {
        logger.error(
          "Failed to load email programme settings",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
      });
  }, []);

  const footerSet = Boolean(
    stored.emailFooterName?.trim() && stored.emailFooterAddress?.trim()
  );

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/system-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailFooterName: name,
          emailFooterAddress: address,
          emailTrialPromoCode: promo,
          emailTrackingEndsAt: trackingEnd || null,
        }),
      });
      if (!response.ok) {
        notify.error("Not saved. Try again.");
        return;
      }
      const data = (await response.json()) as Partial<Stored>;
      setStored({
        emailFooterName: data.emailFooterName ?? null,
        emailFooterAddress: data.emailFooterAddress ?? null,
        emailTrialPromoCode: data.emailTrialPromoCode ?? null,
        emailTrackingEndsAt: data.emailTrackingEndsAt ?? null,
      });
      notify.success("Saved.");
    } catch {
      notify.error("Not saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="email-program-settings">
      {loaded && !footerSet ? (
        <p role="status" className="text-sm text-destructive">
          Optional email is paused. Set both the name and the address below;
          until then only account email is sent.
        </p>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="email-footer-name">Footer name</Label>
        <Input
          id="email-footer-name"
          value={name}
          maxLength={120}
          onChange={(e) => setName(e.target.value)}
          placeholder="Who sends the email"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email-footer-address">Footer postal address</Label>
        <Input
          id="email-footer-address"
          value={address}
          maxLength={240}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, city, country"
        />
        <p className="text-sm text-muted-foreground">
          Shown at the bottom of every optional email.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="email-trial-promo">Trial-ending code (Creem)</Label>
        <Input
          id="email-trial-promo"
          value={promo}
          maxLength={60}
          onChange={(e) => setPromo(e.target.value)}
          placeholder="Code for 20% off the first year"
        />
        <p className="text-sm text-muted-foreground">
          Used in the email on the day a trial ends. Empty: the email repeats
          the early $7 price instead.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="email-tracking-end">Open and click tracking ends</Label>
        <Input
          id="email-tracking-end"
          type="date"
          value={trackingEnd}
          onChange={(e) => setTrackingEnd(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Opens and clicks are counted until this date, then dropped. Empty:
          never counted.
        </p>
      </div>
      <button
        type="button"
        className="nx-btn nx-btn-secondary"
        disabled={saving}
        onClick={save}
      >
        {saving ? "Saving" : "Save"}
      </button>
    </div>
  );
}
