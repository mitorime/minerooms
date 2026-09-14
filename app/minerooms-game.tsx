"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Cell, chooseWarp, countNearbyPits, createWorld, indexAt, restoreOpenedWalls, wrap, World } from "./game-core";
import { createWebGLRenderer } from "./webgl-renderer";

const FOV = Math.PI / 3;
const RAYS = 240;
const SPEED = 2.15;
const BASE_MOUSE_YAW_SENSITIVITY = .0022;
const BASE_MOUSE_PITCH_SENSITIVITY = .0018;
const MIN_MOUSE_SENSITIVITY = 25;
const MAX_MOUSE_SENSITIVITY = 400;
const BREAK_RADIUS = 3;
const MARK_RADIUS = BREAK_RADIUS * 2;
// Horizontal cells remain 1 × 1; only the room height is stretched.
const CEILING_HEIGHT = 2.7;
const DEFAULT_PLAYER_HEIGHT = 1.45;
const MIN_PLAYER_HEIGHT = 1.2;
const MAX_PLAYER_HEIGHT = 1.8;
const MIN_PITCH = -.7;
const MAX_PITCH = Math.PI / 2 - .08;
const DEFAULT_RENDER_DISTANCE = 14;
const MIN_RENDER_DISTANCE = 8;
const MAX_RENDER_DISTANCE = 34;
const FOG_START = 9;
const MIN_VISIBILITY = .12;
const FALL_DROP_DELAY = .1;
const FALL_RISE_DURATION = .1;
const FALL_MOTION_DURATION = .8;
const FALL_DESCENT_DURATION = FALL_MOTION_DURATION - FALL_RISE_DURATION;
const FALL_DROP_DURATION = FALL_DROP_DELAY + FALL_MOTION_DURATION;
const FALL_FADE_START = .7;
const FALL_REVEAL_START = 2.2;
const FALL_REVEAL_FADE_DURATION = .6;
const FALL_WAKE_FLOOR_DURATION = 1.8;
const FALL_WAKE_RISE_DURATION = 1.5;
const FALL_REVEAL_DURATION = FALL_WAKE_FLOOR_DURATION + FALL_WAKE_RISE_DURATION;
const FALL_TOTAL_DURATION = FALL_REVEAL_START + FALL_REVEAL_DURATION;
const SETTINGS_STORAGE_KEY = "minerooms.settings.v2";
const LANGUAGE_STORAGE_KEY = "minerooms.language.v1";
const AUDIO_URLS = [
  "/sounds/crash-1.mp3", "/sounds/crash-2.mp3", "/sounds/crash-near.mp3",
  "/sounds/exit.mp3", "/sounds/fall-1.mp3", "/sounds/fall-2.mp3",
  "/sounds/fluorescent-buzz.mp3", "/sounds/marking.mp3", "/sounds/mine-broke.mp3",
  "/sounds/running.mp3", "/sounds/walking.mp3",
] as const;
type Player = { x: number; y: number; angle: number; pitch: number; bobPhase: number; bobAmount: number };
type Stick = { x: number; y: number };
type ExitOpening = { x: number; y: number } | null;
type FallTransition = { startedAt: number; pitX: number; pitY: number; warped: boolean; inputLocked: boolean; shakeSeed: number; wakeSoundPlayed: boolean; standSoundPlayed: boolean } | null;
type BreakKey = "KeyR" | "Space" | "Enter";
type DashKey = "Shift" | "KeyQ";
type MarkKey = "KeyF" | "KeyE" | "Tab";
type RenderMode = "dreamy" | "realistic";
type UiLanguage = "en" | "ja";
type LanguagePreference = "system" | UiLanguage;
const UI_COPY = {
  en: {
    enter: "Enter >", howToPlay: "How To Play", settings: "Settings", english: "English (EN)", japanese: "Japanese (JA)", credits: "Credits", licenses: "Licenses", github: "GitHub Repository ↗︎",
    cancel: "Cancel", reset: "Reset", apply: "Apply", config: "Config", breakKey: "Break wall key (for PC)", markKey: "Marking key (for PC)", dashKey: "Dash key (for PC)", mouseSensitivity: "Mouse sensitivity (for PC)", noclip: "Noclip walls",
    graphics: "Graphics", renderingMode: "Rendering mode", dreamy: "Dreamy", realistic: "Realistic", flicker: "Fluorescent flicker", dust: "Dust motes", wallPulse: "Breakable wall pulse", renderDistance: "Render distance", renderWarning: "Higher values may reduce performance.", playerHeight: "Player height",
    sound: "Sound", masterSound: "Master sound", markedMines: "MARKED MINES", position: "POS", goal: "GOAL", dropped: "dropped", elapsed: "You were here for", backToTitle: "Back to title", nextRoom: "Go next level / Retry", close: "Close", on: "on", off: "off", gameInfo: "Game information", githubAria: "GitHub Repository, opens in a new tab",
  },
  ja: {
    enter: "入る >", howToPlay: "遊び方", settings: "設定", english: "英語 (EN)", japanese: "日本語 (JA)", credits: "クレジット", licenses: "ライセンス表記", github: "GitHub リポジトリ ↗︎",
    cancel: "閉じる", reset: "リセット", apply: "適用", config: "操作", breakKey: "壁の破壊キー (PC 用)", markKey: "フラグキー (PC 用)", dashKey: "ダッシュキー (PC 用)", mouseSensitivity: "マウスの感度 (PC 用)", noclip: "壁を通り抜けて破壊",
    graphics: "グラフィック", renderingMode: "描画モード", dreamy: "白昼夢", realistic: "写実的", flicker: "蛍光灯の明滅", dust: "埃の表示", wallPulse: "破壊する壁を点滅", renderDistance: "描画距離", renderWarning: "遠くまで描画すると重くなることがあります。", playerHeight: "身長",
    sound: "サウンド", masterSound: "マスター", markedMines: "フラグ済み", position: "座標", goal: "脱出口", dropped: "落下回数", elapsed: "経過時間", backToTitle: "タイトルに戻る", nextRoom: "次の部屋へ (リトライ)", close: "閉じる", on: "オン", off: "オフ", gameInfo: "ゲーム情報", githubAria: "GitHub リポジトリ、新しいタブで開きます",
  },
} as const;
type WallFace = "north" | "south" | "east" | "west";

function HowToPlayContent({ language }: { language: UiLanguage }) {
  if (language === "ja") return <>
    <h2 id="info-title">遊び方</h2>
    <h3 className="howto-title">Minerooms</h3>
    <p>Backrooms とマインスイーパを融合した脱出ゲーム。<br/>部屋のどこかにある天井の開口部を見つけ、脱出すること。</p>
    <section><h3>PC 向け操作</h3><ul><li>WASD: 移動</li><li>矢印またはマウス: 視点移動</li><li>F: フラグを書き込む</li><li>R: 壁を壊す</li><li>Shift: 走る</li></ul></section>
    <section><h3>壁について</h3><p>壁を破壊しながら、隠された脱出口を見つけましょう。<br/>ただし、中には、すぐ下が空洞になっている壁⸺マインスイーパにおける &quot;地雷&quot; ⸺も存在します。その壁を壊してしまうと、床が崩落し、下の階へと落下します。<br/>下の階は、元の階と全く同じ構造をしていますが、破壊した壁の一部は元通りに復元されています。<br/>壁にフラグを書き込み、落ちないように推理しながら探索してください。</p></section>
    <section><h3>床のシミについて</h3><p>床に敷き詰められたカーペットには、シミのような汚れがついている場合があります。これは、周囲に8マス以内に、空洞があることを意味します。<br/>シミが複数ついている場合は、その数だけ周囲に空洞が存在します。</p></section>
    <section><h3>その他仕様</h3><ul><li>マップの縦横はつながっています。</li><li>柱は、破壊することも、フラグを書き込むこともできません。</li><li>設定から、描画モードを変更できます。白昼夢のような質感と、写実的な描写のどちらかを選択できます。</li><li>動作が重い場合は、設定から描画距離を短縮したり、蛍光灯の明滅や、埃の描画をオフにしてください。スマートフォンの場合は、低電力モードを解除することも有効です。</li><li>Safari, Chrome および Safari for iOS で動作を確認しています。</li></ul></section>
  </>;

  return <>
    <h2 id="info-title">How To Play</h2>
    <h3 className="howto-title">Minerooms</h3>
    <p>Somewhere behind the walls of this place, there&apos;s a way out — a hole in the ceiling, if you can find it. The rooms just keep going, one after another after another, all soaked in the same stale, yellowing light, and there&apos;s no telling which wall hides a floor that&apos;ll give way beneath you. This is Minesweeper reborn as a place you walk through: the numbers are stains on the carpet now, and every step you take is a guess you have to earn.</p>
    <section><h3>PC CONTROLS</h3><ul><li>WASD: Move</li><li>Arrow keys or mouse: Look around</li><li>F: Place a flag</li><li>R: Break a wall</li><li>Shift: Run</li></ul></section>
    <section><h3>ABOUT WALLS</h3><p>Keep tearing through the walls and you&apos;ll find your way out eventually. But not every wall is what it looks like — break the wrong one, and the floor beneath it gives out from under you. You&apos;ll fall to whatever&apos;s below, and by the time you land, some of the ground you already cleared has quietly grown back over, like it was never touched.<br/>Mark what you can&apos;t trust yet with a flag, and think before you swing.</p></section>
    <section><h3>FLOOR STAINS</h3><p>Sometimes the carpet has stains on it — dark little marks that shouldn&apos;t really be there. Each one means a hollow wall is lurking somewhere in the 8 tiles around you. See more than one stain, and that&apos;s how many are waiting nearby.</p></section>
    <section><h3>OTHER SPECIFICATIONS</h3><ul><li>The map wraps around on both the horizontal and vertical axes — there is no edge to run to.</li><li>Pillars can neither be broken nor flagged.</li><li>The rendering mode can be changed in Settings — a hazy, dreamlike look, or a colder, more realistic one.</li><li>If things get slow, try lowering the render distance, or turning off the flickering fluorescent hum and the dust in the air. On smartphones, disabling low-power mode can help too.</li><li>Tested and confirmed working on Safari, Chrome, and Safari for iOS.</li></ul></section>
  </>;
}

type GameSettings = {
  breakKey: BreakKey;
  markKey: MarkKey;
  chargeBreak: boolean;
  dashKey: DashKey;
  flicker: boolean;
  dust: boolean;
  wallPulse: boolean;
  renderDistance: number;
  playerHeight: number;
  mouseSensitivity: number;
  renderMode: RenderMode;
  soundEnabled: boolean;
  bgm: number;
  sfx: number;
};
const DEFAULT_SETTINGS: GameSettings = { breakKey: "KeyR", markKey: "KeyF", chargeBreak: false, dashKey: "Shift", flicker: true, dust: true, wallPulse: true, renderDistance: DEFAULT_RENDER_DISTANCE, playerHeight: DEFAULT_PLAYER_HEIGHT, mouseSensitivity: 100, renderMode: "dreamy", soundEnabled: true, bgm: 60, sfx: 80 };
let planeCanvas: HTMLCanvasElement | null = null;
let planeContext: CanvasRenderingContext2D | null = null;
type LampCell = { active: boolean; offsetX: number; offsetY: number };
type StainSpot = { x: number; y: number; rx: number; ry: number; cos: number; sin: number; bendX: number; bendY: number };
type WorldRenderCache = { pitHints: number[]; stains: StainSpot[][]; lamps: LampCell[]; lampLight: Float32Array };
const worldRenderCaches = new WeakMap<World, WorldRenderCache>();
const STAIN_SIZES = [[.085,.055],[.132,.084],[.181,.111],[.257,.076]] as const;
const rangeStyle = (value: number, min: number, max: number) => ({ "--range-progress": `${(value - min) / (max - min) * 100}%` } as CSSProperties);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatClearTime = (milliseconds: number) => {
  const totalCentiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor(totalCentiseconds / 100) % 60;
  const centiseconds = totalCentiseconds % 100;
  return `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}.${String(centiseconds).padStart(2,"0")}`;
};

