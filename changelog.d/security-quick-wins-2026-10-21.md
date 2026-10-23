- Security hardening: files on a shared page link no longer run script (SVG
  and other non-picture files download, and every response is sandboxed),
  uploads keep their type only for PNG, JPEG, GIF, WebP and AVIF, task titles
  and names are escaped in reminder and password-reset emails, and password
  reset links are stored hashed. A reset link requested before this update
  stops working; request a new one.
