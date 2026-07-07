import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VerbDeck",
  description:
    "Oral mastery of one Japanese verb at a time. Listen, speak, repeat.",
  manifest: "/manifest.json",
  applicationName: "VerbDeck",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VerbDeck",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "256x256" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2b2926",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div id="app-root">{children}</div>
      </body>
    </html>
  );
}