function requestPointerLockSafely(canvas: HTMLCanvasElement | null) {
  if (!canvas?.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    Promise.resolve(canvas.requestPointerLock()).catch(() => { /* Chromium may deny pointer lock in an embedded preview. */ });
  } catch { /* The game remains usable and retries on the next click. */ }
}

function isDesktopSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|Edg|EdgiOS|OPR|Opera|Firefox|FxiOS|Android)/.test(ua) && !/(Mobile|iPhone|iPad|iPod)/.test(ua);
}

function browserDefaultSettings(): GameSettings {
  return { ...DEFAULT_SETTINGS, mouseSensitivity: isDesktopSafari() ? 200 : DEFAULT_SETTINGS.mouseSensitivity };
}

function browserLanguage(): UiLanguage {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

function restoreSettings(raw: string, defaults: GameSettings): GameSettings | null {
  try {
    const saved = JSON.parse(raw) as Partial<GameSettings>;
    if (!saved || typeof saved !== "object") return null;
    return {
      breakKey: saved.breakKey === "Space" || saved.breakKey === "Enter" ? saved.breakKey : "KeyR",
      markKey: saved.markKey === "KeyE" || saved.markKey === "Tab" ? saved.markKey : "KeyF",
      chargeBreak: typeof saved.chargeBreak === "boolean" ? saved.chargeBreak : defaults.chargeBreak,
      dashKey: saved.dashKey === "KeyQ" ? "KeyQ" : "Shift",
      flicker: typeof saved.flicker === "boolean" ? saved.flicker : defaults.flicker,
      dust: typeof saved.dust === "boolean" ? saved.dust : defaults.dust,
      wallPulse: typeof saved.wallPulse === "boolean" ? saved.wallPulse : defaults.wallPulse,
      renderDistance: clamp(Number(saved.renderDistance) || DEFAULT_RENDER_DISTANCE, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE),
      playerHeight: clamp(Number(saved.playerHeight) || DEFAULT_PLAYER_HEIGHT, MIN_PLAYER_HEIGHT, MAX_PLAYER_HEIGHT),
      mouseSensitivity: clamp(Number(saved.mouseSensitivity) || defaults.mouseSensitivity, MIN_MOUSE_SENSITIVITY, MAX_MOUSE_SENSITIVITY),
      renderMode: saved.renderMode === "realistic" ? "realistic" : "dreamy",
      soundEnabled: typeof saved.soundEnabled === "boolean" ? saved.soundEnabled : defaults.soundEnabled,
      bgm: clamp(Number.isFinite(Number(saved.bgm)) ? Number(saved.bgm) : defaults.bgm, 0, 100),
      sfx: clamp(Number.isFinite(Number(saved.sfx)) ? Number(saved.sfx) : defaults.sfx, 0, 100),
    };
  } catch { return null; }
}

function distanceVisibility(distance: number, maxDistance = DEFAULT_RENDER_DISTANCE) {
  const distanceRatio = Math.max(0, Math.min(1, distance / maxDistance));
  const shaped = Math.pow(distanceRatio, .68);
  const smoothFade = shaped * shaped * (3 - 2 * shaped);
  const baseVisibility = 1 - (1 - MIN_VISIBILITY) * smoothFade;
  const nearRatio = Math.max(0, Math.min(1, distance / 5));
  const nearFade = 1 - nearRatio * nearRatio * (3 - 2 * nearRatio);
  return Math.min(1, baseVisibility + nearFade * .18);
}

function getWorldRenderCache(world: World) {
  const cached = worldRenderCaches.get(world);
  if (cached) return cached;
  const pitHints = world.cells.map((_, i) => countNearbyPits(world, i % world.size, Math.floor(i / world.size)));
  const stains = pitHints.map((count, cell) => {
    const spots: StainSpot[] = [];
    const random = (stain: number, channel: number) => {
      const value = Math.sin((cell + 1) * 91.17 + (stain + 1) * 47.73 + channel * 131.29 + world.seed * .00013) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let stain = 0; stain < count; stain++) {
      const size = STAIN_SIZES[Math.floor(random(stain, 2) * STAIN_SIZES.length)];
      let x = .12 + random(stain, 0) * .76, y = .12 + random(stain, 1) * .76;
      if (spots.length && random(stain, 3) < .42) {
        const neighbor = spots[Math.floor(random(stain, 4) * spots.length)];
        x = clamp(neighbor.x + (random(stain, 5) - .5) * .16, .09, .91);
        y = clamp(neighbor.y + (random(stain, 6) - .5) * .13, .09, .91);
      }
      const angle = random(stain, 7) * Math.PI;
      spots.push({ x, y, rx: size[0], ry: size[1], cos: Math.cos(angle), sin: Math.sin(angle), bendX: random(stain, 8) - .5, bendY: random(stain, 9) - .5 });
    }
    return spots;
  });
  const lamps: LampCell[] = world.cells.map((_, i) => {
    const x = i % world.size, y = Math.floor(i / world.size);
    const noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return {
      active: noise - Math.floor(noise) < .2,
      offsetX: Math.sin(x * 17.3 + y * 9.1) * .13,
      offsetY: Math.sin(x * 7.7 - y * 19.9) * .13,
    };
  });
  const lampLight = new Float32Array(world.cells.length);
  for (let y = 0; y < world.size; y++) for (let x = 0; x < world.size; x++) {
    let light = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!lamps[indexAt(x + ox, y + oy, world.size)].active) continue;
      light = Math.max(light, ox === 0 && oy === 0 ? 1 : ox === 0 || oy === 0 ? .42 : .24);
    }
    lampLight[indexAt(x, y, world.size)] = light;
  }
  const created = { pitHints, stains, lamps, lampLight };
  worldRenderCaches.set(world, created);
  return created;
}

function cellCenterDistance(world: World, player: Player, cellX: number, cellY: number) {
  const rawX = Math.abs(cellX + .5 - player.x), rawY = Math.abs(cellY + .5 - player.y);
  const dx = Math.min(rawX, world.size - rawX), dy = Math.min(rawY, world.size - rawY);
  return Math.hypot(dx, dy);
}

const wallFaceKey = (world: World, cellX: number, cellY: number, face: WallFace) =>
  `${indexAt(cellX, cellY, world.size)}:${face}`;

const cellHasMark = (world: World, marks: Set<string>, cellX: number, cellY: number) => {
  const prefix = `${indexAt(cellX, cellY, world.size)}:`;
  return marks.has(`${prefix}north`) || marks.has(`${prefix}south`) || marks.has(`${prefix}east`) || marks.has(`${prefix}west`);
};

function clearCellMarks(world: World, marks: Set<string>, cellX: number, cellY: number) {
  for (const face of ["north", "south", "east", "west"] as const) marks.delete(wallFaceKey(world, cellX, cellY, face));
}

function countMarkedCells(world: World, marks: Set<string>) {
  let count = 0;
  for (let i = 0; i < world.cells.length; i++) {
    if (cellHasMark(world, marks, i % world.size, Math.floor(i / world.size))) count++;
  }
  return count;
}

function removeIncorrectMarks(world: World, marks: Set<string>) {
  for (const key of marks) {
    const separator = key.indexOf(":");
    const cellIndex = separator > 0 ? Number(key.slice(0, separator)) : Number.NaN;
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= world.cells.length || world.cells[cellIndex] !== "pit") marks.delete(key);
  }
}

function chooseOpenFacingAngle(world: World, x: number, y: number) {
  const maxDistance = Math.min(9, world.size * .45);
  const fanOffsets = [-.68, -.45, -.23, 0, .23, .45, .68];
  const fanWeights = [.45, .7, 1.05, 1.7, 1.05, .7, .45];
  const openDistance = (angle: number) => {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (let distance = .16; distance <= maxDistance; distance += .16) {
      const cell = world.cells[indexAt(Math.floor(x + dx * distance), Math.floor(y + dy * distance), world.size)];
      if (cell !== "open") return distance;
    }
    return maxDistance;
  };
  let bestAngle = 0, bestScore = -Infinity;
  const angleOffset = ((world.seed ^ Math.floor(x * 97) ^ Math.floor(y * 193)) >>> 0) / 4294967296 * Math.PI * 2;
  for (let sample = 0; sample < 48; sample++) {
    const angle = angleOffset + sample / 48 * Math.PI * 2;
    let score = 0;
    for (let ray = 0; ray < fanOffsets.length; ray++) {
      const distance = openDistance(angle + fanOffsets[ray]);
      score += distance * distance * fanWeights[ray];
    }
    if (score > bestScore) { bestScore = score; bestAngle = angle; }
  }
  return bestAngle;
}

function movementCrossesMarkedWall(world: World, marks: Set<string>, x: number, y: number, dx: number, dy: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / .04));
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    const cellX = wrap(Math.floor(x + dx * t), world.size);
    const cellY = wrap(Math.floor(y + dy * t), world.size);
    const cell = world.cells[indexAt(cellX, cellY, world.size)];
    if ((cell === "wall" || cell === "pit" || cell === "goal") && cellHasMark(world, marks, cellX, cellY)) return true;
  }
  return false;
}

function aimedCeilingCell(world: World, player: Player, width: number, height: number, maxDistance = DEFAULT_RENDER_DISTANCE, cameraHeight = DEFAULT_PLAYER_HEIGHT, transparentCells?: Set<number>) {
  const projection = width / (2 * Math.tan(FOV / 2));
  const horizon = height * .5 - Math.tan(player.pitch) * projection;
  const offset = horizon - height * .5;
  if (offset <= 1) return null;
  const distance = (CEILING_HEIGHT - cameraHeight) * projection / offset;
  if (distance >= maxDistance) return null;
  const obstruction = cast(world, player, player.angle, maxDistance, transparentCells);
  if (obstruction.cell !== "open" && obstruction.distance < distance) return null;
  return {
    x: wrap(Math.floor(player.x + Math.cos(player.angle) * distance), world.size),
    y: wrap(Math.floor(player.y + Math.sin(player.angle) * distance), world.size),
  };
}

function cast(world: World, player: Player, angle: number, maxDistance = DEFAULT_RENDER_DISTANCE, transparentCells?: Set<number>) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  let mapX = Math.floor(player.x), mapY = Math.floor(player.y), distance = 0;
  const deltaX = cos === 0 ? Infinity : Math.abs(1 / cos);
  const deltaY = sin === 0 ? Infinity : Math.abs(1 / sin);
  const stepX = cos < 0 ? -1 : 1, stepY = sin < 0 ? -1 : 1;
  let sideX = Number.isFinite(deltaX) ? (cos < 0 ? player.x - mapX : mapX + 1 - player.x) * deltaX : Infinity;
  let sideY = Number.isFinite(deltaY) ? (sin < 0 ? player.y - mapY : mapY + 1 - player.y) * deltaY : Infinity;
  while (distance < maxDistance) {
    let verticalSide: boolean;
    if (sideX < sideY) { distance = sideX; sideX += deltaX; mapX += stepX; verticalSide = true; }
    else { distance = sideY; sideY += deltaY; mapY += stepY; verticalSide = false; }
    if (distance > maxDistance) break;
    const x = wrap(mapX, world.size), y = wrap(mapY, world.size);
    const cell = world.cells[indexAt(x, y, world.size)];
    if (transparentCells?.has(indexAt(x, y, world.size))) continue;
    if (cell !== "open") {
      const hitX = player.x + cos * distance, hitY = player.y + sin * distance;
      let texture = verticalSide ? ((hitY % 1) + 1) % 1 : ((hitX % 1) + 1) % 1;
      if ((verticalSide && cos > 0) || (!verticalSide && sin < 0)) texture = 1 - texture;
      const face: WallFace = verticalSide ? (cos > 0 ? "west" : "east") : (sin > 0 ? "north" : "south");
      return { distance, cell, texture, cellX: x, cellY: y, verticalSide, face };
    }
  }
  return { distance: maxDistance, cell: "open" as Cell, texture: 0, cellX: 0, cellY: 0, verticalSide: false, face: "north" as WallFace };
}

