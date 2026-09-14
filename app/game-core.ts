export const MAP_SIZE = 30;
export type Cell = "wall" | "open" | "pit" | "goal" | "pillar";
export type World = { size: number; cells: Cell[]; start: { x: number; y: number }; seed: number };

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const wrap = (n: number, size = MAP_SIZE) => ((n % size) + size) % size;
export const indexAt = (x: number, y: number, size = MAP_SIZE) => wrap(y, size) * size + wrap(x, size);

export function createWorld(seed = Date.now() >>> 0, size = MAP_SIZE): World {
  const random = mulberry32(seed);
  const cells: Cell[] = Array(size * size).fill("wall");
  const neighbors = (i: number) => {
    const x = i % size, y = Math.floor(i / size);
    return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]].map(([nx,ny]) => indexAt(nx,ny,size));
  };
  const shuffle = <T,>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };

  // 1. Build a rectilinear 50:50 field from overlapping rooms, corridors,
  // bends, branches and occasional one-cell partitions.
  const targetOpen = Math.round(cells.length * .5);
  let openCount = 0;
  const setOpen = (x: number, y: number) => {
    const i = indexAt(x, y, size);
    if (cells[i] === "wall") { cells[i] = "open"; openCount++; }
  };
  const setWall = (x: number, y: number) => {
    const i = indexAt(x, y, size);
    if (cells[i] === "open") { cells[i] = "wall"; openCount--; }
  };
  const carveRect = (x: number, y: number, width: number, height: number) => {
    for (let oy = 0; oy < height; oy++) for (let ox = 0; ox < width; ox++) setOpen(x + ox, y + oy);
  };
  const maxRoom = Math.max(4, Math.min(10, Math.round(size * .22)));
  let attempts = 0;
  while (openCount < targetOpen && attempts++ < cells.length * 3) {
    if (random() < .48) {
      const width = 2 + Math.floor(random() * (maxRoom - 1));
      const height = 2 + Math.floor(random() * (maxRoom - 1));
      const x = Math.floor(random() * size), y = Math.floor(random() * size);
      carveRect(x, y, width, height);
      if (width >= 5 && height >= 5 && random() < .46) {
        const vertical = random() < .5;
        const line = 1 + Math.floor(random() * ((vertical ? width : height) - 2));
        const gap = 1 + Math.floor(random() * ((vertical ? height : width) - 2));
        for (let step = 0; step < (vertical ? height : width); step++) {
          if (Math.abs(step - gap) <= (random() < .2 ? 1 : 0)) continue;
          setWall(x + (vertical ? line : step), y + (vertical ? step : line));
        }
      }
    } else {
      let x = Math.floor(random() * size), y = Math.floor(random() * size);
      let horizontal = random() < .5;
      const width = random() < .72 ? 2 : 1 + Math.floor(random() * 3);
      const segments = 1 + Math.floor(random() * 3);
      for (let segment = 0; segment < segments; segment++) {
        const length = 3 + Math.floor(random() * Math.max(3, Math.min(size * .38, 13)));
        carveRect(x, y, horizontal ? length : width, horizontal ? width : length);
        if (random() < .5) {
          const branchAt = 1 + Math.floor(random() * Math.max(1, length - 2));
          const branchLength = 2 + Math.floor(random() * Math.max(2, length * .65));
          carveRect(x + (horizontal ? branchAt : 0), y + (horizontal ? 0 : branchAt), horizontal ? width : branchLength, horizontal ? branchLength : width);
        }
        if (horizontal) x += length - width; else y += length - width;
        horizontal = !horizontal;
      }
    }
  }
  while (openCount > targetOpen) {
    const candidates = cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell === "open")
      .sort((a, b) => neighbors(b.i).filter(n => cells[n] === "wall").length - neighbors(a.i).filter(n => cells[n] === "wall").length || random() - .5);
    if (!candidates.length) break;
    cells[candidates[0].i] = "wall"; openCount--;
  }
  while (openCount < targetOpen) {
    const candidates = cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell === "wall")
      .sort((a, b) => neighbors(b.i).filter(n => cells[n] === "open").length - neighbors(a.i).filter(n => cells[n] === "open").length || random() - .5);
    if (!candidates.length) break;
    cells[candidates[0].i] = "open"; openCount++;
  }

  // Even out broad regional density without dissolving the rectilinear forms.
  // Each swap extends an existing open/wall edge instead of sprinkling noise.
  const sectorCount = Math.max(3, Math.min(6, Math.round(size / 8)));
  const sectors: number[][] = Array.from({ length: sectorCount * sectorCount }, () => []);
  for (let i = 0; i < cells.length; i++) {
    const x = i % size, y = Math.floor(i / size);
    const sx = Math.min(sectorCount - 1, Math.floor(x * sectorCount / size));
    const sy = Math.min(sectorCount - 1, Math.floor(y * sectorCount / size));
    sectors[sy * sectorCount + sx].push(i);
  }
  for (let pass = 0; pass < cells.length; pass++) {
    const ranked = sectors.map((indices, sector) => ({
      sector,
      density: indices.filter(i => cells[i] === "open").length / indices.length,
    })).sort((a, b) => a.density - b.density);
    const sparse = ranked[0], dense = ranked[ranked.length - 1];
    if (sparse.density >= .44 && dense.density <= .56) break;
    const wallToOpen = sectors[sparse.sector].filter(i => cells[i] === "wall")
      .sort((a, b) => neighbors(b).filter(n => cells[n] === "open").length - neighbors(a).filter(n => cells[n] === "open").length || random() - .5)[0];
    const openToWall = sectors[dense.sector].filter(i => cells[i] === "open")
      .sort((a, b) => neighbors(b).filter(n => cells[n] === "wall").length - neighbors(a).filter(n => cells[n] === "wall").length || random() - .5)[0];
    if (wallToOpen === undefined || openToWall === undefined) break;
    cells[wallToOpen] = "open";
    cells[openToWall] = "wall";
  }

  // 2. Convert exactly 25% of the initial walls to pits. Prefer candidates
  // separated by at least two grid steps, relaxing only if necessary.
  const wallCandidates = shuffle(cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell === "wall").map(({ i }) => i));
  const pitTarget = Math.round(wallCandidates.length * .25);
  const pits: number[] = [];
  const pitSet = new Set<number>();
  const isBlocked = (i: number) => cells[i] === "pit" || cells[i] === "pillar";
  const wouldIsolateNeighbor = (candidate: number) => neighbors(candidate).some(neighbor =>
    !isBlocked(neighbor) && neighbors(neighbor).every(next => next === candidate || isBlocked(next)),
  );
  const torusManhattan = (a: number, b: number) => {
    const ax = a % size, ay = Math.floor(a / size), bx = b % size, by = Math.floor(b / size);
    const dx = Math.min(Math.abs(ax - bx), size - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), size - Math.abs(ay - by));
    return dx + dy;
  };
  for (const spacing of [3, 2, 1]) {
    for (const i of wallCandidates) {
      if (pits.length >= pitTarget) break;
      if (pitSet.has(i) || wouldIsolateNeighbor(i) || pits.some(pit => torusManhattan(i, pit) < spacing)) continue;
      pits.push(i); pitSet.add(i);
      cells[i] = "pit";
    }
  }
  if (pits.length !== pitTarget) throw new Error("World generation could not distribute the requested pits safely.");

  // 3. Convert 4% of the original open space to structural pillars.
  const openCandidates = shuffle(cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell === "open").map(({ i }) => i));
  const pillarTarget = Math.round(openCandidates.length * .04);
  let pillarCount = 0;
  for (const i of openCandidates) {
    if (pillarCount >= pillarTarget) break;
    if (wouldIsolateNeighbor(i)) continue;
    cells[i] = "pillar"; pillarCount++;
  }
  if (pillarCount !== pillarTarget) throw new Error("World generation could not distribute the requested pillars safely.");

  // 4. Choose a roomy spawn that belongs to a component containing at least
  // one safe wall. Then select a reachable wall in that same component as goal.
  const roominess = (i: number) => {
    const x = i % size, y = Math.floor(i / size);
    let score = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (cells[indexAt(x + dx, y + dy, size)] === "open") score += Math.max(1, 4 - Math.abs(dx) - Math.abs(dy));
    }
    return score;
  };
  const distanceToWall = new Int32Array(cells.length); distanceToWall.fill(-1);
  const reverseQueue: number[] = [];
  for (let i = 0; i < cells.length; i++) if (cells[i] === "wall") { distanceToWall[i] = 0; reverseQueue.push(i); }
  for (let head = 0; head < reverseQueue.length; head++) {
    const i = reverseQueue[head];
    for (const neighbor of neighbors(i)) {
      if (distanceToWall[neighbor] >= 0 || cells[neighbor] === "pit" || cells[neighbor] === "pillar") continue;
      distanceToWall[neighbor] = distanceToWall[i] + 1; reverseQueue.push(neighbor);
    }
  }
  const spawnCandidates = cells.map((cell, i) => ({ cell, i, score: roominess(i) }))
    .filter(({ cell, i }) => cell === "open" && distanceToWall[i] >= 0)
    .sort((a, b) => b.score - a.score);
  const bestScore = spawnCandidates[0]?.score ?? 0;
  const roomySpawns = spawnCandidates.filter(candidate => candidate.score >= bestScore * .9);
  const startIndex = roomySpawns[Math.floor(random() * roomySpawns.length)]?.i ?? cells.findIndex(cell => cell === "open");
  const start = { x: startIndex % size, y: Math.floor(startIndex / size) };

  const distances = new Int32Array(cells.length); distances.fill(-1); distances[startIndex] = 0;
  const queue = [startIndex];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const neighbor of neighbors(i)) {
      if (distances[neighbor] >= 0 || cells[neighbor] === "pit" || cells[neighbor] === "pillar") continue;
      distances[neighbor] = distances[i] + 1; queue.push(neighbor);
    }
  }
  const reachableWalls = cells.map((cell, i) => ({ cell, i, distance: distances[i] }))
    .filter(({ cell, distance }) => cell === "wall" && distance > 0)
    .sort((a, b) => b.distance - a.distance);
  const distantCutoff = reachableWalls[Math.floor(reachableWalls.length * .35)]?.distance ?? 1;
  const goalCandidates = reachableWalls.filter(candidate => candidate.distance >= distantCutoff);
  const goal = goalCandidates[Math.floor(random() * goalCandidates.length)] ?? reachableWalls[0];
  if (!goal) throw new Error("World generation produced no reachable goal cell.");
  cells[goal.i] = "goal";
  return { size, cells, start, seed };
}

