"use client";

import { type FormEvent, useState } from "react";

import { useRedeemPromo } from "@/lib/needt3/hooks/promo";
import { notify } from "@/lib/notifications";

import { SBtn, SGroup, SRow } from "./kit";

/**
 * "Have a code?" in Settings -> Plan. One field and one button: the server
 * decides what the code is worth, and says why when it will not take it.
 */
export function PromoCodeRow() {
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
    <SGroup title="Have a code?">
      <SRow
        title="Promo code"
        desc={
          error ? (
            <span role="alert" style={{ color: "var(--destructive)" }}>
              {error}
            </span>
          ) : (
            "Adds trial days or a plan to your account."
          )
        }
      >
        <form className="settings-promo" onSubmit={submit}>
          <input
            className="nt-input"
            value={code}
            placeholder="Code"
            aria-label="Promo code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={64}
            data-settings-promo-input=""
            onChange={(e) => {
              setCode(e.target.value);
              if (error) setError(null);
            }}
          />
          <SBtn
            disabled={busy || code.trim() === ""}
            onClick={() => void submit()}
          >
            Apply
          </SBtn>
        </form>
      </SRow>
    </SGroup>
  );
}
