import type { Metadata, Viewport } from "next";

import { APP_DESCRIPTION, APP_NAME, APP_TITLE } from "@/lib/app-config";
import { PHONE_MEDIA_QUERY } from "@/lib/needt3/phone-ui";

export const metadata: Metadata = {
  // No template: inner pages already set "Page | Needt" themselves.
  title: { absolute: APP_TITLE },
  description: APP_DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: {
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
  // The manifest, the apple-mobile-web-app-* tags and the touch icon are not
  // here: Next 15 streams `metadata` for browsers (a hidden <div> in <body>,
  // resolved after the shell), and an Add to Home Screen that reads the page
  // before it lands makes a plain web clip named after <title> ("Home"),
  // which shows Safari's chrome once it leaves the start page. The root
  // layout writes INSTALL_HEAD into <head> itself, on every route.
  icons: {
    icon: [
      { url: "/brand/needt-icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
  },
};

/** What iOS and Android read when the page is added to the Home Screen.
 * The root layout renders it straight into <head>; it is never streamed. */
export const INSTALL_HEAD = {
  manifest: "/manifest.webmanifest",
  meta: [
    { name: "application-name", content: APP_NAME },
    // the name on the Add to Home Screen sheet; without it iOS uses <title>
    { name: "apple-mobile-web-app-title", content: APP_NAME },
    // iOS reads the status-bar style only from an app that declares
    // apple-mobile-web-app-capable; without it the bar is opaque
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "mobile-web-app-capable", content: "yes" },
    {
      name: "apple-mobile-web-app-status-bar-style",
      content: "black-translucent",
    },
  ],
  appleTouchIcon: {
    href: "/icons/apple-touch-icon.png",
    sizes: "180x180",
    type: "image/png",
  },
} as const;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    // the phone's ground (look-boot.ts PHONE_GROUND) first: on a phone the bar
    // and the page behind the screen are the screen's own colour
    {
      media: `(prefers-color-scheme: light) and ${PHONE_MEDIA_QUERY}`,
      color: "#f6f6f3",
    },
    {
      media: `(prefers-color-scheme: dark) and ${PHONE_MEDIA_QUERY}`,
      color: "#141416",
    },
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E10" },
  ],
};
