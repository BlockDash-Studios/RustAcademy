import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { NotificationCenterProvider } from "@/components/NotificationCenterProvider";
import { ErrorReportingShell } from "@/components/ErrorReportingShell";
import { PWAHandler } from "@/components/PWAHandler";
import { OnlineStatusProvider } from "@/lib/onlineStatus";
import { OnlineStatusBadge } from "@/components/OnlineStatusBadge";
import { BRANDING } from "@/lib/branding";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  BRANDING.defaultSiteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: BRANDING.productName,
    template: `%s | ${BRANDING.productName}`,
  },
  description: BRANDING.description,
  applicationName: BRANDING.productName,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRANDING.productName,
  },
  keywords: BRANDING.keywords,
  authors: [{ name: BRANDING.companyName }],
  creator: BRANDING.companyName,
  openGraph: {
    type: "website",
    siteName: BRANDING.productName,
    title: `${BRANDING.productName} — ${BRANDING.tagline}`,
    description: BRANDING.description,
    url: siteUrl,
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: BRANDING.ogImageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: `@${BRANDING.twitterHandle}`,
    title: `${BRANDING.productName} — ${BRANDING.tagline}`,
    description: BRANDING.description,
    images: ["/api/og"],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased">
        <OnlineStatusProvider>
          <ErrorReportingShell>
            <NotificationCenterProvider>
              <PWAHandler />
              <OnlineStatusBadge />
              <Header />
              <main className="min-h-screen pt-16">{children}</main>
            </NotificationCenterProvider>
          </ErrorReportingShell>
        </OnlineStatusProvider>
      </body>
    </html>
  );
}
