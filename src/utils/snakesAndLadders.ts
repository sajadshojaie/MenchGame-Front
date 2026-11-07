import type { GameState, LegalMove, Point } from "@/types/game";

export const SNAKES_GOAL = 100;
export const SNAKES_CELL = 92;
export const TRANSPORT_MS = 1100;

/** Shared by the rules, board artwork and movement animation. */
export const LADDERS: ReadonlyArray<readonly [number, number]> = [
  [3, 24], [13, 46], [33, 49], [42, 63], [50, 69], [62, 81], [74, 92],
];
export const SNAKES: ReadonlyArray<readonly [number, number]> = [
  [27, 5], [40, 2], [54, 31], [73, 51], [86, 36], [98, 79],
];

const transports = new Map<number, number>([...LADDERS, ...SNAKES]);

export function snakesPoint(square: number): Point {
  const index = Math.max(0, Math.min(SNAKES_GOAL - 1, square - 1));
  const row = Math.floor(index / 10);
  const column = row % 2 === 0 ? index % 10 : 9 - index % 10;
  return { x: 40 + (column + 0.5) * SNAKES_CELL, y: 20 + (9 - row + 0.5) * SNAKES_CELL };
}

export function waitingPoint(seat: number): Point {
  return { x: 85 + seat * 166, y: 966 };
}

/** The same curve drives the snake artwork and the token sliding down it. */
export function snakeCurve(from: number, to: number): [Point, Point, Point, Point] {
  const a = snakesPoint(from);
  const b = snakesPoint(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.min(105, length * 0.32);
  const nx = -dy / length * bend;
  const ny = dx / length * bend;
  return [a, { x: a.x + dx / 3 + nx, y: a.y + dy / 3 + ny },
    { x: a.x + dx * 2 / 3 - nx, y: a.y + dy * 2 / 3 - ny }, b];
}

export function curvePoint(points: [Point, Point, Point, Point], t: number): Point {
  const [a, b, c, d] = points;
  const s = 1 - t;
  return {
    x: s ** 3 * a.x + 3 * s ** 2 * t * b.x + 3 * s * t ** 2 * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s ** 2 * t * b.y + 3 * s * t ** 2 * c.y + t ** 3 * d.y,
  };
}

export function snakesLegalMoves(state: GameState, dice: number): LegalMove[] {
  const player = state.players[state.currentPlayerIndex];
  const token = state.tokens.find((item) => item.playerId === player?.id);
  if (!token || token.progress >= SNAKES_GOAL) return [];
  if (token.progress < 0 && dice !== 6) return [];
  const landing = token.progress < 0 ? 1 : token.progress + dice;
  if (landing > SNAKES_GOAL) return [];
  const to = transports.get(landing) ?? landing;
  const captures = state.tokens
    .filter((other) => other.playerId !== player.id && other.progress === to)
    .map((other) => other.id);
  return [{ tokenId: token.id, from: token.progress, landing, to, captures, finishes: to === SNAKES_GOAL }];
}
