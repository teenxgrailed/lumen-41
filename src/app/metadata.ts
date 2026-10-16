import type { Metadata, Viewport } from "next";

import { APP_DESCRIPTION, APP_NAME, APP_TITLE } from "@/lib/app-config";

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
  manifest: "/manifest.webmanifest",
  applicationName: APP_NAME,
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/brand/needt-icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/icons/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E10" },
  ],
};
