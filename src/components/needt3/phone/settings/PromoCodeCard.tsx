"use client";

import { type FormEvent, useState } from "react";

import { useRedeemPromo } from "@/lib/needt3/hooks/promo";
import { notify } from "@/lib/notifications";

import { PkButton, PkField } from "../kit";
import { PsGroup } from "./parts";

/** "Have a code?" on the phone's Plan page: the desktop row, as a field and a button. */
export function PromoCodeCard() {
  const redeem = useRedeemPromo();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || code.trim() === "") return;
    setBusy(true);
    setError(null);
    const result = await redeem(code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCode("");
    notify.success(result.message);
  };

  return (
    <PsGroup
      title="Have a code?"
      hint={
        error ? (
          <span role="alert" style={{ color: "var(--destructive)" }}>
            {error}
          </span>
        ) : (
          "Adds trial days or a plan to your account."
        )
      }
    >
      <form className="ps-promo" onSubmit={submit} data-ps-promo="">
        <PkField
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          placeholder="Promo code"
          inputProps={{
            "aria-label": "Promo code",
            autoComplete: "off",
            autoCapitalize: "characters",
            spellCheck: false,
            maxLength: 64,
          }}
        />
        <PkButton
          kind="chip"
          type="submit"
          disabled={busy || code.trim() === ""}
        >
          Apply
        </PkButton>
      </form>
    </PsGroup>
  );
}
