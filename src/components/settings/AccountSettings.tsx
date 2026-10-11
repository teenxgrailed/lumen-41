"use client";

import { useEffect, useState } from "react";

import { signIn, signOut } from "next-auth/react";
import Image from "next/image";

import {
  Loader2,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

import { useAppSession } from "@/components/providers/app-session-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { newDate } from "@/lib/date-utils";
import { notify } from "@/lib/notifications";
import { clearNeedtOfflineData } from "@/lib/pwa/offline-client";

import { SettingRow, SettingsCard, SettingsSection } from "./SettingsSection";

export function AccountSettings() {
  const { data: session, status } = useAppSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/account/lifecycle")
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load account lifecycle");
        return (await response.json()) as {
          providers?: string[];
          deletion?: { scheduledFor: string } | null;
        };
      })
      .then((data) => {
        // A payload without providers used to take the whole section down —
        // and this section holds account deletion and the data export.
        setProviders(Array.isArray(data.providers) ? data.providers : []);
        setScheduledFor(data.deletion?.scheduledFor ?? null);
      })
      .catch(() => notify.error("Could not load account deletion status"));
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await clearNeedtOfflineData();
    await signOut({ callbackUrl: "/auth/signin" });
  };

  const signOutEverywhere = async () => {
    setIsRevoking(true);
    try {
      const response = await fetch("/api/account/sessions/revoke", {
        method: "POST",
      });
      if (!response.ok) throw new Error("REVOKE_FAILED");
      await clearNeedtOfflineData();
      await signOut({ callbackUrl: "/auth/signin" });
    } catch {
      notify.error("Could not sign out of all devices");
      setIsRevoking(false);
    }
  };

  const scheduleDeletion = async () => {
    setIsDeleting(true);
    try {
      if (providers.includes("credentials")) {
        const reauth = await fetch("/api/account/reauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!reauth.ok) throw new Error("REAUTH_FAILED");
      }
      const response = await fetch("/api/account/deletion", { method: "POST" });
      const body = (await response.json()) as {
        scheduledFor?: string;
        code?: string;
      };
      if (!response.ok) {
        if (body.code === "RECENT_AUTHENTICATION_REQUIRED") {
          throw new Error("RECENT_AUTHENTICATION_REQUIRED");
        }
        throw new Error("DELETE_FAILED");
      }
      setScheduledFor(body.scheduledFor ?? null);
      setPassword("");
      notify.success(
        "Account deletion scheduled. You have seven days to cancel it."
      );
    } catch (error) {
      if (error instanceof Error && error.message === "REAUTH_FAILED") {
        notify.error("Password is incorrect");
      } else if (
        error instanceof Error &&
        error.message === "RECENT_AUTHENTICATION_REQUIRED"
      ) {
        notify.error("Sign in again before scheduling account deletion");
      } else {
        notify.error("Account deletion is temporarily unavailable");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDeletion = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch("/api/account/deletion", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to cancel deletion");
      setScheduledFor(null);
      notify.success("Account deletion canceled");
    } catch {
      notify.error("Could not cancel account deletion");
    } finally {
      setIsDeleting(false);
    }
  };

  const reauthenticateWithProvider = async (provider: string) => {
    try {
      const response = await fetch("/api/account/reauth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!response.ok) throw new Error("OAuth reauthentication unavailable");
      await signIn(provider, {
        callbackUrl: "/api/account/reauth/oauth/complete",
      });
    } catch {
      notify.error("Could not start provider sign-in");
    }
  };

  const oauthProviders = providers.filter(
    (provider) => provider !== "credentials"
  );

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Profile"
        description="The identity used for your personal Needt workspace."
      >
        <SettingRow
          label="Signed-in account"
          description="Calendar connections are managed separately in Calendars."
        >
          {status === "loading" ? (
            <SettingsCard
              className="flex min-h-[64px] items-center gap-3 px-4"
              aria-label="Loading profile"
            >
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </SettingsCard>
          ) : (
            <SettingsCard className="flex min-h-[64px] items-center gap-3 px-4">
              {session?.user?.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-control)]">
                  <UserRound className="h-4 w-4 text-[var(--text-secondary)]" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[var(--text-primary)]">
                  {session?.user?.name || "Planner account"}
                </p>
                <p className="truncate text-[13px] text-[var(--text-secondary)]">
                  {session?.user?.email || "Local planner account"}
                </p>
              </div>
            </SettingsCard>
          )}
        </SettingRow>
        <SettingRow
          label="Session"
          description="Sign out of Needt on this device."
        >
          <Button
            type="button"
            variant="destructive"
            size="lg"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="min-h-11 w-full justify-center sm:w-auto"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Logging out..." : "Log out"}
          </Button>
        </SettingRow>
        <SettingRow
          label="All devices"
          description="Sign out everywhere, including this device. Other devices are signed out within a minute. The connector token stops working, so external tools must be reconnected with a new one."
        >
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={signOutEverywhere}
            disabled={isRevoking || isLoggingOut}
            className="min-h-11 w-full justify-center sm:w-auto"
          >
            {isRevoking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MonitorSmartphone className="h-4 w-4" />
            )}
            Sign out of all devices
          </Button>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Delete account"
        description="Deletion removes your personal data after a seven-day recovery window. Shared workspace records become anonymous tombstones where teammates still depend on them."
      >
        {scheduledFor ? (
          <SettingRow
            label="Deletion scheduled"
            description={`Your account will be permanently deleted after ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(newDate(scheduledFor))}.`}
          >
            <Button
              type="button"
              variant="outline"
              onClick={cancelDeletion}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancel deletion
            </Button>
          </SettingRow>
        ) : (
          <>
            {providers.includes("credentials") && (
              <SettingRow
                label="Confirm with your password"
                description="Your password is checked again immediately before deletion is scheduled."
              >
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Current password"
                />
              </SettingRow>
            )}
            {oauthProviders.length > 0 && (
              <SettingRow
                label="Confirm with your provider"
                description="OAuth-only accounts must sign in again before deletion can be scheduled."
              >
                <div className="flex flex-wrap gap-2">
                  {oauthProviders.map((provider) => (
                    <Button
                      key={provider}
                      type="button"
                      variant="outline"
                      onClick={() => reauthenticateWithProvider(provider)}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Sign in with{" "}
                      {provider === "azure-ad" ? "Microsoft" : "Google"}
                    </Button>
                  ))}
                </div>
              </SettingRow>
            )}
            <SettingRow
              label="Seven-day recovery window"
              description="You can cancel from this screen before the deadline. After that, deletion is irreversible."
            >
              <Button
                type="button"
                variant="destructive"
                onClick={scheduleDeletion}
                disabled={
                  isDeleting ||
                  (providers.includes("credentials") && password.length === 0)
                }
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Schedule account deletion
              </Button>
            </SettingRow>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
