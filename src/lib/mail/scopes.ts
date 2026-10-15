// Mail is read-only in Needt: read mail and create tasks from it. No scope
// here may allow sending, composing or changing the remote mailbox. Accounts
// connected earlier with wider scopes keep working; we simply never use them.
export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

export const OUTLOOK_MAIL_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.Read",
] as const;