export function countNearbyPits(world: World, x: number, y: number) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if ((dx || dy) && world.cells[indexAt(x + dx, y + dy, world.size)] === "pit") count++;
  }
  return count;
}

export function chooseWarp(world: World, x: number, y: number) {
  const visited = new Uint8Array(world.cells.length);
  const options: number[] = [];
  for (let i = 0; i < world.cells.length; i++) {
    if (visited[i] || world.cells[i] !== "open") continue;
    const component: number[] = [];
    const queue = [i]; visited[i] = 1;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head], cx = current % world.size, cy = Math.floor(current / world.size);
      component.push(current);
      for (const neighbor of [
        indexAt(cx - 1, cy, world.size), indexAt(cx + 1, cy, world.size),
        indexAt(cx, cy - 1, world.size), indexAt(cx, cy + 1, world.size),
      ]) {
        if (!visited[neighbor] && world.cells[neighbor] === "open") { visited[neighbor] = 1; queue.push(neighbor); }
      }
    }
    if (component.length >= 4) options.push(...component);
  }
  const distance = (i: number) => {
    const tx = i % world.size, ty = Math.floor(i / world.size);
    const dx = Math.min(Math.abs(tx - x), world.size - Math.abs(tx - x));
    const dy = Math.min(Math.abs(ty - y), world.size - Math.abs(ty - y));
    return dx + dy;
  };
  const sorted = options.map(i => ({ i, distance: distance(i) })).sort((a, b) => a.distance - b.distance);
  const nearLimit = Math.max(3, Math.round(world.size * .12));
  const farLimit = Math.max(6, Math.round(world.size * .35));
  const near = sorted.filter(option => option.distance <= nearLimit);
  const far = sorted.filter(option => option.distance >= farLimit);
  const quarter = Math.max(1, Math.ceil(sorted.length * .25));
  const pool = Math.random() < .8
    ? (far.length ? far : sorted.slice(-quarter))
    : (near.length ? near : sorted.slice(0, quarter));
  const pick = pool[Math.floor(Math.random() * pool.length)]?.i ?? indexAt(world.start.x, world.start.y, world.size);
  return { x: pick % world.size + .5, y: Math.floor(pick / world.size) + .5 };
}

