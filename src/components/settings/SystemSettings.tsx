"use client";

import { useEffect, useState } from "react";

import AccessDeniedMessage from "@/components/auth/AccessDeniedMessage";
import AdminOnly from "@/components/auth/AdminOnly";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NeedtPicker } from "@/components/ui/needt-picker";

import { logger } from "@/lib/logger";

import { useSettingsStore } from "@/store/settings";

import { SecretInput } from "./SecretInput";
import { SettingRow, SettingsSection } from "./SettingsSection";
import {
  SIGN_IN_PROVIDER_BLOCKS,
  SignInProviderSettings,
} from "./SignInProviderSettings";
import { saveSystemSettings } from "./system-settings-save";

const LOG_SOURCE = "SystemSettings";

/**
 * System settings component
 * Allows admins to configure system-wide settings
 * Only accessible by admin users
 */
export function SystemSettings() {
  const { system, updateSystemSettings } = useSettingsStore();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    // Load settings from API
    fetch("/api/system-settings")
      .then((res) => res.json())
      .then((data) => {
        updateSystemSettings({
          googleClientId: data.googleClientId,
          googleClientSecret: data.googleClientSecret,
          outlookClientId: data.outlookClientId,
          outlookClientSecret: data.outlookClientSecret,
          outlookTenantId: data.outlookTenantId,
          ...Object.fromEntries(
            SIGN_IN_PROVIDER_BLOCKS.flatMap((block) =>
              block.fields.map((field) => [field.key, data[field.key]])
            )
          ),
          logLevel: data.logLevel,
          disableHomepage: data.disableHomepage,
          requireEmailVerificationBeforeAccess:
            data.requireEmailVerificationBeforeAccess,
          resendApiKey: data.resendApiKey,
        });
      })
      .catch((error) => {
        logger.error(
          "Failed to load system settings",
          { error: error instanceof Error ? error.message : "Unknown error" },
          LOG_SOURCE
        );
      });
  }, [updateSystemSettings]);

  const handleUpdate = (updates: Partial<typeof system>) =>
    saveSystemSettings(updates, updateSystemSettings);

  return (
    <AdminOnly
      fallback={
        <AccessDeniedMessage message="You do not have permission to access system settings." />
      }
    >
      <SettingsSection
        title="System Settings"
        description="Configure system-wide settings for the application."
      >
        <SettingRow
          label="Google Calendar Integration"
          description={
            <div className="space-y-2">
              <div>
                Configure Google OAuth credentials for calendar integration.
              </div>
              <div>
                To get these credentials:
                <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
                  <li>
                    Go to the{" "}
                    <a
                      href="https://console.cloud.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Google Cloud Console
                    </a>
                  </li>
                  <li>Create a new project or select an existing one</li>
                  <li>Enable the Google Calendar API</li>
                  <li>Go to Credentials</li>
                  <li>Create OAuth 2.0 Client ID credentials</li>
                  <li>
                    Add both authorized redirect URIs (one for sign-in, one for
                    connecting a calendar):
                    <ul className="ml-4 mt-1 list-disc">
                      <li>{origin}/api/auth/callback/google</li>
                      <li>{origin}/api/calendar/google</li>
                    </ul>
                    <span className="mt-1 block text-xs">
                      These use the URL shown in your browser. The server sends
                      Google back to the host in <code>NEXTAUTH_URL</code>, so
                      make sure <code>NEXTAUTH_URL</code> matches this address
                      (otherwise Google returns{" "}
                      <code>redirect_uri_mismatch</code>). Google also rejects
                      bare private IPs (e.g. <code>192.168.x.x</code>) and{" "}
                      <code>.local</code> hostnames - use <code>localhost</code>{" "}
                      for local development or a public domain.
                    </span>
                  </li>
                  <li>Copy the Client ID and Client Secret</li>
                </ol>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Google Client ID</Label>
              <Input
                type="text"
                value={system.googleClientId || ""}
                onChange={(e) =>
                  handleUpdate({ googleClientId: e.target.value })
                }
                placeholder="your-client-id.apps.googleusercontent.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Google Client Secret</Label>
              <SecretInput
                aria-label="Google Client Secret"
                stored={system.googleClientSecret || ""}
                onCommit={(value) =>
                  handleUpdate({ googleClientSecret: value })
                }
                placeholder="Enter your client secret"
              />
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label="Outlook Calendar Integration"
          description={
            <div className="space-y-2">
              <div>
                Configure Microsoft Azure AD credentials for Outlook calendar
                integration.
              </div>
              <div>
                To get these credentials:
                <ol className="ml-4 mt-1 list-decimal space-y-1 text-muted-foreground">
                  <li>
                    Go to the{" "}
                    <a
                      href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Azure Portal
                    </a>
                  </li>
                  <li>Register a new application or select an existing one</li>
                  <li>Add Microsoft Graph Calendar permissions</li>
                  <li>Go to Authentication</li>
                  <li>Add platform and configure OAuth settings</li>
                  <li>
                    Add redirect URI: {origin}
                    /api/calendar/outlook
                  </li>
                  <li>
                    Copy the Application (client) ID and create a client secret
                  </li>
                </ol>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Outlook Client ID</Label>
              <Input
                type="text"
                value={system.outlookClientId || ""}
                onChange={(e) =>
                  handleUpdate({ outlookClientId: e.target.value })
                }
                placeholder="your-client-id"
              />
            </div>

            <div className="space-y-2">
              <Label>Outlook Client Secret</Label>
              <SecretInput
                aria-label="Outlook Client Secret"
                stored={system.outlookClientSecret || ""}
                onCommit={(value) =>
                  handleUpdate({ outlookClientSecret: value })
                }
                placeholder="Enter your client secret"
              />
            </div>

            <div className="space-y-2">
              <Label>Tenant ID (Optional)</Label>
              <Input
                type="text"
                value={system.outlookTenantId || ""}
                onChange={(e) =>
                  handleUpdate({ outlookTenantId: e.target.value })
                }
                placeholder="common"
              />
              <p className="text-sm text-muted-foreground">
                Leave empty to allow any Microsoft account (recommended)
              </p>
            </div>
          </div>
        </SettingRow>

        <SignInProviderSettings
          system={system}
          origin={origin}
          onUpdate={handleUpdate}
        />

        <SettingRow label="Homepage" description="Configure homepage behavior">
          <div className="space-y-2">
            <Label>Disable Homepage</Label>
            <NeedtPicker
              ariaLabel="Disable homepage"
              value={system.disableHomepage ? "true" : "false"}
              onValueChange={(value) =>
                handleUpdate({ disableHomepage: value === "true" })
              }
              options={[
                { value: "false", label: "Show Homepage" },
                { value: "true", label: "Redirect to Login/Calendar" },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              When enabled, the homepage (/) will redirect to the login page for
              unauthenticated users or to the calendar for authenticated users.
            </p>
          </div>
        </SettingRow>

        <SettingRow
          label="Email verification access"
          description="Optionally require a confirmed email before entering the product."
        >
          <div className="space-y-2">
            <Label>Require confirmation before access</Label>
            <NeedtPicker
              ariaLabel="Require email verification before access"
              value={
                system.requireEmailVerificationBeforeAccess ? "true" : "false"
              }
              onValueChange={(value) =>
                handleUpdate({
                  requireEmailVerificationBeforeAccess: value === "true",
                })
              }
              options={[
                { value: "false", label: "Allow Free access" },
                { value: "true", label: "Require confirmation" },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              Off by default. Unconfirmed accounts otherwise enter on Free and
              start Pro only after confirming their email.
            </p>
          </div>
        </SettingRow>

        <SettingRow
          label="Email Service"
          description="Configure email service settings"
        >
          <div className="space-y-2">
            <Label>Resend API Key</Label>
            <SecretInput
              aria-label="Resend API Key"
              stored={system.resendApiKey || ""}
              onCommit={(value) => handleUpdate({ resendApiKey: value })}
              placeholder="Enter your Resend API key"
            />
            <p className="text-sm text-muted-foreground">
              API key for the Resend email service. Required for sending emails.
            </p>
          </div>
        </SettingRow>
      </SettingsSection>
    </AdminOnly>
  );
}
