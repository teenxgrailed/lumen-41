"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { endNeedtSession } from "@/lib/auth/client-sign-out";

/**
 * Ends the Needt session as soon as it opens and then follows `to`, which the
 * server has already checked. If signing out fails the person is told and can
 * try again; they are not sent on as if it had worked.
 */
export function SignOutAndReturn({ to }: { to: string }) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setFailed(false);
    endNeedtSession().then(
      () => {
        if (current) window.location.replace(to);
      },
      () => {
        if (current) setFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [to, attempt]);

  if (failed) {
    return (
      <>
        <h1 className="text-[15px] font-semibold">Could not sign you out</h1>
        <p className="mt-2 text-muted-foreground">
          Check your connection and try again.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </Button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="text-[15px] font-semibold">Signing you out</h1>
      <p className="mt-2 text-muted-foreground">One moment.</p>
    </>
  );
}
