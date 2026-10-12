"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { SystemSettings } from "@/types/settings";

import { SecretInput } from "./SecretInput";
import { SettingRow } from "./SettingsSection";

type Field = {
  key: keyof SystemSettings;
  label: string;
  placeholder?: string;
  secret?: boolean;
};

interface ProviderBlock {
  id: string;
  name: string;
  console: { href: string; label: string };
  fields: Field[];
  note?: string;
}

/**
 * The sign-in providers beyond Google and Microsoft (those two share their
 * credentials with the calendar connections above). A provider appears on the
 * sign-in screen once all of its fields are filled; each one's console steps
 * are in docs/operations/sign-in-providers.md.
 */
export const SIGN_IN_PROVIDER_BLOCKS: readonly ProviderBlock[] = [
  {
    id: "apple",
    name: "Apple",
    console: {
      href: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
      label: "Apple Developer: Identifiers",
    },
    fields: [
      {
        key: "appleClientId",
        label: "Services ID",
        placeholder: "app.needt.signin",
      },
      { key: "appleTeamId", label: "Team ID", placeholder: "ABCDE12345" },
      { key: "appleKeyId", label: "Key ID", placeholder: "FGHIJ67890" },
      {
        key: "applePrivateKey",
        label: "Private key (.p8 contents)",
        placeholder: "Paste the whole .p8 file",
        secret: true,
      },
    ],
    note: "The client secret Apple wants is signed from this key automatically and renewed daily.",
  },
  {
    id: "github",
    name: "GitHub",
    console: {
      href: "https://github.com/settings/developers",
      label: "GitHub: OAuth Apps",
    },
    fields: [
      { key: "githubClientId", label: "Client ID" },
      { key: "githubClientSecret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "openai",
    name: "Sign in with ChatGPT",
    console: {
      href: "https://developers.openai.com/siwc/request-client-id",
      label: "OpenAI: request a client ID",
    },
    fields: [
      {
        key: "openaiSiwcClientId",
        label: "Client ID",
        placeholder: "oaiapp_…",
      },
      {
        key: "openaiSiwcClientSecret",
        label: "Client secret (confidential clients only)",
        secret: true,
      },
    ],
    note: "A public client has no secret; leave it empty.",
  },
  {
    id: "discord",
    name: "Discord",
    console: {
      href: "https://discord.com/developers/applications",
      label: "Discord Developer Portal",
    },
    fields: [
      { key: "discordClientId", label: "Client ID" },
      { key: "discordClientSecret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "twitter",
    name: "X",
    console: {
      href: "https://developer.x.com/en/portal/dashboard",
      label: "X Developer Portal",
    },
    fields: [
      { key: "twitterClientId", label: "OAuth 2.0 Client ID" },
      {
        key: "twitterClientSecret",
        label: "OAuth 2.0 Client secret",
        secret: true,
      },
    ],
    note: "X shares no verified email, so an X sign-in always makes its own account and never joins an existing one.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    console: {
      href: "https://www.linkedin.com/developers/apps",
      label: "LinkedIn Developers",
    },
    fields: [
      { key: "linkedinClientId", label: "Client ID" },
      { key: "linkedinClientSecret", label: "Client secret", secret: true },
    ],
  },
];

export function SignInProviderSettings({
  system,
  origin,
  onUpdate,
}: {
  system: SystemSettings;
  origin: string;
  onUpdate: (updates: Partial<SystemSettings>) => Promise<boolean> | void;
}) {
  return (
    <SettingRow
      label="Sign-in providers"
      description={
        <span>
          Each provider shows on the sign-in screen once every field below is
          filled. Changes reach sign-in within ten minutes. Values set here win
          over the environment variables.
        </span>
      }
    >
      <div className="space-y-6">
        {SIGN_IN_PROVIDER_BLOCKS.map((block) => (
          <section key={block.id} aria-label={block.name} className="space-y-3">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">{block.name}</h4>
              <p className="text-sm text-muted-foreground">
                <a
                  href={block.console.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {block.console.label}
                </a>
                {" · Callback URL: "}
                <code>
                  {origin}/api/auth/callback/{block.id}
                </code>
              </p>
              {block.note ? (
                <p className="text-sm text-muted-foreground">{block.note}</p>
              ) : null}
            </div>
            {block.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                {field.secret ? (
                  <SecretInput
                    aria-label={`${block.name} ${field.label}`}
                    stored={(system[field.key] as string | undefined) || ""}
                    onCommit={(value) => onUpdate({ [field.key]: value })}
                    placeholder={field.placeholder ?? "Enter the secret"}
                  />
                ) : (
                  <Input
                    type="text"
                    aria-label={`${block.name} ${field.label}`}
                    value={(system[field.key] as string | undefined) || ""}
                    onChange={(e) => onUpdate({ [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </SettingRow>
  );
}
