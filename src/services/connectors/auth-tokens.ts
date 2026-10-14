import crypto from "crypto";

/** A personal connector token: shown once, stored only as its sha256. */
export function generateConnectorToken() {
  return `needt_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashConnectorToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
