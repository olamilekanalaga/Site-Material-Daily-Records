import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DJ Civils | Delivery Control",
  description:
    "DJ Civils construction delivery log. Record deliveries, save photos and inspect clear site records.",
  manifest: "/manifest.webmanifest",
  applicationName: "DJ Civils",
  appleWebApp: { capable: true, title: "DJ Civils" },
  icons: {
    icon: "/favicon.ico",
    apple: {
      url: "/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f8f8",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