function drawDustMotes(ctx: CanvasRenderingContext2D, width: number, height: number, world: World, player: Player, now: number, maxDistance: number, cameraHeight: number, projection: number, horizon: number, forwardX: number, forwardY: number, rightX: number, rightY: number, wallDepth: Float32Array, lamps: LampCell[]) {
  const lampAt = (gx: number, gy: number) => lamps[indexAt(gx, gy, world.size)];
  const dustRadius = 9;
  const centerCellX = Math.floor(player.x), centerCellY = Math.floor(player.y);
  for (let gy = centerCellY - dustRadius; gy <= centerCellY + dustRadius; gy++) {
    for (let gx = centerCellX - dustRadius; gx <= centerCellX + dustRadius; gx++) {
      const lamp = lampAt(gx, gy);
      if (!lamp.active) continue;
      for (let mote = 0; mote < 3; mote++) {
        const seed = gx * 71.3 + gy * 113.9 + mote * 47.7;
        const drift = now * .00048;
        const dustX = gx + .5 + lamp.offsetX + Math.sin(seed * 1.37) * .58 + Math.sin(drift + seed * .73) * .1;
        const dustY = gy + .5 + lamp.offsetY + Math.sin(seed * 2.11 + 2.4) * .58 + Math.cos(drift * .83 + seed * .91) * .1;
        const dustHeight = CEILING_HEIGHT - .16 - (.5 + .5 * Math.sin(seed * 3.17)) * .72
          + Math.sin(drift * 1.35 + seed * 1.17) * .055;
        const dx = dustX - player.x, dy = dustY - player.y;
        const forwardDistance = dx * forwardX + dy * forwardY;
        if (forwardDistance <= .35 || forwardDistance >= maxDistance - 4) continue;
        const sideDistance = dx * rightX + dy * rightY;
        const screenX = width * .5 + sideDistance * projection / forwardDistance;
        if (screenX < -4 || screenX > width + 4) continue;
        const depthRay = Math.max(0, Math.min(RAYS - 1, Math.round(screenX / width * (RAYS - 1))));
        if (forwardDistance > wallDepth[depthRay] + .08) continue;
        const screenY = horizon - (dustHeight - cameraHeight) * projection / forwardDistance;
        if (screenY < -4 || screenY > height + 4) continue;
        const twinkle = Math.sin(now * (.00165 + mote * .00022) + seed * 5.3);
        if (twinkle < .55) continue;
        const alpha = Math.min(.68, (twinkle - .55) * 1.45) * distanceVisibility(forwardDistance, maxDistance);
        const size = Math.max(1, width / 950) * (1.35 - forwardDistance / maxDistance);
        ctx.fillStyle = `rgba(255,253,229,${alpha})`;
        ctx.fillRect(screenX - size, screenY - size * .22, size * 2, Math.max(1, size * .44));
        ctx.fillRect(screenX - size * .22, screenY - size, Math.max(1, size * .44), size * 2);
      }
    }
  }
}

function renderCanvas2D(ctx: CanvasRenderingContext2D, width: number, height: number, world: World, player: Player, now: number, exitOpening: ExitOpening, settings: GameSettings, wallMarks: Set<string>, revealedPits: Set<number>, cameraDrop = 0, fallYaw = 0, fallPitch = 0, viewFov = FOV) {
  const maxDistance = settings.renderDistance;
  const cameraHeight = settings.playerHeight - cameraDrop;
  const flicker = settings.flicker
    ? .94 + Math.sin(now * .0027) * .025 + (Math.sin(now * .017) > .985 ? -.12 : 0)
    : 1;
  const projection = width / (2 * Math.tan(viewFov / 2));
  const bobY = (Math.abs(Math.cos(player.bobPhase)) - .5) * height * .006 * player.bobAmount;
  const viewAngle = player.angle + Math.sin(player.bobPhase) * .003 * player.bobAmount + fallYaw;
  const viewPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, player.pitch + fallPitch));
  const horizon = height * .5 - Math.tan(viewPitch) * projection + bobY;
  const forwardX = Math.cos(viewAngle), forwardY = Math.sin(viewAngle);
  const rightX = -forwardY, rightY = forwardX;
  const planeSpread = Math.tan(viewFov / 2);
  const rayLeft = { x: forwardX - rightX * planeSpread, y: forwardY - rightY * planeSpread };
  const rayRight = { x: forwardX + rightX * planeSpread, y: forwardY + rightY * planeSpread };
  const aimedHit = cast(world, player, viewAngle, maxDistance, revealedPits);
  const aimedTop = horizon - (CEILING_HEIGHT - cameraHeight) * projection / Math.max(.025, aimedHit.distance);
  const aimedBottom = horizon + cameraHeight * projection / Math.max(.025, aimedHit.distance);
  const aimedWallMarked = cellHasMark(world, wallMarks, aimedHit.cellX, aimedHit.cellY);
  const aimedTarget = settings.wallPulse && !aimedWallMarked && (aimedHit.cell === "wall" || aimedHit.cell === "pit" || aimedHit.cell === "goal")
    && cellCenterDistance(world, player, aimedHit.cellX, aimedHit.cellY) <= BREAK_RADIUS
    && aimedTop <= height * .5 && aimedBottom >= height * .5
    ? aimedHit
    : null;
  const hoverPhase = (now % 1000) / 1000;
  const hoverAlpha = .055 + (.5 - Math.cos(hoverPhase * Math.PI * 2) * .5) * .2;
  const { stains, lamps, lampLight } = getWorldRenderCache(world);
  const lampAt = (gx: number, gy: number) => lamps[indexAt(gx, gy, world.size)];
  const cellLampLight = (gx: number, gy: number) => lampLight[indexAt(gx, gy, world.size)];
  const localLampLight = (wx: number, wy: number) => {
    const sampleX = wx - .5, sampleY = wy - .5;
    const gx = Math.floor(sampleX), gy = Math.floor(sampleY);
    const rawX = sampleX - gx, rawY = sampleY - gy;
    const blendX = rawX * rawX * (3 - 2 * rawX);
    const blendY = rawY * rawY * (3 - 2 * rawY);
    const top = cellLampLight(gx, gy) * (1 - blendX) + cellLampLight(gx + 1, gy) * blendX;
    const bottom = cellLampLight(gx, gy + 1) * (1 - blendX) + cellLampLight(gx + 1, gy + 1) * blendX;
    return top * (1 - blendY) + bottom * blendY;
  };

  // Ray-plane projection: floor, ceiling tiles and lamps now share wall coordinates.
  const planeRows = Math.ceil(height / 3);
  if (!planeCanvas) { planeCanvas = document.createElement("canvas"); planeContext = planeCanvas.getContext("2d"); }
  if (planeCanvas.width !== RAYS || planeCanvas.height !== planeRows) { planeCanvas.width = RAYS; planeCanvas.height = planeRows; }
  const planePixels = planeContext!.createImageData(RAYS, planeRows);
  const samplePlane = (screenY: number, row: number, ceiling: boolean) => {
    const offset = Math.abs(screenY - horizon);
    const planeHeight = ceiling ? CEILING_HEIGHT - cameraHeight : cameraHeight;
    const distance = planeHeight * projection / Math.max(1, offset);
    const visibility = distanceVisibility(distance, maxDistance);
    const lampRangeRatio = Math.max(0, Math.min(1, (distance - (maxDistance - 4)) / 4));
    const lampRange = 1 - lampRangeRatio * lampRangeRatio * (3 - 2 * lampRangeRatio);
    const distantBlur = Math.max(0, Math.min(1, (distance - FOG_START) / Math.max(1, maxDistance - FOG_START)));
    for (let ray = 0; ray < RAYS; ray++) {
      const t = ray / (RAYS - 1);
      const wx = player.x + (rayLeft.x + (rayRight.x - rayLeft.x) * t) * distance;
      const wy = player.y + (rayLeft.y + (rayRight.y - rayLeft.y) * t) * distance;
      const fx = ((wx % 1) + 1) % 1, fy = ((wy % 1) + 1) % 1;
      const blurStep = .012 + distantBlur * .075;
      const detailX = Math.round(wx / blurStep) * blurStep;
      const detailY = Math.round(wy / blurStep) * blurStep;
      let r: number, g: number, b: number, emissive = 0, floorHole = false;
      if (ceiling) {
        const gx = Math.floor(wx), gy = Math.floor(wy);
        const lamp = lampAt(gx, gy);
        const localX = fx - (.5 + lamp.offsetX);
        const localY = fy - (.5 + lamp.offsetY);
        const lampEdge = Math.max(Math.abs(localX) / .34, Math.abs(localY) / .23);
        emissive = lamp.active ? Math.max(0, Math.min(1, (1.14 - lampEdge) / .28)) * lampRange : 0;
        const mottled = Math.sin(detailX * 21) * Math.sin(detailY * 17) * 4;
        r = (153+mottled) * (1-emissive) + 248 * emissive;
        g = (145+mottled) * (1-emissive) + 242 * emissive;
        b = (78+mottled*.6) * (1-emissive) + 188 * emissive;
        const isExit = exitOpening && wrap(gx, world.size) === exitOpening.x && wrap(gy, world.size) === exitOpening.y;
        if (isExit) {
          const holeX = fx - .5, holeY = fy - .5;
          const holeEdge = Math.max(Math.abs(holeX) / .39, Math.abs(holeY) / .35);
          if (holeEdge < 1) {
            const rim = Math.max(0, Math.min(1, (1 - holeEdge) * 8));
            r = 42 - rim * 25; g = 39 - rim * 24; b = 22 - rim * 13;
            emissive = 0;
          }
        }
      } else {
        const cellX = wrap(Math.floor(wx), world.size), cellY = wrap(Math.floor(wy), world.size);
        floorHole = revealedPits.has(indexAt(cellX, cellY, world.size));
        if (floorHole) {
          r = 0; g = 0; b = 0;
        } else {
          const weave = (Math.sin(detailX * 74 + detailY * 13) * 5 + Math.sin(detailY * 91) * 3) * (1 - distantBlur * .72);
          r = 132+weave; g = 113+weave; b = 43+weave*.45;
          if ((cellX + cellY) % 2) { r *= .93; g *= .93; b *= .93; }
          const cellStains = stains[indexAt(cellX, cellY, world.size)];
          for (const stain of cellStains) {
            const dx = fx - stain.x, dy = fy - stain.y;
            const qx = (dx * stain.cos + dy * stain.sin) / stain.rx;
            const qy = (-dx * stain.sin + dy * stain.cos) / stain.ry;
            const bentX = qx + qy * qy * stain.bendX * .16;
            const bentY = qy + qx * qx * stain.bendY * .13;
            const shape = bentX * bentX + bentY * bentY + bentX * bentY * .13;
            const strength = Math.max(0, Math.min(1, (1 - shape) * 1.65));
            if (strength > 0) {
              r -= 21 * strength; g -= 19 * strength; b -= 11 * strength;
            }
          }
        }
      }
      if (floorHole) {
        const pixel = (row * RAYS + ray) * 4;
        planePixels.data[pixel] = 0;
        planePixels.data[pixel + 1] = 0;
        planePixels.data[pixel + 2] = 0;
        planePixels.data[pixel + 3] = 255;
        continue;
      }
      const baseLight = visibility * (1-emissive) + Math.pow(visibility, .75) * emissive;
      const lightBoost = Math.min(1.12, baseLight + localLampLight(wx, wy) * lampRange * .32) * flicker;
      const pixel = (row * RAYS + ray) * 4;
      planePixels.data[pixel] = Math.floor(r * lightBoost);
      planePixels.data[pixel + 1] = Math.floor(g * lightBoost);
      planePixels.data[pixel + 2] = Math.floor(b * lightBoost);
      planePixels.data[pixel + 3] = 255;
    }
  };
  for (let row = 0; row < planeRows; row++) { const y = row * 3; samplePlane(y, row, y < horizon); }
  planeContext!.putImageData(planePixels, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(planeCanvas, 0, 0, RAYS, planeRows, 0, 0, width, height);

  const strip = width / RAYS;
  const wallDepth = new Float32Array(RAYS);
  wallDepth.fill(maxDistance);
  for (let ray = 0; ray < RAYS; ray++) {
    const relative = (ray / (RAYS - 1) - .5) * viewFov;
    const hit = cast(world, player, viewAngle + relative, maxDistance, revealedPits);
    if (hit.cell === "open") continue;
    const corrected = hit.distance * Math.cos(relative);
    wallDepth[ray] = corrected;
    const top = horizon - (CEILING_HEIGHT - cameraHeight) * projection / Math.max(.025, corrected);
    const bottom = horizon + cameraHeight * projection / Math.max(.025, corrected);
    const wallTop = Math.max(-height, top), wallBottom = Math.min(height * 2, bottom);
    const wallHeight = wallBottom - wallTop;
    const sideLight = hit.verticalSide ? 1 : .84;
    const hitAngle = viewAngle + relative;
    const hitX = player.x + Math.cos(hitAngle) * hit.distance;
    const hitY = player.y + Math.sin(hitAngle) * hit.distance;
    const fog = Math.min(1.12, distanceVisibility(corrected, maxDistance) + localLampLight(hitX, hitY) * .3) * flicker * sideLight;
    const isPillar = hit.cell === "pillar";
    const wallSeed = hit.cellX * 19.17 + hit.cellY * 31.73;
    const wallBlur = Math.max(0, Math.min(1, (corrected - FOG_START) / Math.max(1, maxDistance - FOG_START)));
    const textureSteps = Math.max(5, Math.round(80 * (1 - wallBlur)));
    const blurredTexture = Math.round(hit.texture * textureSteps) / textureSteps;
    const wallpaper = (Math.sin(blurredTexture * 38 + wallSeed) * 4 + Math.sin(blurredTexture * 113 + wallSeed * .7) * 2) * (1 - wallBlur * .75);
    const pillarMottle = (Math.sin(blurredTexture * 29 + wallSeed) * 3 + Math.sin(blurredTexture * 67 + wallSeed * .6) * 1.5) * (1 - wallBlur * .7);
    const base = isPillar
      ? [174 + pillarMottle, 160 + pillarMottle, 91 + pillarMottle * .55]
      : [184 + wallpaper, 172 + wallpaper, 78 + wallpaper / 2];
    ctx.fillStyle = `rgb(${base.map(v => Math.max(0, Math.floor(v * fog))).join(",")})`;
    ctx.fillRect(ray * strip, wallTop, strip + 1, wallHeight);
    if (isPillar) {
      const trimHeight = Math.min(wallHeight * .11, Math.max(1, .12 * projection / Math.max(.025, corrected)));
      const trim = [207, 199, 151].map(v => Math.max(0, Math.floor(v * fog)));
      ctx.fillStyle = `rgb(${trim.join(",")})`;
      ctx.fillRect(ray * strip, wallTop, strip + 1, trimHeight);
      ctx.fillRect(ray * strip, wallBottom - trimHeight, strip + 1, trimHeight);
    }
    if (!isPillar && wallMarks.has(wallFaceKey(world, hit.cellX, hit.cellY, hit.face))) {
      const u = hit.texture;
      const crayon = `rgba(18,15,9,${Math.min(.92, .68 + fog * .18)})`;
      ctx.fillStyle = crayon;
      const jitter = Math.sin(u * 173 + wallSeed * 2.1) * wallHeight * .006;
      if (Math.abs(u - .37) < .035) {
        ctx.fillRect(ray * strip, wallTop + wallHeight * .24 + jitter, strip + 1, wallHeight * .57);
      }
      if (u >= .37 && u <= .77) {
        const taper = 1 - (u - .37) / .4;
        const half = .13 * taper;
        ctx.fillRect(ray * strip, wallTop + wallHeight * (.405 - half) + jitter, strip + 1, Math.max(1, wallHeight * half * 2));
      }
      if (u >= .25 && u <= .5) {
        const baseY = .82 - Math.abs(u - .375) * .42;
        ctx.fillRect(ray * strip, wallTop + wallHeight * baseY + jitter, strip + 1, Math.max(1, wallHeight * .025));
      }
    }
    if (aimedTarget && hit.cellX === aimedTarget.cellX && hit.cellY === aimedTarget.cellY) {
      ctx.fillStyle = `rgba(255,255,245,${hoverAlpha})`;
      ctx.fillRect(ray * strip, wallTop, strip + 1, wallHeight);
    }
  }

  // Dust is shared verbatim with the WebGL overlay, including wall occlusion.
  if (settings.dust) drawDustMotes(ctx, width, height, world, player, now, maxDistance, cameraHeight, projection, horizon, forwardX, forwardY, rightX, rightY, wallDepth, lamps);
  // Lightweight post-process shader: fluorescent tint, vignette and animated film grain.
  const glow = ctx.createRadialGradient(width*.5,height*.43,0,width*.5,height*.48,width*.72);
  glow.addColorStop(0, `rgba(255,248,175,${.09*flicker})`); glow.addColorStop(.58,"rgba(107,103,58,.025)"); glow.addColorStop(1,"rgba(9,7,2,.3)");
  ctx.fillStyle = glow; ctx.fillRect(0,0,width,height);
  const grainSeed = Math.floor(now / 70);
  for (let i=0;i<90;i++) {
    const gx = ((i*7919 + grainSeed*1049) % 997) / 997 * width;
    const gy = ((i*3571 + grainSeed*1877) % 991) / 991 * height;
    ctx.fillStyle = i%3 ? "rgba(255,244,181,.025)" : "rgba(0,0,0,.045)";
    ctx.fillRect(gx,gy,Math.max(1,width/700),Math.max(1,height/500));
  }
}

