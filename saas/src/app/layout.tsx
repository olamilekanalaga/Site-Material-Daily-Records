import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  applicationName: "DJ Civils",
  title: "DJ Civils | Delivery Control",
  description:
    "DJ Civils construction delivery log. Record deliveries, save photos and inspect clear site records.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/dj-civils-v2-32.png",
        type: "image/png",
        sizes: "32x32",
      },
      { url: "/icon.svg?v=2", type: "image/svg+xml", sizes: "any" },
    ],
    apple: [
      {
        url: "/icons/dj-civils-v2-180.png",
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "DJ Civils",
    statusBarStyle: "default",
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
