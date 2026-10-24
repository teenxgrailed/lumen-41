- IMAP mailboxes connect only over an encrypted session: SSL/TLS on port 993 or
  STARTTLS on port 143. A server that offers neither is refused with a message
  that says so, and an existing IMAP mailbox whose server has no STARTTLS stops
  syncing instead of sending its password in plaintext.
