import { SettingRow, SettingsSection } from "./SettingsSection";

const DOCUMENTS = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Notice" },
  { href: "/subprocessors", label: "Subprocessors" },
] as const;

/** Links to the published legal documents, next to export and deletion. */
export function LegalSettings() {
  return (
    <SettingsSection title="Legal">
      <SettingRow label="Documents">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px]">
          {DOCUMENTS.map((doc) => (
            <li key={doc.href}>
              <a
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      </SettingRow>
    </SettingsSection>
  );
}
