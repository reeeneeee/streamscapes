import type { Metadata, Viewport } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#0d0d0d",
};

export const metadata: Metadata = {
  title: "streamscapes",
  description: "Listen to the world around you",
  appleWebApp: {
    capable: true,
    title: "streamscapes",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${dmSans.variable} antialiased`}>
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