export function MineroomsGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallBlurRef = useRef<HTMLDivElement>(null);
  const fallDarknessRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef(createWorld());
  const initialGoalIndex = worldRef.current.cells.indexOf("goal");
  const playerRef = useRef<Player>({ x: worldRef.current.start.x + .5, y: worldRef.current.start.y + .5, angle: -.5, pitch: 0, bobPhase: 0, bobAmount: 0 });
  const keysRef = useRef(new Set<string>());
  const stickRef = useRef<Stick>({ x: 0, y: 0 });
  const stickElementRef = useRef<HTMLDivElement>(null);
  const breakActionRef = useRef<(() => void) | null>(null);
  const markActionRef = useRef<(() => void) | null>(null);
  const runStartedAtRef = useRef(0);
  const exitOpeningRef = useRef<ExitOpening>(null);
  const exitReadyRef = useRef(false);
  const fallTransitionRef = useRef<FallTransition>(null);
  const openedWallsRef = useRef(new Set<number>());
  const revealedPitsRef = useRef(new Set<number>());
  const wallMarksRef = useRef(new Set<string>());
  const droppedRef = useRef(0);
  const goalRef = useRef({ x: initialGoalIndex % worldRef.current.size, y: Math.floor(initialGoalIndex / worldRef.current.size) });
  const debugElementRef = useRef<HTMLSpanElement>(null);
  const mineCounterElementRef = useRef<HTMLSpanElement>(null);
  const totalPitsRef = useRef(worldRef.current.cells.filter(cell => cell === "pit").length);
  const settingsRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const settingsSnapshotRef = useRef<GameSettings>(DEFAULT_SETTINGS);
  const movementSfxRef = useRef<{ kind: "walking" | "running" | null; source: AudioBufferSourceNode | null; gain: GainNode | null }>({ kind: null, source: null, gain: null });
  const movementLoadTokenRef = useRef(0);
  const bgmContextRef = useRef<AudioContext | null>(null);
  const bgmBufferRef = useRef<AudioBuffer | null>(null);
  const bgmSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const bgmLoadTokenRef = useRef(0);
  const sfxBufferCacheRef = useRef(new Map<string, AudioBuffer>());
  const audioLoadPromisesRef = useRef(new Map<string, Promise<AudioBuffer>>());
  const activeBufferSfxRef = useRef(new Set<AudioBufferSourceNode>());
  const [started, setStarted] = useState(false);
  const [won, setWon] = useState(false);
  const [clearTimeMs, setClearTimeMs] = useState(0);
  const [selectedSize, setSelectedSize] = useState(10);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>("system");
  const [systemLanguage, setSystemLanguage] = useState<UiLanguage>("en");
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [infoModal, setInfoModal] = useState<"credits" | "licenses" | "howto" | null>(null);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const activeLanguage = languagePreference === "system" ? systemLanguage : languagePreference;
  const copy = UI_COPY[activeLanguage];
  const languageLabel = activeLanguage === "ja" ? copy.japanese : copy.english;
  const loadAudioBuffer = useCallback((context: AudioContext, source: string) => {
    const cached = sfxBufferCacheRef.current.get(source);
    if (cached) return Promise.resolve(cached);
    const pending = audioLoadPromisesRef.current.get(source);
    if (pending) return pending;
    const request = fetch(source).then(response => {
      if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
      return response.arrayBuffer();
    }).then(data => context.decodeAudioData(data)).then(buffer => {
      sfxBufferCacheRef.current.set(source, buffer);
      audioLoadPromisesRef.current.delete(source);
      return buffer;
    }).catch(error => {
      audioLoadPromisesRef.current.delete(source);
      throw error;
    });
    audioLoadPromisesRef.current.set(source, request);
    return request;
  }, []);
  const playSfx = useCallback(async (sourceUrl: string, startAt = 0, duration?: number, fadeOut = 0) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.soundEnabled || currentSettings.sfx <= 0) return;
    try {
      const existingContext = bgmContextRef.current;
      const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContext();
      bgmContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, sourceUrl);
      const latestSettings = settingsRef.current;
      if (!latestSettings.soundEnabled || latestSettings.sfx <= 0) return;
      const offset = clamp(startAt, 0, Math.max(0, buffer.duration - .001));
      const playDuration = Math.min(duration ?? buffer.duration - offset, buffer.duration - offset);
      if (playDuration <= 0) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const now = context.currentTime;
      const volume = latestSettings.sfx / 100;
      gain.gain.setValueAtTime(volume, now);
      if (fadeOut > 0) {
        gain.gain.setValueAtTime(volume, now + Math.max(0, playDuration - fadeOut));
        gain.gain.linearRampToValueAtTime(0, now + playDuration);
      }
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      activeBufferSfxRef.current.add(source);
      source.addEventListener("ended", () => { activeBufferSfxRef.current.delete(source); source.disconnect(); gain.disconnect(); }, { once: true });
      source.start(now, offset, playDuration);
    } catch { /* Audio remains optional when unavailable or blocked. */ }
  }, [loadAudioBuffer]);
  const stopMovementSfx = useCallback(() => {
    const movement = movementSfxRef.current;
    movementLoadTokenRef.current++;
    try { movement.source?.stop(); } catch { /* The source may already have stopped. */ }
    movement.source?.disconnect();
    movement.gain?.disconnect();
    movementSfxRef.current = { kind: null, source: null, gain: null };
  }, []);
  const setMovementSfx = useCallback((kind: "walking" | "running" | null) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.soundEnabled || currentSettings.sfx <= 0) kind = null;
    const current = movementSfxRef.current;
    if (current.kind === kind) {
      if (current.gain) current.gain.gain.value = currentSettings.sfx / 100;
      return;
    }
    movementLoadTokenRef.current++;
    try { current.source?.stop(); } catch { /* The source may already have stopped. */ }
    current.source?.disconnect();
    current.gain?.disconnect();
    if (!kind) { movementSfxRef.current = { kind: null, source: null, gain: null }; return; }
    const requestedKind = kind;
    const token = movementLoadTokenRef.current;
    movementSfxRef.current = { kind: requestedKind, source: null, gain: null };
    const existingContext = bgmContextRef.current;
    const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContext();
    bgmContextRef.current = context;
    void context.resume().then(() => loadAudioBuffer(context, `/sounds/${requestedKind}.mp3`)).then(buffer => {
      if (token !== movementLoadTokenRef.current || movementSfxRef.current.kind !== requestedKind) return;
      const latestSettings = settingsRef.current;
      if (!latestSettings.soundEnabled || latestSettings.sfx <= 0) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = latestSettings.sfx / 100;
      source.connect(gain).connect(context.destination);
      movementSfxRef.current = { kind: requestedKind, source, gain };
      source.start();
    }).catch(() => {
      if (token === movementLoadTokenRef.current) movementSfxRef.current = { kind: null, source: null, gain: null };
    });
  }, [loadAudioBuffer]);
  const stopBgm = useCallback(() => {
    bgmLoadTokenRef.current++;
    try { bgmSourceRef.current?.stop(); } catch { /* The source may already have stopped. */ }
    bgmSourceRef.current?.disconnect();
    bgmSourceRef.current = null;
    bgmGainRef.current?.disconnect();
    bgmGainRef.current = null;
  }, []);
  const startBgm = useCallback(async () => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.soundEnabled || currentSettings.bgm <= 0) return;
    stopBgm();
    const token = bgmLoadTokenRef.current;
    try {
      const existingContext = bgmContextRef.current;
      const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContext();
      bgmContextRef.current = context;
      await context.resume();
      const buffer = bgmBufferRef.current ?? await loadAudioBuffer(context, "/sounds/fluorescent-buzz.mp3");
      bgmBufferRef.current = buffer;
      if (token !== bgmLoadTokenRef.current) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      gain.gain.value = currentSettings.bgm / 100;
      source.connect(gain).connect(context.destination);
      bgmSourceRef.current = source;
      bgmGainRef.current = gain;
      source.start();
    } catch { /* Audio remains optional when the browser blocks playback. */ }
  }, [loadAudioBuffer, stopBgm]);
  const ensureBgm = useCallback(() => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.soundEnabled || currentSettings.bgm <= 0) { stopBgm(); return; }
    const context = bgmContextRef.current;
    if (context && context.state !== "closed" && bgmSourceRef.current) {
      if (bgmGainRef.current) bgmGainRef.current.gain.value = currentSettings.bgm / 100;
      void context.resume();
      return;
    }
    void startBgm();
  }, [startBgm, stopBgm]);
  const playBufferedSfx = useCallback(async (sourceUrl: string, duration: number, fadeOut: number) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings.soundEnabled || currentSettings.sfx <= 0) return;
    try {
      const existingContext = bgmContextRef.current;
      const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContext();
      bgmContextRef.current = context;
      await context.resume();
      const buffer = await loadAudioBuffer(context, sourceUrl);
      const latestSettings = settingsRef.current;
      if (!latestSettings.soundEnabled || latestSettings.sfx <= 0) return;
      const source = context.createBufferSource();
      const gain = context.createGain();
      const now = context.currentTime;
      const volume = latestSettings.sfx / 100;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.setValueAtTime(volume, now + Math.max(0, duration - fadeOut));
      gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.buffer = buffer;
      source.connect(gain).connect(context.destination);
      activeBufferSfxRef.current.add(source);
      source.addEventListener("ended", () => { activeBufferSfxRef.current.delete(source); source.disconnect(); gain.disconnect(); }, { once: true });
      source.start(now, 0, duration);
    } catch { /* Audio remains optional when the browser blocks playback. */ }
  }, [loadAudioBuffer]);
  const stopAllSfx = useCallback(() => {
    stopBgm();
    stopMovementSfx();
    for (const source of activeBufferSfxRef.current) { try { source.stop(); } catch { /* Already stopped. */ } }
    activeBufferSfxRef.current.clear();
  }, [stopBgm, stopMovementSfx]);
  const selectLanguage = (language: UiLanguage) => {
    setLanguagePreference(language);
    setLanguageMenuOpen(false);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Storage may be unavailable. */ }
  };
  const updateSettings = (patch: Partial<GameSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
  };
  const openSettings = () => {
    settingsSnapshotRef.current = { ...settingsRef.current };
    setSettingsOpen(true);
  };
  const cancelSettings = () => {
    const previous = { ...settingsSnapshotRef.current };
    settingsRef.current = previous;
    setSettings(previous);
    setSettingsOpen(false);
  };
  const resetSettings = () => {
    const defaults = browserDefaultSettings();
    settingsRef.current = defaults;
    setSettings(defaults);
  };
  const applySettings = () => {
    try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settingsRef.current)); } catch { /* Storage may be unavailable. */ }
    setSettingsOpen(false);
  };

  useEffect(() => {
    try {
      const defaults = browserDefaultSettings();
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      const initial = (raw && restoreSettings(raw, defaults)) || defaults;
      settingsRef.current = initial;
      settingsSnapshotRef.current = { ...initial };
      setSettings(initial);
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(initial));
    } catch { /* Storage may be unavailable. */ }
  }, []);

  useEffect(() => {
    setSystemLanguage(browserLanguage());
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      setLanguagePreference(saved === "en" || saved === "ja" ? saved : "system");
    } catch { setLanguagePreference("system"); }
  }, []);

  useEffect(() => {
    document.documentElement.lang = activeLanguage;
  }, [activeLanguage]);

  useEffect(() => {
    const existingContext = bgmContextRef.current;
    const context = existingContext && existingContext.state !== "closed" ? existingContext : new AudioContext();
    bgmContextRef.current = context;
    for (const source of AUDIO_URLS) void loadAudioBuffer(context, source).catch(() => {});
    const unlock = () => { if (context.state === "suspended") void context.resume(); };
    addEventListener("pointerdown", unlock, { passive: true });
    addEventListener("keydown", unlock);
    return () => {
      removeEventListener("pointerdown", unlock);
      removeEventListener("keydown", unlock);
    };
  }, [loadAudioBuffer]);

  useEffect(() => () => {
    stopAllSfx();
    const context = bgmContextRef.current;
    bgmContextRef.current = null;
    bgmBufferRef.current = null;
    sfxBufferCacheRef.current.clear();
    audioLoadPromisesRef.current.clear();
    if (context?.state !== "closed") void context?.close();
  }, [stopAllSfx]);

  const prepareWorld = useCallback((size: number) => {
    const world = createWorld(undefined, size); worldRef.current = world;
    const goalIndex = world.cells.indexOf("goal");
    goalRef.current = { x: goalIndex % world.size, y: Math.floor(goalIndex / world.size) };
    totalPitsRef.current = world.cells.filter(cell => cell === "pit").length;
    const startX = world.start.x + .5, startY = world.start.y + .5;
    playerRef.current = { x: startX, y: startY, angle: chooseOpenFacingAngle(world, startX, startY), pitch: 0, bobPhase: 0, bobAmount: 0 };
    exitOpeningRef.current = null;
    exitReadyRef.current = false;
    fallTransitionRef.current = null;
    fallBlurRef.current?.style.setProperty("--fall-blur", "0px");
    openedWallsRef.current.clear();
    revealedPitsRef.current.clear();
    wallMarksRef.current.clear();
    droppedRef.current = 0;
  }, []);
  const begin = useCallback(() => {
    stopAllSfx();
    void startBgm();
    prepareWorld(selectedSize);
    const now = performance.now();
    fallTransitionRef.current = { startedAt: now - FALL_REVEAL_START * 1000, pitX: -1, pitY: -1, warped: true, inputLocked: true, shakeSeed: Math.random() * Math.PI * 2, wakeSoundPlayed: false, standSoundPlayed: false };
    runStartedAtRef.current = now + FALL_REVEAL_DURATION * 1000;
    setClearTimeMs(0);
    setWon(false);
    setStarted(true);
    requestPointerLockSafely(canvasRef.current);
  }, [prepareWorld, selectedSize, startBgm, stopAllSfx]);
  const reset = useCallback(() => {
    stopAllSfx();
    void startBgm();
    prepareWorld(selectedSize);
    runStartedAtRef.current = performance.now();
    setClearTimeMs(0);
    setWon(false);
    setStarted(true);
  }, [prepareWorld, selectedSize, startBgm, stopAllSfx]);
  const returnToTitle = useCallback(() => {
    stopAllSfx();
    document.exitPointerLock?.();
    setWon(false);
    setStarted(false);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) { context.fillStyle = "#080806"; context.fillRect(0, 0, canvas.width, canvas.height); }
  }, [stopAllSfx]);

  useEffect(() => {
    if (!started || won) return;
    const canvas = canvasRef.current!;
    const dustCanvas = dustCanvasRef.current!;
    const dustCtx = dustCanvas.getContext("2d")!;
    const webgl = createWebGLRenderer(canvas);
    const ctx = webgl ? null : canvas.getContext("2d", { alpha: false });
    if (!webgl && !ctx) return;
    if (ctx) canvas.dataset.renderer = "canvas2d";
    let frame = 0, previous = performance.now(), lastDebugUpdate = 0;
    const resize = () => { const scale = Math.min(devicePixelRatio, webgl ? 1.15 : 1.5); canvas.width = innerWidth * scale; canvas.height = innerHeight * scale; dustCanvas.width = canvas.width; dustCanvas.height = canvas.height; };
    resize(); addEventListener("resize", resize);
    const startFall = (pitX: number, pitY: number) => {
      if (fallTransitionRef.current) return;
      droppedRef.current++;
      removeIncorrectMarks(worldRef.current, wallMarksRef.current);
      revealedPitsRef.current.add(indexAt(pitX, pitY, worldRef.current.size));
      fallTransitionRef.current = { startedAt: performance.now(), pitX, pitY, warped: false, inputLocked: false, shakeSeed: Math.random() * Math.PI * 2, wakeSoundPlayed: false, standSoundPlayed: false };
    };
    const fallInputLocked = () => {
      const transition = fallTransitionRef.current;
      return Boolean(transition && performance.now() - transition.startedAt >= FALL_DROP_DELAY * 1000);
    };
    const playWallBreakSfx = (world: World, x: number, y: number) => {
      const nearbyDanger = countNearbyPits(world, x, y) >= 2;
      const source = nearbyDanger && Math.random() < .5
        ? "/sounds/crash-near.mp3"
        : `/sounds/crash-${Math.random() < .5 ? 1 : 2}.mp3`;
      playSfx(source);
    };
    const breakAimedWall = () => {
      if (fallInputLocked()) return;
      const world = worldRef.current, p = playerRef.current;
      const hit = cast(world, p, p.angle, settingsRef.current.renderDistance, revealedPitsRef.current);
      if ((hit.cell !== "wall" && hit.cell !== "pit" && hit.cell !== "goal") || cellCenterDistance(world, p, hit.cellX, hit.cellY) > BREAK_RADIUS) return;
      if (cellHasMark(world, wallMarksRef.current, hit.cellX, hit.cellY)) return;
      const projection = canvas.width / (2 * Math.tan(FOV / 2));
      const horizon = canvas.height * .5 - Math.tan(p.pitch) * projection;
      const cameraHeight = settingsRef.current.playerHeight;
      const top = horizon - (CEILING_HEIGHT - cameraHeight) * projection / Math.max(.025, hit.distance);
      const bottom = horizon + cameraHeight * projection / Math.max(.025, hit.distance);
      if (top > canvas.height * .5 || bottom < canvas.height * .5) return;
      if (hit.cell === "pit") {
        if (!fallTransitionRef.current) {
          void playBufferedSfx("/sounds/mine-broke.mp3", 3, 1);
          startFall(hit.cellX, hit.cellY);
        }
        return;
      }
      playWallBreakSfx(world, hit.cellX, hit.cellY);
      if (hit.cell === "goal") {
        exitOpeningRef.current = { x: hit.cellX, y: hit.cellY };
        exitReadyRef.current = false;
      }
      const hitIndex = indexAt(hit.cellX, hit.cellY, world.size);
      world.cells[hitIndex] = "open";
      clearCellMarks(world, wallMarksRef.current, hit.cellX, hit.cellY);
      if (hit.cell === "wall") openedWallsRef.current.add(hitIndex);
    };
    const markAimedWall = () => {
      if (fallInputLocked()) return;
      const world = worldRef.current, p = playerRef.current;
      const hit = cast(world, p, p.angle, settingsRef.current.renderDistance, revealedPitsRef.current);
      if ((hit.cell !== "wall" && hit.cell !== "pit" && hit.cell !== "goal") || cellCenterDistance(world, p, hit.cellX, hit.cellY) > MARK_RADIUS) return;
      const projection = canvas.width / (2 * Math.tan(FOV / 2));
      const horizon = canvas.height * .5 - Math.tan(p.pitch) * projection;
      const cameraHeight = settingsRef.current.playerHeight;
      const top = horizon - (CEILING_HEIGHT - cameraHeight) * projection / Math.max(.025, hit.distance);
      const bottom = horizon + cameraHeight * projection / Math.max(.025, hit.distance);
      if (top > canvas.height * .5 || bottom < canvas.height * .5) return;
      const key = wallFaceKey(world, hit.cellX, hit.cellY, hit.face);
      if (!wallMarksRef.current.delete(key)) wallMarksRef.current.add(key);
      playSfx("/sounds/marking.mp3", Math.random() * 4.2, .8);
    };
    breakActionRef.current = breakAimedWall;
    markActionRef.current = markAimedWall;
    const keydown = (e: KeyboardEvent) => {
      if (["KeyW","KeyA","KeyS","KeyD","KeyE","KeyF","KeyR","KeyQ","Tab","ShiftLeft","ShiftRight","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Enter"].includes(e.code)) e.preventDefault();
      if (fallInputLocked()) return;
      keysRef.current.add(e.code);
      if (e.code === settingsRef.current.breakKey && !e.repeat) breakAimedWall();
      if (e.code === settingsRef.current.markKey && !e.repeat) markAimedWall();
    };
    const keyup = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    const clearInputs = () => {
      keysRef.current.clear();
      stickRef.current = { x: 0, y: 0 };
      stickElementRef.current?.style.setProperty("--sx", "0px");
      stickElementRef.current?.style.setProperty("--sy", "0px");
    };
    const visibilitychange = () => { if (document.hidden) clearInputs(); };
    const pointerlockchange = () => { if (document.pointerLockElement !== canvas) clearInputs(); };
    const mousemove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas || fallInputLocked()) return;
      const sensitivity = settingsRef.current.mouseSensitivity / 100;
      playerRef.current.angle += e.movementX * BASE_MOUSE_YAW_SENSITIVITY * sensitivity;
      playerRef.current.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, playerRef.current.pitch + e.movementY * BASE_MOUSE_PITCH_SENSITIVITY * sensitivity));
    };
    addEventListener("keydown", keydown); addEventListener("keyup", keyup); addEventListener("mousemove", mousemove); addEventListener("blur", clearInputs);
    document.addEventListener("visibilitychange", visibilitychange); document.addEventListener("pointerlockchange", pointerlockchange);

    const tryMove = (dx: number, dy: number, canOpen: boolean) => {
      if (fallInputLocked()) return;
      const world = worldRef.current, p = playerRef.current;
      if (movementCrossesMarkedWall(world, wallMarksRef.current, p.x, p.y, dx, dy)) return;
      const nx = wrap(p.x + dx, world.size), ny = wrap(p.y + dy, world.size);
      const gx = Math.floor(nx), gy = Math.floor(ny), idx = indexAt(gx, gy, world.size), cell = world.cells[idx];
      const revealedPit = cell === "pit" && revealedPitsRef.current.has(idx);
      if (cell === "pillar") return;
      if ((cell === "wall" || cell === "pit" || cell === "goal") && !canOpen && !revealedPit) return;
      if ((cell === "wall" || cell === "pit" || cell === "goal") && cellHasMark(world, wallMarksRef.current, gx, gy)) return;
      if (cell === "wall" || cell === "goal") {
        playWallBreakSfx(world, gx, gy);
        world.cells[idx] = "open";
        clearCellMarks(world, wallMarksRef.current, gx, gy);
        if (cell === "wall") openedWallsRef.current.add(idx);
        if (cell === "goal") {
          exitOpeningRef.current = { x: gx, y: gy };
          exitReadyRef.current = false;
        }
      }
      if (cell === "pit") {
        if (!fallTransitionRef.current) {
          void playBufferedSfx("/sounds/mine-broke.mp3", 3, 1);
          startFall(gx, gy);
        }
        return;
      }
      p.x = nx; p.y = ny;
    };

    const loop = (now: number) => {
      const dt = Math.min(.2, (now - previous) / 1000); previous = now;
      const p = playerRef.current, keys = keysRef.current, stick = stickRef.current;
      let fall = fallTransitionRef.current;
      let fallElapsed = fall ? (now - fall.startedAt) / 1000 : 0;
      if (fall && !fall.inputLocked && fallElapsed >= FALL_DROP_DELAY) {
        clearInputs();
        fall.inputLocked = true;
      }
      const controlsLocked = Boolean(fall?.inputLocked);
      if (fall && !fall.warped && fallElapsed >= FALL_DROP_DURATION) {
        restoreOpenedWalls(worldRef.current, openedWallsRef.current);
        const warped = chooseWarp(worldRef.current, fall.pitX, fall.pitY);
        revealedPitsRef.current.delete(indexAt(fall.pitX, fall.pitY, worldRef.current.size));
        p.x = warped.x; p.y = warped.y; p.bobAmount = 0;
        p.angle = chooseOpenFacingAngle(worldRef.current, p.x, p.y);
        fall.warped = true;
      }
      if (fall && !fall.wakeSoundPlayed && fallElapsed >= FALL_REVEAL_START) {
        ensureBgm();
        playSfx(`/sounds/fall-${Math.random() < .5 ? 1 : 2}.mp3`);
        fall.wakeSoundPlayed = true;
      }
      if (fall && !fall.standSoundPlayed && fallElapsed >= FALL_REVEAL_START + FALL_WAKE_FLOOR_DURATION) {
        playSfx("/sounds/walking.mp3", 0, 1);
        fall.standSoundPlayed = true;
      }
      if (fall && fallElapsed >= FALL_TOTAL_DURATION) {
        fallTransitionRef.current = null;
        fall = null;
        fallElapsed = 0;
      }
      let forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0) - stick.y;
      let side = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + stick.x;
      if (!controlsLocked && keys.has("ArrowLeft")) p.angle -= 1.65 * dt;
      if (!controlsLocked && keys.has("ArrowRight")) p.angle += 1.65 * dt;
      if (!controlsLocked && keys.has("ArrowUp")) p.pitch = Math.max(MIN_PITCH, p.pitch - 1.1 * dt);
      if (!controlsLocked && keys.has("ArrowDown")) p.pitch = Math.min(MAX_PITCH, p.pitch + 1.1 * dt);
      const length = Math.hypot(forward, side); if (length > 1) { forward /= length; side /= length; }
      const moving = !controlsLocked && Boolean(forward || side);
      p.bobAmount += ((moving ? 1 : 0) - p.bobAmount) * Math.min(1, dt * 7);
      if (moving) p.bobPhase += dt * 6;
      const dashPressed = settingsRef.current.dashKey === "Shift"
        ? keys.has("ShiftLeft") || keys.has("ShiftRight")
        : keys.has("KeyQ");
      setMovementSfx(moving ? (dashPressed ? "running" : "walking") : null);
      if (!controlsLocked && (forward || side)) {
        const speed = SPEED * (dashPressed ? 2 : 1);
        const dx = (Math.cos(p.angle) * forward + Math.cos(p.angle + Math.PI/2) * side) * speed * dt;
        const dy = (Math.sin(p.angle) * forward + Math.sin(p.angle + Math.PI/2) * side) * speed * dt;
        const canOpen = settingsRef.current.chargeBreak && forward > Math.abs(side) * .5;
        tryMove(dx, 0, canOpen); tryMove(0, dy, canOpen);
      }
      const exitOpening = exitOpeningRef.current;
      const ceilingCell = exitOpening && aimedCeilingCell(worldRef.current, p, canvas.width, canvas.height, settingsRef.current.renderDistance, settingsRef.current.playerHeight, revealedPitsRef.current);
      const aimingExit = exitOpening && ceilingCell?.x === exitOpening.x && ceilingCell.y === exitOpening.y;
      if (!controlsLocked && aimingExit && exitReadyRef.current) {
        stopBgm();
        stopMovementSfx();
        playSfx("/sounds/exit.mp3");
        setClearTimeMs(now - runStartedAtRef.current);
        setWon(true);
        document.exitPointerLock?.();
        return;
      }
      if (exitOpening && !aimingExit) exitReadyRef.current = true;
      if (now - lastDebugUpdate >= 100) {
        lastDebugUpdate = now;
        const goal = goalRef.current;
        if (mineCounterElementRef.current) mineCounterElementRef.current.textContent = `${copy.markedMines} ${countMarkedCells(worldRef.current, wallMarksRef.current)} / ${totalPitsRef.current}`;
        if (debugElementRef.current) debugElementRef.current.textContent = `${copy.position}  ${p.x.toFixed(1)}, ${p.y.toFixed(1)}\n${copy.goal} ${goal.x}, ${goal.y}\n${copy.dropped}: ${droppedRef.current}`;
      }
      const inFallMotion = Boolean(fall && fallElapsed >= FALL_DROP_DELAY && fallElapsed < FALL_DROP_DURATION);
      const dropProgress = inFallMotion ? Math.max(0, Math.min(1, (fallElapsed - FALL_DROP_DELAY) / FALL_MOTION_DURATION)) : 0;
      const baseCameraHeight = settingsRef.current.playerHeight;
      let fallCameraHeight = baseCameraHeight;
      if (inFallMotion) {
        const motionElapsed = fallElapsed - FALL_DROP_DELAY;
        if (motionElapsed < FALL_RISE_DURATION) {
          const riseProgress = Math.max(0, Math.min(1, motionElapsed / FALL_RISE_DURATION));
          const riseEase = 1 - Math.pow(1 - riseProgress, 3);
          fallCameraHeight = baseCameraHeight + (1.8 - baseCameraHeight) * riseEase;
        } else {
          const descentProgress = Math.max(0, Math.min(1, (motionElapsed - FALL_RISE_DURATION) / FALL_DESCENT_DURATION));
          const descentEase = (1 - Math.exp(-10 * descentProgress)) / (1 - Math.exp(-10));
          fallCameraHeight = 1.8 + (.1 - 1.8) * descentEase;
        }
      }
      const strokeRandom = (key: number, salt: number) => {
        if (!fall || key === 0) return 0;
        const value = Math.sin(key * (91.7 + salt * 37.1) + fall.shakeSeed * (13.3 + salt)) * 43758.5453;
        return (value - Math.floor(value)) * 2 - 1;
      };
      const ceilingValue = fall ? Math.sin(fall.shakeSeed * 47.31) * 43758.5453 : 0;
      const ceilingStroke = Math.floor((ceilingValue - Math.floor(ceilingValue)) * 5);
      const strokePose = (stroke: number, endpoint: 0 | 1) => {
        const key = stroke * 2 + endpoint;
        return {
          yaw: strokeRandom(key, 1) * .46,
          pitch: endpoint === 1 && stroke === ceilingStroke ? -.66 - p.pitch : strokeRandom(key, 2) * .64,
          roll: strokeRandom(key, 3) * .16,
        };
      };
      const strokePosition = Math.min(4.99999, dropProgress * 5);
      const strokeIndex = Math.floor(strokePosition);
      const strokeT = strokePosition - strokeIndex;
      const strokeEase = strokeT * strokeT * (3 - 2 * strokeT);
      const strokeFrom = strokePose(strokeIndex, 0);
      const strokeTo = strokePose(strokeIndex, 1);
      const interpolateStroke = (from: number, to: number) => from + (to - from) * strokeEase;
      let fallYaw = inFallMotion ? interpolateStroke(strokeFrom.yaw, strokeTo.yaw) : 0;
      let fallPitch = inFallMotion ? interpolateStroke(strokeFrom.pitch, strokeTo.pitch) : 0;
      let fallRoll = inFallMotion ? interpolateStroke(strokeFrom.roll, strokeTo.roll) : 0;
      const wakeElapsed = fall ? fallElapsed - FALL_REVEAL_START : -1;
      const inWakeMotion = wakeElapsed >= 0 && wakeElapsed < FALL_REVEAL_DURATION;
      const seededUnit = (salt: number) => {
        if (!fall) return 0;
        const value = Math.sin(fall.shakeSeed * (31.7 + salt * 11.9) + salt * 73.1) * 43758.5453;
        return value - Math.floor(value);
      };
      const wakeSidePitch = .06 + seededUnit(4) * .16;
      const wakeYaw = 0;
      const wakeRoll = (seededUnit(6) < .5 ? -1 : 1) * (.85 + seededUnit(7) * .42);
      if (inWakeMotion) {
        if (wakeElapsed < FALL_WAKE_FLOOR_DURATION) {
          fallCameraHeight = .2;
          fallYaw = wakeYaw;
          fallPitch = wakeSidePitch - p.pitch;
          fallRoll = wakeRoll;
        } else {
          const recovery = Math.max(0, Math.min(1, (wakeElapsed - FALL_WAKE_FLOOR_DURATION) / FALL_WAKE_RISE_DURATION));
          const recoveryEase = recovery * recovery * (3 - 2 * recovery);
          const recoveryEnvelope = 1 - recoveryEase;
          const wobbleEnvelope = Math.sin(Math.PI * recovery) * recoveryEnvelope;
          fallCameraHeight = .2 + (baseCameraHeight - .2) * recoveryEase;
          fallYaw = wakeYaw * recoveryEnvelope + Math.sin(recovery * Math.PI * 5) * .065 * wobbleEnvelope;
          fallPitch = (wakeSidePitch - p.pitch) * recoveryEnvelope + Math.sin(recovery * Math.PI * 6) * .052 * wobbleEnvelope;
          fallRoll = wakeRoll * recoveryEnvelope + Math.sin(recovery * Math.PI * 4) * .085 * wobbleEnvelope;
        }
      }
      const cameraDrop = baseCameraHeight - fallCameraHeight;
      const blurWave = inFallMotion ? Math.sin(Math.PI * 3 * dropProgress) : 0;
      let fallBlur = 7 * blurWave * blurWave;
      if (inWakeMotion) {
        if (wakeElapsed < FALL_WAKE_FLOOR_DURATION) {
          const focus = Math.max(0, Math.min(1, wakeElapsed / FALL_WAKE_FLOOR_DURATION));
          const focusEase = focus * focus * (3 - 2 * focus);
          fallBlur = 8 * (1 - focusEase);
        } else {
          const recovery = Math.max(0, Math.min(1, (wakeElapsed - FALL_WAKE_FLOOR_DURATION) / FALL_WAKE_RISE_DURATION));
          const blurKeyframes = [0, 4, 0, 2, 0, 1, 0];
          const blurPosition = Math.min(5.99999, recovery * (blurKeyframes.length - 1));
          const blurIndex = Math.floor(blurPosition);
          const blurT = blurPosition - blurIndex;
          const blurEase = blurT * blurT * (3 - 2 * blurT);
          fallBlur = blurKeyframes[blurIndex] + (blurKeyframes[blurIndex + 1] - blurKeyframes[blurIndex]) * blurEase;
        }
      }
      fallBlurRef.current?.style.setProperty("--fall-blur", `${fallBlur.toFixed(2)}px`);
      const cameraScale = inFallMotion ? 1.28 : inWakeMotion ? 1 + Math.min(.8, Math.abs(fallRoll) * .7) : 1;
      const cameraTransform = inFallMotion || inWakeMotion ? `scale(${cameraScale}) rotate(${fallRoll}rad)` : "";
      canvas.style.transform = cameraTransform;
      dustCanvas.style.transform = cameraTransform;
      const wakeFov = inWakeMotion ? 2 * Math.atan(Math.tan(FOV / 2) * cameraScale) : FOV;
      const cameraHeight = settingsRef.current.playerHeight - cameraDrop;
      const projection = canvas.width / (2 * Math.tan(wakeFov / 2));
      const bobY = (Math.abs(Math.cos(p.bobPhase)) - .5) * canvas.height * .006 * p.bobAmount;
      const viewAngle = p.angle + Math.sin(p.bobPhase) * .003 * p.bobAmount + fallYaw;
      const viewPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, p.pitch + fallPitch));
      const aimedHit = cast(worldRef.current, p, viewAngle, settingsRef.current.renderDistance, revealedPitsRef.current);
      const aimedTop = canvas.height * .5 - Math.tan(viewPitch) * projection + bobY - (CEILING_HEIGHT-cameraHeight)*projection/Math.max(.025,aimedHit.distance);
      const aimedBottom = canvas.height * .5 - Math.tan(viewPitch) * projection + bobY + cameraHeight*projection/Math.max(.025,aimedHit.distance);
      const hover = settingsRef.current.wallPulse && !cellHasMark(worldRef.current,wallMarksRef.current,aimedHit.cellX,aimedHit.cellY)
        && (aimedHit.cell === "wall" || aimedHit.cell === "pit" || aimedHit.cell === "goal")
        && cellCenterDistance(worldRef.current,p,aimedHit.cellX,aimedHit.cellY) <= BREAK_RADIUS
        && aimedTop <= canvas.height*.5 && aimedBottom >= canvas.height*.5 ? { x: aimedHit.cellX, y: aimedHit.cellY } : null;
      if (webgl) {
        const cache = getWorldRenderCache(worldRef.current);
        webgl.render({ world: worldRef.current, playerX:p.x, playerY:p.y, angle:viewAngle, pitch:viewPitch, cameraHeight, ceilingHeight:CEILING_HEIGHT, fov:wakeFov, maxDistance:settingsRef.current.renderDistance, now, flicker:settingsRef.current.flicker, exit:exitOpening, hover, wallMarks:wallMarksRef.current, revealedPits:revealedPitsRef.current, pitHints:cache.pitHints, lamps:cache.lamps, lampLight:cache.lampLight, bobY });
        dustCtx.clearRect(0,0,dustCanvas.width,dustCanvas.height);
        if (settingsRef.current.dust) {
          const wallDepth = new Float32Array(RAYS); wallDepth.fill(settingsRef.current.renderDistance);
          for (let ray=0;ray<RAYS;ray++) {
            const relative=(ray/(RAYS-1)-.5)*wakeFov;
            const hit=cast(worldRef.current,p,viewAngle+relative,settingsRef.current.renderDistance,revealedPitsRef.current);
            if (hit.cell!=="open") wallDepth[ray]=hit.distance*Math.cos(relative);
          }
          const forwardX=Math.cos(viewAngle), forwardY=Math.sin(viewAngle), rightX=-forwardY, rightY=forwardX;
          const horizon=canvas.height*.5-Math.tan(viewPitch)*projection+bobY;
          drawDustMotes(dustCtx,canvas.width,canvas.height,worldRef.current,p,now,settingsRef.current.renderDistance,cameraHeight,projection,horizon,forwardX,forwardY,rightX,rightY,wallDepth,cache.lamps);
        }
      } else if (ctx) {
        dustCtx.clearRect(0,0,dustCanvas.width,dustCanvas.height);
        renderCanvas2D(ctx, canvas.width, canvas.height, worldRef.current, p, now, exitOpening, settingsRef.current, wallMarksRef.current, revealedPitsRef.current, cameraDrop, fallYaw, fallPitch, wakeFov);
      }
      let darkness = 0;
      if (fall) {
        if (fallElapsed >= FALL_FADE_START && fallElapsed < FALL_DROP_DURATION) darkness = (fallElapsed - FALL_FADE_START) / (FALL_DROP_DURATION - FALL_FADE_START);
        else if (fallElapsed >= FALL_DROP_DURATION && fallElapsed < FALL_REVEAL_START) darkness = 1;
        else if (fallElapsed >= FALL_REVEAL_START) {
          const reveal = Math.max(0, Math.min(1, (fallElapsed - FALL_REVEAL_START) / FALL_REVEAL_FADE_DURATION));
          darkness = 1 - reveal * reveal * (3 - 2 * reveal);
        }
      }
      if (fallDarknessRef.current) fallDarknessRef.current.style.opacity = String(darkness);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      breakActionRef.current = null; markActionRef.current = null;
      stopMovementSfx();
      webgl?.dispose(); if (!webgl) delete canvas.dataset.renderer;
      cancelAnimationFrame(frame); canvas.style.transform = ""; dustCanvas.style.transform = ""; dustCtx.clearRect(0,0,dustCanvas.width,dustCanvas.height); fallBlurRef.current?.style.setProperty("--fall-blur", "0px"); if (fallDarknessRef.current) fallDarknessRef.current.style.opacity = "0"; clearInputs(); removeEventListener("resize", resize); removeEventListener("keydown", keydown); removeEventListener("keyup", keyup); removeEventListener("mousemove", mousemove); removeEventListener("blur", clearInputs);
      document.removeEventListener("visibilitychange", visibilitychange); document.removeEventListener("pointerlockchange", pointerlockchange);
    };
  }, [started, won, activeLanguage, copy, ensureBgm, playBufferedSfx, playSfx, setMovementSfx, stopBgm, stopMovementSfx]);

  useEffect(() => {
    if (!started || won) return;
    let lookPointerId: number | null = null, lastX = 0, lastY = 0;
    const fallInputLocked = () => { const fall = fallTransitionRef.current; return Boolean(fall && performance.now() - fall.startedAt >= FALL_DROP_DELAY * 1000); };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || lookPointerId !== null || fallInputLocked()) return;
      if (e.target instanceof Element && e.target.closest(".mobile-stick, .mobile-actions")) return;
      if (e.clientX <= innerWidth * .36) return;
      lookPointerId = e.pointerId; lastX = e.clientX; lastY = e.clientY;
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || e.pointerId !== lookPointerId) return;
      if (!fallInputLocked()) {
        playerRef.current.angle += (e.clientX-lastX)*.006;
        playerRef.current.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, playerRef.current.pitch + (e.clientY-lastY)*.004));
      }
      lastX=e.clientX; lastY=e.clientY;
      e.preventDefault();
    };
    const up = (e: PointerEvent) => { if (e.pointerId === lookPointerId) { lookPointerId = null; lastX = 0; lastY = 0; } };
    addEventListener("pointerdown",down,{passive:false}); addEventListener("pointermove",move,{passive:false}); addEventListener("pointerup",up); addEventListener("pointercancel",up);
    return () => { removeEventListener("pointerdown",down); removeEventListener("pointermove",move); removeEventListener("pointerup",up); removeEventListener("pointercancel",up); };
  }, [started, won]);

  const stickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const fall = fallTransitionRef.current;
    if (fall && performance.now() - fall.startedAt >= FALL_DROP_DELAY * 1000) return;
    const box=e.currentTarget.getBoundingClientRect(), dx=e.clientX-(box.left+box.width/2), dy=e.clientY-(box.top+box.height/2), mag=Math.max(1,Math.hypot(dx,dy)), limit=30;
    stickRef.current={x:dx/Math.max(limit,mag),y:dy/Math.max(limit,mag)};
    e.currentTarget.style.setProperty("--sx",`${dx*Math.min(1,limit/mag)}px`); e.currentTarget.style.setProperty("--sy",`${dy*Math.min(1,limit/mag)}px`);
  };
  const stickEnd = (e: React.PointerEvent<HTMLDivElement>) => { stickRef.current={x:0,y:0}; e.currentTarget.style.setProperty("--sx","0px"); e.currentTarget.style.setProperty("--sy","0px"); };

  return <main className="game" onClick={() => started && !won && requestPointerLockSafely(canvasRef.current)}>
    <canvas ref={canvasRef} aria-label="Mineroomsの一人称ゲーム画面" />
    <canvas ref={dustCanvasRef} className="dust-layer" aria-hidden="true" />
    {settings.renderMode === "dreamy" && <div className="dream-filter"/>}<div ref={fallBlurRef} className="fall-blur"/><div ref={fallDarknessRef} className="fall-darkness"/><div className="grain"/><div className="vignette"/>
    {started && <div className="hud"><div className="status">ROOM {selectedSize} × {selectedSize}<span ref={mineCounterElementRef} className="mine-counter">{copy.markedMines} 0 / {totalPitsRef.current}</span><span ref={debugElementRef} className="debug-coords"/></div><div className="crosshair"/>
      <div ref={stickElementRef} className="mobile-stick" aria-label="移動スティック" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);stickMove(e)}} onPointerMove={e=>e.currentTarget.hasPointerCapture(e.pointerId)&&stickMove(e)} onPointerUp={stickEnd} onPointerCancel={stickEnd}><div className="stick-knob"/></div>
      <div className="mobile-actions"><button type="button" aria-label={activeLanguage === "ja" ? "壁を壊す" : "Break wall"} onClick={e=>{e.stopPropagation();breakActionRef.current?.()}}><img src="/hammer.svg" alt=""/></button><button type="button" aria-label={activeLanguage === "ja" ? "フラグを付ける、または外す" : "Toggle flag"} onClick={e=>{e.stopPropagation();markActionRef.current?.()}}><img src="/flag.svg" alt=""/></button></div>
    </div>}
    {!started && <div className={`intro ${settingsOpen ? "settings-open" : ""}`} onClick={() => settingsOpen && cancelSettings()}><div className={`panel ${settingsOpen ? "settings-panel" : ""}`} onClick={e => e.stopPropagation()}>{settingsOpen ? <>
      <div className="settings-heading"><h2>{copy.settings}</h2><div className="settings-heading-actions"><button type="button" onClick={cancelSettings}>{copy.cancel}</button><button type="button" onClick={resetSettings}>{copy.reset}</button><button type="button" className="apply" onClick={applySettings}>{copy.apply}</button></div></div>
      <section className="settings-group"><h3>{copy.config}</h3>
        <div className="setting-row"><span>{copy.breakKey}</span><div className="setting-options">{[["KeyR","R"],["Space","Space"],["Enter","Enter"]].map(([value,label]) => <button key={value} className={settings.breakKey === value ? "selected" : ""} onClick={() => updateSettings({ breakKey: value as BreakKey })}>{label}</button>)}</div></div>
        <div className="setting-row"><span>{copy.markKey}</span><div className="setting-options">{[["KeyF","F"],["KeyE","E"],["Tab","Tab"]].map(([value,label]) => <button key={value} className={settings.markKey === value ? "selected" : ""} onClick={() => updateSettings({ markKey: value as MarkKey })}>{label}</button>)}</div></div>
        <div className="setting-row"><span>{copy.dashKey}</span><div className="setting-options">{[["Shift","Shift"],["KeyQ","Q"]].map(([value,label]) => <button key={value} className={settings.dashKey === value ? "selected" : ""} onClick={() => updateSettings({ dashKey: value as DashKey })}>{label}</button>)}</div></div>
        <label className="setting-slider"><span>{copy.mouseSensitivity} <output>{settings.mouseSensitivity}%</output></span><input type="range" min={MIN_MOUSE_SENSITIVITY} max={MAX_MOUSE_SENSITIVITY} step="5" value={settings.mouseSensitivity} style={rangeStyle(settings.mouseSensitivity, MIN_MOUSE_SENSITIVITY, MAX_MOUSE_SENSITIVITY)} onChange={e => updateSettings({ mouseSensitivity: Number(e.target.value) })}/></label>
        <div className="setting-row toggle-setting" onClick={() => updateSettings({ chargeBreak: !settings.chargeBreak })}><span>{copy.noclip}</span><button className={`toggle ${settings.chargeBreak ? "on" : ""}`} aria-label={`${copy.noclip}: ${settings.chargeBreak ? copy.on : copy.off}`} aria-pressed={settings.chargeBreak} onClick={e => { e.stopPropagation(); updateSettings({ chargeBreak: !settings.chargeBreak }); }}><i/></button></div>
      </section>
      <section className="settings-group"><h3>{copy.graphics}</h3>
        <div className="setting-row"><span>{copy.renderingMode}</span><div className="setting-options"><button className={settings.renderMode === "dreamy" ? "selected" : ""} onClick={() => updateSettings({ renderMode: "dreamy" })}>{copy.dreamy}</button><button className={settings.renderMode === "realistic" ? "selected" : ""} onClick={() => updateSettings({ renderMode: "realistic" })}>{copy.realistic}</button></div></div>
        <div className="setting-row toggle-setting" onClick={() => updateSettings({ flicker: !settings.flicker })}><span>{copy.flicker}</span><button className={`toggle ${settings.flicker ? "on" : ""}`} aria-label={`${copy.flicker}: ${settings.flicker ? copy.on : copy.off}`} aria-pressed={settings.flicker} onClick={e => { e.stopPropagation(); updateSettings({ flicker: !settings.flicker }); }}><i/></button></div>
        <div className="setting-row toggle-setting" onClick={() => updateSettings({ dust: !settings.dust })}><span>{copy.dust}</span><button className={`toggle ${settings.dust ? "on" : ""}`} aria-label={`${copy.dust}: ${settings.dust ? copy.on : copy.off}`} aria-pressed={settings.dust} onClick={e => { e.stopPropagation(); updateSettings({ dust: !settings.dust }); }}><i/></button></div>
        <div className="setting-row toggle-setting" onClick={() => updateSettings({ wallPulse: !settings.wallPulse })}><span>{copy.wallPulse}</span><button className={`toggle ${settings.wallPulse ? "on" : ""}`} aria-label={`${copy.wallPulse}: ${settings.wallPulse ? copy.on : copy.off}`} aria-pressed={settings.wallPulse} onClick={e => { e.stopPropagation(); updateSettings({ wallPulse: !settings.wallPulse }); }}><i/></button></div>
        <label className="setting-slider"><span>{copy.renderDistance} <output>{settings.renderDistance} m</output></span><small>{copy.renderWarning}</small><input type="range" min={MIN_RENDER_DISTANCE} max={MAX_RENDER_DISTANCE} value={settings.renderDistance} style={rangeStyle(settings.renderDistance, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE)} onChange={e => updateSettings({ renderDistance: Number(e.target.value) })}/></label>
        <label className="setting-slider"><span>{copy.playerHeight} <output>{settings.playerHeight.toFixed(2)} m</output></span><input type="range" min={MIN_PLAYER_HEIGHT} max={MAX_PLAYER_HEIGHT} step="0.05" value={settings.playerHeight} style={rangeStyle(settings.playerHeight, MIN_PLAYER_HEIGHT, MAX_PLAYER_HEIGHT)} onChange={e => updateSettings({ playerHeight: Number(e.target.value) })}/></label>
      </section>
      <section className="settings-group"><h3>{copy.sound}</h3>
        <div className="setting-row toggle-setting" onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })}><span>{copy.masterSound}</span><button className={`toggle ${settings.soundEnabled ? "on" : ""}`} aria-label={`${copy.masterSound}: ${settings.soundEnabled ? copy.on : copy.off}`} aria-pressed={settings.soundEnabled} onClick={e => { e.stopPropagation(); updateSettings({ soundEnabled: !settings.soundEnabled }); }}><i/></button></div>
        <label className="setting-slider"><span>BGM <output>{settings.bgm}%</output></span><input type="range" min="0" max="100" value={settings.bgm} style={rangeStyle(settings.bgm, 0, 100)} onChange={e => updateSettings({ bgm: Number(e.target.value) })}/></label>
        <label className="setting-slider"><span>SE <output>{settings.sfx}%</output></span><input type="range" min="0" max="100" value={settings.sfx} style={rangeStyle(settings.sfx, 0, 100)} onChange={e => updateSettings({ sfx: Number(e.target.value) })}/></label>
      </section>
    </> : <><h1>Minerooms</h1><div className="level-picker"><div className="level-options">{[10,20,30,50].map(size => <button key={size} className={selectedSize === size ? "selected" : ""} aria-pressed={selectedSize === size} onClick={() => setSelectedSize(size)}>x{size}</button>)}</div></div><div className="title-actions"><button className="enter primary-enter" onClick={begin}>{copy.enter}</button><div className="title-options"><div className="title-secondary"><button className="enter" type="button" onClick={() => setInfoModal("howto")}><span className="title-icon question-icon" aria-hidden="true"/>{copy.howToPlay}</button><button className="enter" type="button" onClick={openSettings}><span className="title-icon gear-icon" aria-hidden="true"/>{copy.settings}</button></div><div className="language-picker"><button className="language-trigger" type="button" aria-haspopup="listbox" aria-expanded={languageMenuOpen} onClick={() => setLanguageMenuOpen(open => !open)}><span className="title-control-label"><span className="title-icon language-icon" aria-hidden="true"/>Language: {languageLabel}</span><span aria-hidden="true">▼</span></button>{languageMenuOpen && <div className="language-menu" role="listbox" aria-label="Language"><button type="button" role="option" aria-selected={activeLanguage === "en"} onClick={() => selectLanguage("en")}>{copy.english}</button><button type="button" role="option" aria-selected={activeLanguage === "ja"} onClick={() => selectLanguage("ja")}>{copy.japanese}</button></div>}</div></div></div></>}</div>{!settingsOpen && <nav className="title-links" aria-label={copy.gameInfo}><button onClick={() => setInfoModal("credits")}>{copy.credits}</button><span>•</span><button onClick={() => setInfoModal("licenses")}>{copy.licenses}</button><span>•</span><a href="https://github.com/mitorime/minerooms" target="_blank" rel="noreferrer" aria-label={copy.githubAria}>{copy.github}</a></nav>}</div>}
    {infoModal && !started && <div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={() => setInfoModal(null)}><div className={`info-panel ${infoModal}-panel`} onClick={e => e.stopPropagation()}><button className="info-close" aria-label={copy.close} onClick={() => setInfoModal(null)}>×</button>{infoModal === "credits" ? <>
      <h2 id="info-title">{copy.credits}</h2>
      <div className="copyleft">(ↄ) opyleft 2026 mitori / studio pseudohalo<br/>all rights re<strong>V</strong>er<strong>S</strong>ed.</div>
      <section><h3>DESIGNED AND DEVELOPED</h3><p><strong>mitori</strong> <span className="credit-note">(studio pseudohalo)</span></p></section>
      <section><h3>DEVELOPMENT SUPPORTED</h3><p><strong>琴瑟</strong></p></section>
      <section><h3>BACKGROUND MUSIC COMPOSED</h3><p><strong>mitori</strong> <span className="credit-note">(studio pseudohalo)</span></p></section>
      <section><h3>SOUND EFFECTS</h3><p><strong>Splice audio samples under license</strong></p></section>
      <section><h3>INSPIRED BY</h3><p><strong>Minesweeper</strong> (1990s Videogame)<br/><small>by Microsoft</small></p><p><strong>Backrooms creepypasta</strong> (2019-)<br/><small>The original image posted by anonymous user 4chan, HobbyTown USA of Oshkosh, Wisconsin (2003)</small></p><p><strong>Backrooms</strong> (2026 Film)<br/><small>by Kane Parsons, A24</small></p></section>
    </> : infoModal === "licenses" ? <>
      <h2 id="info-title">{copy.licenses}</h2>
      <p className="license-intro">Open-source software used by Minerooms.</p>
      <section><h3>MINEROOMS</h3><p>Original source code and assets — GNU GPL v3.0<br/><small>Third-party software, icons, and licensed audio retain their respective terms.</small></p></section>
      <section><h3>RUNTIME</h3><p>Drizzle ORM 0.45.2 — Apache-2.0<br/>React 19.2.6 — MIT<br/>React DOM 19.2.6 — MIT</p></section>
      <section><h3>BUILD AND DEVELOPMENT</h3><p>@cloudflare/vite-plugin, @eslint/js, @next/eslint-plugin-next, @openai/sites-vite-plugin, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom, @vitejs/plugin-react, @vitejs/plugin-rsc, drizzle-kit, ESLint, eslint-plugin-jsx-a11y, eslint-plugin-react, eslint-plugin-react-hooks, globals, react-server-dom-webpack, Tailwind CSS, typescript-eslint, Vinext and Vite — MIT</p><p>TypeScript — Apache-2.0<br/>Wrangler — MIT OR Apache-2.0</p></section>
      <section><h3>ICONS</h3><p>Bootstrap Icons — MIT<br/><small>Copyright © 2019–2024 The Bootstrap Authors</small></p><p>Akar Icons — MIT<br/><small>Designed by Arturo Wibawa</small></p></section>
    </> : <HowToPlayContent language={activeLanguage}/>}</div></div>}
    {won && <div className="ending"><div className="panel"><h1 className="escape-title">{activeLanguage === "ja" ? <><span>Room x{selectedSize}</span><span className="escape-room">から脱出した。</span></> : <><span>Escaped from</span><span className="escape-room">the room x{selectedSize}.</span></>}</h1><div className="clear-time">{copy.elapsed}:&nbsp;&nbsp;{formatClearTime(clearTimeMs)}</div><div className="ending-actions"><button className="enter" onClick={returnToTitle}>{copy.backToTitle}</button><button className="enter" onClick={reset}>{copy.nextRoom}</button></div></div></div>}
  </main>;
}
