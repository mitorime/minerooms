import type { Metadata } from "next";
import { MineroomsGame } from "./minerooms-game";

export const metadata: Metadata = {
  title: "MINEROOMS",
  description: "壁の向こうを選び、終わりのない黄色い部屋から脱出する一人称探索ゲーム。",
};

export default function Home() {
  return <MineroomsGame />;
}
