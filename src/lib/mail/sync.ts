import { MailProvider } from "@prisma/client";

import {
  getMailAccountForSync,
  persistMailMessages,
  setMailAccountError,
} from "@/lib/mail-db";
import { syncGmail, syncImap, syncOutlookMail } from "@/lib/mail/providers";

export async function syncMailAccount(accountId: string): Promise<void> {
  const account = await getMailAccountForSync(accountId);
  if (!account || account.status === "DISCONNECTED") return;
  try {
    const result =
      account.provider === MailProvider.GMAIL
        ? await syncGmail(account)
        : account.provider === MailProvider.OUTLOOK
          ? await syncOutlookMail(account)
          : await syncImap(account);
    await persistMailMessages({
      accountId,
      ...result,
    });
  } catch (error) {
    await setMailAccountError(accountId);
    throw error;
  }
}
