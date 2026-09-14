import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Minerooms",
  description: "Backrooms風の一人称マインスイーパー。",
  icons: { icon: { url: "/favicon.ico", type: "image/x-icon", sizes: "256x256" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
