"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { addStudentEmail } from "@/lib/needt3/hooks/account";
import { notify } from "@/lib/notifications";
import { hasStudentOffer } from "@/lib/students/offer";

/**
 * "Add a university email", for the desktop section and the phone page:
 * the draft, the send, and what to say after it.
 */
export function useStudentEmail(refetch: () => Promise<unknown>) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState(false);
  const going = useRef(false);

  // Read after mount: the server render has no sessionStorage.
  useEffect(() => setOffer(hasStudentOffer()), []);

  const send = useCallback(async () => {
    const email = draft.trim();
    if (!email || going.current) return;
    going.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await addStudentEmail(email);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft("");
      if (r.outcome === "verified") {
        setSentTo(null);
        await refetch();
        notify.success("Student price on", {
          description: "Checkout takes it off Pro monthly and yearly.",
        });
      } else {
        setSentTo(email);
      }
    } finally {
      going.current = false;
      setBusy(false);
    }
  }, [draft, refetch]);

  return { draft, setDraft, busy, sentTo, error, offer, send };
}
