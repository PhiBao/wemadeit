import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "../lib/wagmi";
import SiteHeader from "../components/SiteHeader";

export const metadata: Metadata = {
  title: "WeMadeIt — money only moves if the group means it",
  description:
    "Conditional group pots on Monad. Commit your share; funds release only when the group hits its rule. No tilt, no charge.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "WeMadeIt" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#065f46",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
