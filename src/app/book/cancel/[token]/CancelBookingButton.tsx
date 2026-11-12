"use client";

import { useState } from "react";

import { LuCheck, LuLoaderCircle } from "react-icons/lu";

export function CancelBookingButton({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function cancel() {
    setStatus("loading");
    const response = await fetch(
      `/api/public/booking/cancel/${encodeURIComponent(token)}`,
      { method: "POST" }
    );
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error ?? "Could not cancel this booking");
      setStatus("error");
      return;
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <p className="pub-done">
        <LuCheck size={16} aria-hidden /> Booking canceled.
      </p>
    );
  }
  return (
    <div>
      <button
        type="button"
        className="nx-btn nx-btn-danger pub-block"
        disabled={status === "loading"}
        onClick={() => void cancel()}
      >
        {status === "loading" && (
          <LuLoaderCircle size={16} className="pub-spin" aria-hidden />
        )}
        Cancel booking
      </button>
      {status === "error" && (
        <p className="pub-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
