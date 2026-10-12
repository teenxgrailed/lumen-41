/**
 * Which hosts hold files Notion itself stores. Only these are downloaded
 * into page assets (and only these may answer a redirect on the way); any
 * other file address stays a link.
 */

/** Domains Notion serves its own files from, matched exactly or as a suffix. */
export const NOTION_FILE_DOMAINS: readonly string[] = [
  "notion.so",
  "notion-static.com",
  "notionusercontent.com",
];

/**
 * Notion's own S3 buckets, as the virtual-hosted names Notion puts in file
 * URLs (a file object's `file.url`, signed with X-Amz-Signature and valid for
 * an hour; see https://developers.notion.com/reference/file-object).
 * `prod-files-secure` is the production bucket in us-west-2; the second is
 * the legacy bucket older workspaces still reference. Any other *.amazonaws.com
 * host is somebody else's bucket and is refused.
 */
export const NOTION_S3_BUCKET_HOSTS: readonly string[] = [
  "prod-files-secure.s3.us-west-2.amazonaws.com",
  "secure.notion-static.com.s3.us-west-2.amazonaws.com",
];

/** True for a Notion file host: exact match, or a subdomain of one. */
export function isNotionHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (NOTION_S3_BUCKET_HOSTS.includes(host)) return true;
  return NOTION_FILE_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

/**
 * True for an https address on a Notion file host. A bucket address must
 * also carry a signature: an unsigned one is not a file Notion handed out.
 */
export function isNotionHostedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    if (!isNotionHost(url.hostname)) return false;
    return NOTION_S3_BUCKET_HOSTS.includes(url.hostname.toLowerCase())
      ? url.searchParams.has("X-Amz-Signature")
      : true;
  } catch {
    return false;
  }
}