export function restoreOpenedWalls(world: World, opened: Set<number>, rate = .15) {
  const remaining = new Set([...opened].filter(i => world.cells[i] === "open"));
  const eligibleCount = remaining.size;
  const clusters: number[][] = [];
  while (remaining.size) {
    const first = remaining.values().next().value as number;
    const cluster: number[] = [];
    const queue = [first];
    remaining.delete(first);
    while (queue.length) {
      const i = queue.pop()!;
      cluster.push(i);
      const x = i % world.size, y = Math.floor(i / world.size);
      for (const neighbor of [
        indexAt(x - 1, y, world.size), indexAt(x + 1, y, world.size),
        indexAt(x, y - 1, world.size), indexAt(x, y + 1, world.size),
      ]) {
        if (remaining.delete(neighbor)) queue.push(neighbor);
      }
    }
    clusters.push(cluster);
  }

  const rawTarget = eligibleCount * rate;
  const target = Math.floor(rawTarget) + (Math.random() < rawTarget % 1 ? 1 : 0);
  let restored = 0;
  for (let i = clusters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [clusters[i], clusters[j]] = [clusters[j], clusters[i]];
  }
  for (const cluster of clusters) {
    if (restored >= target) break;
    const needed = target - restored;
    if (cluster.length <= needed) {
      for (const i of cluster) world.cells[i] = "wall";
      restored += cluster.length;
      continue;
    }
    const available = new Set(cluster);
    const seed = cluster[Math.floor(Math.random() * cluster.length)];
    const queue = [seed]; available.delete(seed);
    for (let head = 0; head < queue.length && restored < target; head++) {
      const i = queue[head];
      world.cells[i] = "wall"; restored++;
      const cx = i % world.size, cy = Math.floor(i / world.size);
      const neighbors = [
        indexAt(cx - 1, cy, world.size), indexAt(cx + 1, cy, world.size),
        indexAt(cx, cy - 1, world.size), indexAt(cx, cy + 1, world.size),
      ].filter(neighbor => available.has(neighbor));
      for (let j = neighbors.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [neighbors[j], neighbors[k]] = [neighbors[k], neighbors[j]];
      }
      for (const neighbor of neighbors) { available.delete(neighbor); queue.push(neighbor); }
    }
  }
  opened.clear();
  return restored;
}
