import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://minerooms.mitori.me"),
  title: "Minerooms",
  description: "Minesweeper reborn, as a Backrooms-like place you walk through.",
  icons: { icon: { url: "/favicon.ico", type: "image/x-icon", sizes: "256x256" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
