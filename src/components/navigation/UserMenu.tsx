"use client";

import { useState } from "react";

import Link from "next/link";

import {
  Activity,
  Building2,
  Check,
  CircleDot,
  HelpCircle,
  LogOut,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Sun,
  Sunset,
} from "lucide-react";

import { useTheme } from "@/components/providers/ThemeProvider";
import { useWorkspace } from "@/components/providers/WorkspaceProvider";
import { useAppSession } from "@/components/providers/app-session-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { signOutOfNeedt } from "@/lib/auth/client-sign-out";
import { notify } from "@/lib/notifications";

export function UserMenu() {
  const { data: session, status } = useAppSession();
  const { theme, setTheme } = useTheme();
  const {
    activeWorkspace,
    isLoading: isLoadingWorkspaces,
    selectWorkspace,
    workspaces,
  } = useWorkspace();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);

  // Keep the profile control's footprint while NextAuth resolves. Rendering a
  // sign-in CTA here briefly is both visually jarring and incorrect for an
  // authenticated route during client hydration.
  if (status === "loading") {
    return <Skeleton aria-hidden="true" className="h-8 w-8 rounded-full" />;
  }

  if (status === "unauthenticated") {
    return (
      <Link href="/auth/signin">
        <Button variant="outline" size="sm">
          Sign In
        </Button>
      </Link>
    );
  }

  if (!session) {
    return <Skeleton aria-hidden="true" className="h-8 w-8 rounded-full" />;
  }

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOutOfNeedt();
  };

  const handleWorkspaceSwitch = async (workspaceId: string) => {
    try {
      setIsSwitchingWorkspace(true);
      await selectWorkspace(workspaceId);
      notify.success("Workspace switched");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "Could not switch workspace."
      );
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  // Get user initials for avatar fallback
  const getInitials = () => {
    if (!session.user?.name) return "U";
    return session.user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-1.5"
          aria-label="Open profile menu"
          title="Profile"
        >
          <Avatar className="h-6 w-6 flex-none">
            <AvatarImage
              src={session.user?.image || ""}
              alt={session.user?.name || "User"}
            />
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate text-left text-[13px] text-[var(--text-primary)]">
            {session.user?.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72 border-[var(--border-control)] bg-[var(--menu-bg)] text-[var(--text-primary)]"
        align="end"
        forceMount
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {session.user?.name}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {session.user?.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)]">
          Workspace
        </DropdownMenuLabel>
        {isLoadingWorkspaces ? (
          <DropdownMenuItem disabled>Loading workspaces…</DropdownMenuItem>
        ) : (
          workspaces.map((membership) => {
            const isActive =
              membership.workspace.id === activeWorkspace?.workspace.id;
            return (
              <DropdownMenuItem
                key={membership.workspace.id}
                className="cursor-pointer"
                disabled={isSwitchingWorkspace || isActive}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleWorkspaceSwitch(membership.workspace.id);
                }}
              >
                <Building2 className="mr-2 h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">
                  {membership.workspace.name}
                </span>
                {isActive && (
                  <Check className="h-4 w-4" aria-label="Active workspace" />
                )}
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        {session.user?.role === "admin" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-[var(--text-secondary)]">
              Admin
            </DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/admin/operations" className="cursor-pointer">
                <Activity className="mr-2 h-4 w-4" />
                <span>Operations</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/system" className="cursor-pointer">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                <span>System settings</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/teenxgrails/needt/issues"
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer"
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            <span>Help</span>
          </a>
        </DropdownMenuItem>
        <div className="px-2 py-2">
          <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
            Theme
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: "paper", label: "Paper", icon: Sun },
              { id: "warm", label: "Warm", icon: Sunset },
              { id: "dim", label: "Dim", icon: CircleDot },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTheme(item.id as typeof theme)}
                  className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs ${
                    theme === item.id
                      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-canvas)]"
                      : "border-[var(--border-control)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
