/**
 * Renders every email template to HTML and text files for review.
 * Usage: npx tsx scripts/render-emails.ts [outDir]   (default /tmp/needt-emails)
 * Nothing is sent and no browser is opened; open the files yourself.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { sampleEmails } from "../src/lib/email/templates/catalog";

const outDir = process.argv[2] ?? "/tmp/needt-emails";
mkdirSync(outDir, { recursive: true });
const emails = Object.entries(sampleEmails());
for (const [name, mail] of emails) {
  writeFileSync(join(outDir, `${name}.html`), mail.html);
  writeFileSync(join(outDir, `${name}.txt`), `${mail.subject}\n\n${mail.text}`);
}
process.stdout.write(`Rendered ${emails.length} emails to ${outDir}\n`);
