import type { Metadata } from "next";
import { MineroomsGame } from "./minerooms-game";

export const metadata: Metadata = {
  title: "Minerooms",
  description: "Minesweeper reborn, as a Backrooms-like place you walk through.",
  openGraph: {
    type: "website",
    url: "https://minerooms.mitori.me/",
    title: "Minerooms",
    description: "Minesweeper reborn, as a Backrooms-like place you walk through.",
    images: [{ url: "/ogp.png", width: 1200, height: 630, alt: "Minerooms" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Minerooms",
    description: "Minesweeper reborn, as a Backrooms-like place you walk through.",
    images: ["/ogp.png"],
  },
};

export default function Home() {
  return <MineroomsGame />;
}
