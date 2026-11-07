import type {
  GameState,
  GameMode,
  Intent,
  LastMove,
  LegalMove,
  Player,
  PlayerCount,
  SeatSetup,
  Token,
  TokenCount,
} from "@/types/game";
import {
  DEFAULT_TOKEN_COUNT,
  finishProgress,
  homeLength,
  seatChoices,
  seatOrder,
  seatPlan,
  trackLength,
  buildLayout,
} from "@/utils/boardGeometry";
import { snakesLegalMoves, SNAKES_GOAL, TRANSPORT_MS } from "@/utils/snakesAndLadders";
export const DICE_MS = 880;
export const TURN_LIMIT_MS = 15_000;
export const HOP_MS = 340;
export const BOT_THINK_MS = 1200;

const BOT_NAMES = ["رویا", "کیان", "سارا", "نیما", "لاله", "آرمان"];

export function createId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${rand}`;
}

export function roomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function layoutOf(count: PlayerCount) {
  return buildLayout(count);
}

export function createTokens(
  players: Player[],
  tokenCount: TokenCount = DEFAULT_TOKEN_COUNT,
): Token[] {
  return players.flatMap((player) =>
    Array.from({ length: tokenCount }, (_, index) => ({
      id: `${player.id}:${index}`,
      playerId: player.id,
      seat: player.seat,
      index,
      progress: -1,
    })),
  );
}

export function createLocalMatch(
  count: PlayerCount,
  seats: SeatSetup[],
  hostName: string,
  tokenCount: TokenCount = DEFAULT_TOKEN_COUNT,
  gameMode: GameMode = "ludo",
): GameState {
  const fallback = seatPlan(count);
  const players: Player[] = seats.slice(0, count).map((seat, index) => ({
    id: index === 0 ? "local-you" : createId(seat.kind === "bot" ? "bot" : "local"),
    name: (index === 0 ? hostName : seat.name).trim() || defaultName(index, seat.kind),
    seat: seat.seat ?? fallback[index] ?? index,
    kind: index === 0 ? "human" : seat.kind,
    peerId: null,
    connected: true,
  }));
  const state = baseState({
    roomId: null,
    hostId: players[0].id,
    maxPlayers: count,
    gameMode,
    tokenCount: gameMode === "snakes" ? 1 : tokenCount,
    players,
    status: "playing",
    rollTimerEnabled: true,
    phase: "roll",
  });
  return { ...state, rollDeadline: rollClock(players, 0, Date.now(), 0, true) };
}

export function createLobby(options: {
  roomId: string | null;
  hostId: string;
  hostName: string;
  count: PlayerCount;
  peerId: string | null;
  hostSeat?: number;
  tokenCount?: TokenCount;
  gameMode?: GameMode;
}): GameState {
  const choices = seatChoices(options.count);
  const host: Player = {
    id: options.hostId,
    name: options.hostName.trim() || "میزبان",
    seat: choices.includes(options.hostSeat ?? 0) ? (options.hostSeat ?? 0) : choices[0],
    kind: "human",
    peerId: options.peerId,
    connected: true,
  };
  return baseState({
    roomId: options.roomId,
    hostId: host.id,
    maxPlayers: options.count,
    gameMode: options.gameMode ?? "ludo",
    tokenCount: options.gameMode === "snakes" ? 1 : options.tokenCount ?? DEFAULT_TOKEN_COUNT,
    players: [host],
    status: "lobby",
    rollTimerEnabled: true,
    phase: "lobby",
  });
}

function baseState(partial: {
  roomId: string | null;
  hostId: string;
  maxPlayers: PlayerCount;
  gameMode: GameMode;
  tokenCount: TokenCount;
  players: Player[];
  status: GameState["status"];
  rollTimerEnabled: boolean;
  phase: GameState["phase"];
}): GameState {
  return {
    revision: 1,
    gameMode: partial.gameMode,
    roomId: partial.roomId,
    hostId: partial.hostId,
    maxPlayers: partial.maxPlayers,
    tokenCount: partial.tokenCount,
    status: partial.status,
    rollTimerEnabled: partial.rollTimerEnabled,
    players: partial.players,
    tokens: createTokens(partial.players, partial.tokenCount),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    rollId: 0,
    phase: partial.phase,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    busyUntil: 0,
    rollDeadline: 0,
    moveSeq: 0,
    lastMove: null,
    playerStats: emptyPlayerStats(partial.players),
  };
}

function emptyPlayerStats(players: Player[]): GameState["playerStats"] {
  return Object.fromEntries(
    players.map((player) => [player.id, { rolls: 0, sixes: 0, captures: {} }]),
  );
}

function nextOpenSeat(state: GameState): number {
  const used = new Set(state.players.map((player) => player.seat));
  const first = state.players[0]?.seat ?? 0;
  return seatOrder(state.maxPlayers, first).find((seat) => !used.has(seat)) ?? state.players.length;
}

function defaultName(index: number, kind: "human" | "bot"): string {
  if (kind === "bot") return BOT_NAMES[index % BOT_NAMES.length];
  return `بازیکن ${index + 1}`;
}

function homeIndexOf(progress: number, count: PlayerCount): number | null {
  const len = trackLength(count);
  const home = homeLength(count);
  if (progress < len || progress >= len + home) return null;
  return progress - len;
}

/** Tokens sitting in a solid row from the innermost colored house backward. */
export function parkedTokenIds(tokens: Token[], playerId: string, count: PlayerCount): Set<string> {
  const houses = homeLength(count);
  const at = new Map<number, string>();
  for (const token of tokens) {
    if (token.playerId !== playerId) continue;
    const index = homeIndexOf(token.progress, count);
    if (index == null) continue;
    at.set(index, token.id);
  }
  const parked = new Set<string>();
  for (let slot = houses - 1; slot >= 0; slot--) {
    const id = at.get(slot);
    if (!id) break;
    parked.add(id);
  }
  return parked;
}

export function tokenParked(state: GameState, tokenId: string): boolean {
  const token = state.tokens.find((item) => item.id === tokenId);
  if (!token) return false;
  if (state.gameMode === "snakes") return token.progress === SNAKES_GOAL;
  return parkedTokenIds(state.tokens, token.playerId, state.maxPlayers).has(tokenId);
}

function goalProgressFor(tokens: Token[], token: Token, count: PlayerCount): number {
  const parked = parkedTokenIds(tokens, token.playerId, count);
  parked.delete(token.id);
  const goalIndex = homeLength(count) - 1 - parked.size;
  return trackLength(count) + Math.max(0, goalIndex);
}

export function playerFinished(state: GameState, playerId: string): boolean {
  const mine = state.tokens.filter((token) => token.playerId === playerId);
  if (state.gameMode === "snakes") return mine.some((token) => token.progress === SNAKES_GOAL);
  return mine.length === state.tokenCount &&
    parkedTokenIds(state.tokens, playerId, state.maxPlayers).size === state.tokenCount;
}

export function seatOf(state: GameState, playerId: string): number {
  return state.players.find((player) => player.id === playerId)?.seat ?? 0;
}

function trackIndexFor(state: GameState, token: Token): number | null {
  const len = trackLength(state.maxPlayers);
  if (token.progress < 0 || token.progress >= len) return null;
  const layout = layoutOf(state.maxPlayers);
  return (layout.starts[token.seat] + token.progress) % len;
}

function tokensOnTrackCell(state: GameState, trackIndex: number, tokens: Token[] = state.tokens): Token[] {
  return tokens.filter((token) => trackIndexFor({ ...state, tokens }, token) === trackIndex);
}

function capturesOn(state: GameState, mover: Token, trackIndex: number, tokens: Token[]): string[] {
  return tokensOnTrackCell(state, trackIndex, tokens)
    .filter((token) => token.id !== mover.id && token.playerId !== mover.playerId)
    .map((token) => token.id);
}

export function legalMoves(state: GameState, dice = state.dice): LegalMove[] {
  if (state.status !== "playing" || state.phase !== "move" || dice == null) return [];
  const player = state.players[state.currentPlayerIndex];
  if (!player || playerFinished(state, player.id)) return [];
  if (state.gameMode === "snakes") return snakesLegalMoves(state, dice);
  const len = trackLength(state.maxPlayers);
  const moves: LegalMove[] = [];

  for (const token of state.tokens) {
    if (token.playerId !== player.id) continue;
    if (parkedTokenIds(state.tokens, player.id, state.maxPlayers).has(token.id)) continue;

    if (token.progress < 0) {
      if (dice !== 6) continue;
      const index = layoutOf(state.maxPlayers).starts[token.seat];
      moves.push({ tokenId: token.id, from: -1, to: 0, captures: capturesOn(state, token, index, state.tokens), finishes: false });
      continue;
    }

    const dest = token.progress + dice;
    const goal = goalProgressFor(state.tokens, token, state.maxPlayers);
    let limit = goal;
    for (const other of state.tokens) {
      if (other.id === token.id || other.playerId !== token.playerId || other.progress < 0) continue;
      if (other.progress <= token.progress || other.progress > goal) continue;
      const bothInHomeLane = token.progress >= len && other.progress >= len;
      if (bothInHomeLane && dest !== other.progress) continue;
      limit = Math.min(limit, other.progress - 1);
    }
    if (dest > limit) continue;

    const captures: string[] = [];
    if (dest < len) {
      const index = (layoutOf(state.maxPlayers).starts[token.seat] + dest) % len;
      captures.push(...capturesOn(state, token, index, state.tokens));
    }
    moves.push({ tokenId: token.id, from: token.progress, to: dest, captures, finishes: dest === goal });
  }
  return moves;
}

export function automaticMoveTokenId(state: GameState): string | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  if (state.gameMode === "snakes") return moves[0].tokenId;

  const player = state.players[state.currentPlayerIndex];
  if (!player) return null;
  const parked = parkedTokenIds(state.tokens, player.id, state.maxPlayers);
  const onBoard = state.tokens.filter(
    (token) =>
      token.playerId === player.id && token.progress >= 0 && !parked.has(token.id),
  );
  const onlyBoardMove =
    onBoard.length === 1
      ? moves.find((move) => move.tokenId === onBoard[0].id)
      : undefined;
  return (onlyBoardMove ?? (moves.length === 1 ? moves[0] : undefined))?.tokenId ?? null;
}

function nextPlayerIndex(state: GameState, from: number, tokens: Token[], rankings: string[]): number {
  const total = state.players.length;
  for (let step = 1; step <= total; step++) {
    const index = (from + step) % total;
    const player = state.players[index];
    const done =
      rankings.includes(player.id) ||
      playerFinished({ ...state, tokens }, player.id);
    if (!done) return index;
  }
  return from;
}

function rollClock(
  players: Player[],
  index: number,
  now: number,
  busyUntil: number,
  playing: boolean,
  enabled = true,
): number {
  const player = players[index];
  if (!enabled || !playing || !player || player.kind !== "human") return 0;
  return Math.max(now, busyUntil) + TURN_LIMIT_MS;
}

export function hopDuration(from: number, to: number): number {
  if (to < 0) return HOP_MS + 180;
  if (from < 0) return HOP_MS + 220;
  return Math.max(1, to - from) * HOP_MS + 160;
}

export function moveHopCount(move: Pick<LastMove, "from" | "to" | "landing">): number {
  return move.to < 0 || move.from < 0 ? 1 : Math.max(1, (move.landing ?? move.to) - move.from);
}

export function moveDuration(move: Pick<LastMove, "from" | "to" | "landing">): number {
  return hopDuration(move.from, move.landing ?? move.to) +
    (move.landing != null && move.landing !== move.to ? TRANSPORT_MS : 0);
}

export function applyRoll(state: GameState, value: number, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "roll") return state;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  const sixes = value === 6 ? state.consecutiveSixes + 1 : 0;
  const playerStats = state.playerStats[player.id] ?? {
    rolls: 0,
    sixes: 0,
    captures: {},
  };
  const rolled: GameState = {
    ...state,
    rollerIndex: state.currentPlayerIndex,
    dice: value,
    rollId: state.rollId + 1,
    consecutiveSixes: sixes,
    openingMisses: noteOpeningMiss(state, value),
    playerStats: {
      ...state.playerStats,
      [player.id]: {
        ...playerStats,
        rolls: playerStats.rolls + 1,
        sixes: playerStats.sixes + Number(value === 6),
      },
    },
    revision: state.revision + 1,
  };

  if (state.gameMode !== "snakes" && value === 6 && sixes >= 3) {
    const next = nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
    return {
      ...rolled,
      phase: "roll",
      consecutiveSixes: 0,
      currentPlayerIndex: next,
      busyUntil: now + DICE_MS + 420,
      rollDeadline: rollClock(state.players, next, now, now + DICE_MS + 420, true, state.rollTimerEnabled),
    };
  }

  const moves = legalMoves({ ...rolled, phase: "move" }, value);
  if (moves.length === 0) {
    const bonus = state.gameMode === "snakes" && value === 6;
    const next = bonus ? state.currentPlayerIndex : nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
    return {
      ...rolled,
      phase: "roll",
      consecutiveSixes: bonus ? sixes : 0,
      currentPlayerIndex: next,
      busyUntil: now + DICE_MS + 520,
      rollDeadline: rollClock(state.players, next, now, now + DICE_MS + 520, true, state.rollTimerEnabled),
    };
  }

  const moving: GameState = {
    ...rolled,
    phase: "move",
    busyUntil: now + DICE_MS,
    rollDeadline: 0,
  };
  return moving;
}

export function passRoll(state: GameState, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "roll") return state;
  const player = state.players[state.currentPlayerIndex];
  if (!player) return state;
  const next = nextPlayerIndex(state, state.currentPlayerIndex, state.tokens, state.rankings);
  const busyUntil = now;
  return {
    ...state,
    revision: state.revision + 1,
    phase: "roll",
    consecutiveSixes: 0,
    currentPlayerIndex: next,
    busyUntil,
    rollDeadline: rollClock(state.players, next, now, busyUntil, true, state.rollTimerEnabled),
  };
}

export function applyMove(state: GameState, tokenId: string, now: number): GameState {
  if (state.status !== "playing" || state.phase !== "move") return state;
  const move = legalMoves(state).find((item) => item.tokenId === tokenId);
  if (!move) return state;

  const player = state.players[state.currentPlayerIndex];
  let tokens = state.tokens.map((token) =>
    token.id === tokenId ? { ...token, progress: move.to } : token,
  );
  if (move.captures.length) {
    const captured = new Set(move.captures);
    tokens = tokens.map((token) => (captured.has(token.id) ? { ...token, progress: -1 } : token));
  }

  const justFinished = playerFinished({ ...state, tokens }, player.id);
  let rankings = state.rankings;
  if (justFinished && !rankings.includes(player.id)) rankings = [...rankings, player.id];

  const stillPlaying = state.players.filter(
    (item) => !rankings.includes(item.id) && !playerFinished({ ...state, tokens }, item.id),
  );
  const status: GameState["status"] =
    (state.gameMode === "snakes" ? justFinished : stillPlaying.length <= 1) ? "finished" : state.status;

  const bonus = state.dice === 6 && !justFinished && status === "playing";
  const nextIndex = bonus
    ? state.currentPlayerIndex
    : nextPlayerIndex(state, state.currentPlayerIndex, tokens, rankings);

  const lastMove: LastMove = {
    id: state.moveSeq + 1,
    tokenId,
    seat: player.seat,
    from: move.from,
    to: move.to,
    ...(move.landing != null ? { landing: move.landing } : {}),
    capturedIds: move.captures,
  };
  const playerStats = { ...state.playerStats };
  if (move.captures.length) {
    const captures = { ...(playerStats[player.id]?.captures ?? {}) };
    for (const capturedId of move.captures) {
      const victim = state.tokens.find((token) => token.id === capturedId);
      if (victim) captures[victim.playerId] = (captures[victim.playerId] ?? 0) + 1;
    }
    playerStats[player.id] = {
      ...(playerStats[player.id] ?? { rolls: 0, sixes: 0, captures: {} }),
      captures,
    };
  }

  const introducedIds =
    move.from < 0 && !(state.introducedIds ?? []).includes(player.id)
      ? [...(state.introducedIds ?? []), player.id]
      : (state.introducedIds ?? []);

  return {
    ...state,
    revision: state.revision + 1,
    tokens,
    introducedIds,
    rankings,
    status,
    phase: status === "finished" ? "roll" : "roll",
    currentPlayerIndex: status === "finished" ? state.currentPlayerIndex : nextIndex,
    consecutiveSixes: bonus && state.dice === 6 ? state.consecutiveSixes : 0,
    dice: state.dice,
    busyUntil: now + moveDuration(move) + (move.captures.length ? HOP_MS : 0),
    rollDeadline:
      status === "finished"
        ? 0
        : rollClock(
            state.players,
            nextIndex,
            now,
            now + moveDuration(move) + (move.captures.length ? HOP_MS : 0),
            true,
            state.rollTimerEnabled,
          ),
    moveSeq: state.moveSeq + 1,
    lastMove,
    playerStats,
  };
}

export function addBot(state: GameState): GameState {
  if (state.status !== "lobby") return state;
  if (state.players.length >= state.maxPlayers) return state;
  const seat = nextOpenSeat(state);
  const name = BOT_NAMES.find((candidate) => state.players.every((player) => player.name !== candidate)) ?? `ربات ${seat + 1}`;
  const player: Player = {
    id: createId("bot"),
    name,
    seat,
    kind: "bot",
    peerId: null,
    connected: true,
  };
  const players = [...state.players, player];
  return {
    ...state,
    revision: state.revision + 1,
    players,
    tokens: createTokens(players, state.tokenCount),
    playerStats: { ...state.playerStats, ...emptyPlayerStats(players) },
  };
}

export function findReturningPlayer(state: GameState, hello: { playerId: string; name?: string; seat?: number }, peerId: string): Player | undefined {
  const humans = state.players.filter((item) => item.kind === "human");
  const byId = humans.find((item) => item.id === hello.playerId || item.peerId === hello.playerId || item.peerId === peerId);
  if (byId) return byId;
  const name = hello.name?.trim() ?? "";
  if (name) {
    const byName = humans.find((item) => !item.connected && item.name === name);
    if (byName) return byName;
  }
  if (hello.seat != null) {
    const bySeat = humans.find((item) => !item.connected && item.seat === hello.seat);
    if (bySeat) return bySeat;
  }
  return undefined;
}

export function addHuman(state: GameState, player: Player, requestedSeat?: number): GameState | null {
  if (state.status !== "lobby" && state.status !== "playing") return null;
  if (state.players.some((item) => item.id === player.id || item.peerId === player.peerId)) return state;
  if (state.players.length >= state.maxPlayers) return null;
  const used = new Set(state.players.map((item) => item.seat));
  const wanted = requestedSeat != null && seatChoices(state.maxPlayers).includes(requestedSeat) && !used.has(requestedSeat)
    ? requestedSeat
    : nextOpenSeat(state);
  const seated: Player = { ...player, seat: wanted, kind: "human", connected: true };
  const players = [...state.players, seated];
  return {
    ...state,
    revision: state.revision + 1,
    players,
    tokens:
      state.status === "lobby"
        ? createTokens(players, state.tokenCount)
        : [...state.tokens, ...createTokens([seated], state.tokenCount)],
    playerStats: { ...state.playerStats, ...emptyPlayerStats([seated]) },
  };
}

export function startMatch(state: GameState, now: number): GameState {
  if (state.status !== "lobby") return state;
  if (state.players.length < 2) return state;
  const players = state.players.map((player) => ({ ...player }));
  return {
    ...state,
    revision: state.revision + 1,
    status: "playing",
    phase: "roll",
    players,
    tokens: createTokens(players, state.tokenCount),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    busyUntil: now + 400,
    rollDeadline: rollClock(players, 0, now, now + 400, true, state.rollTimerEnabled),
    moveSeq: 0,
    lastMove: null,
    playerStats: emptyPlayerStats(players),
  };
}

export function rematch(state: GameState, now: number): GameState {
  const players = state.players.map((player) => ({ ...player }));
  return {
    ...state,
    revision: state.revision + 1,
    status: "playing",
    phase: "roll",
    players,
    tokens: createTokens(players, state.tokenCount),
    currentPlayerIndex: 0,
    rollerIndex: 0,
    dice: null,
    rollId: state.rollId + 1,
    consecutiveSixes: 0,
    introducedIds: [],
    openingMisses: {},
    rankings: [],
    busyUntil: now + 400,
    rollDeadline: rollClock(players, 0, now, now + 400, true, state.rollTimerEnabled),
    moveSeq: state.moveSeq + 1,
    lastMove: null,
    playerStats: emptyPlayerStats(players),
  };
}

export function markPeerAway(state: GameState, peerId: string): GameState {
  const player = state.players.find((item) => item.peerId === peerId && item.kind === "human" && item.connected);
  if (!player) return state;
  const players = state.players.map((item) => (item.peerId === peerId ? { ...item, connected: false } : item));
  const current = state.players[state.currentPlayerIndex];
  const pause = state.status === "playing" && state.phase === "roll" && current?.id === player.id;
  return {
    ...state,
    revision: state.revision + 1,
    players,
    rollDeadline: pause ? 0 : state.rollDeadline,
  };
}

export function reattachHuman(state: GameState, playerId: string, peerId: string): GameState {
  const player = state.players.find((item) => item.id === playerId && item.kind === "human");
  if (!player) return state;
  if (player.connected && player.peerId === peerId) return state;
  const wasAway = !player.connected;
  const players = state.players.map((item) =>
    item.id === playerId ? { ...item, peerId, kind: "human" as const, connected: true } : item,
  );
  const current = players[state.currentPlayerIndex];
  const arm = wasAway && state.status === "playing" && state.phase === "roll" && current?.id === playerId;
  return {
    ...state,
    revision: state.revision + 1,
    players,
    rollDeadline: arm
      ? rollClock(players, state.currentPlayerIndex, Date.now(), Date.now(), true, state.rollTimerEnabled)
      : state.rollDeadline,
  };
}

export function convertPeerToBot(state: GameState, peerId: string): GameState {
  const player = state.players.find((item) => item.peerId === peerId);
  if (!player || player.kind === "bot") return state;
  const players = state.players.map((item) =>
    item.peerId === peerId ? { ...item, kind: "bot" as const, connected: true } : item,
  );
  return {
    ...state,
    revision: state.revision + 1,
    players,
    hostId: state.hostId === player.id ? state.hostId : state.hostId,
  };
}

export function applyIntent(state: GameState, intent: Intent, actorId: string, now: number): GameState | null {
  if (intent.type === "set-game-mode") {
    if (actorId !== state.hostId || state.status !== "lobby") return null;
    if (intent.mode !== "ludo" && intent.mode !== "snakes") return null;
    if ((state.gameMode ?? "ludo") === intent.mode) return null;
    const tokenCount = intent.mode === "snakes" ? 1 : DEFAULT_TOKEN_COUNT;
    return {
      ...state,
      revision: state.revision + 1,
      gameMode: intent.mode,
      tokenCount,
      tokens: createTokens(state.players, tokenCount),
      playerStats: emptyPlayerStats(state.players),
    };
  }
  if (intent.type === "set-token-count") {
    if (actorId !== state.hostId || state.status !== "lobby") return null;
    if (state.gameMode === "snakes") return null;
    if (![1, 2, 3, 4, 5].includes(intent.count) || state.tokenCount === intent.count) return null;
    return {
      ...state,
      revision: state.revision + 1,
      tokenCount: intent.count,
      tokens: createTokens(state.players, intent.count),
      playerStats: emptyPlayerStats(state.players),
    };
  }
  if (intent.type === "set-roll-timer") {
    if (actorId !== state.hostId || state.status !== "lobby") return null;
    if (state.rollTimerEnabled === intent.enabled) return null;
    return {
      ...state,
      revision: state.revision + 1,
      rollTimerEnabled: intent.enabled,
    };
  }
  if (intent.type === "set-player-seat") {
    if (actorId !== state.hostId || state.status !== "lobby") return null;
    if (!seatChoices(state.maxPlayers).includes(intent.seat)) return null;
    const player = state.players.find((item) => item.id === intent.playerId);
    if (!player || player.seat === intent.seat) return null;
    const other = state.players.find((item) => item.seat === intent.seat);
    const players = state.players.map((item) => {
      if (item.id === intent.playerId) return { ...item, seat: intent.seat };
      if (other && item.id === other.id) return { ...item, seat: player.seat };
      return item;
    });
    const seatByPlayer = new Map(players.map((item) => [item.id, item.seat]));
    return {
      ...state,
      revision: state.revision + 1,
      players,
      tokens: state.tokens.map((token) => ({
        ...token,
        seat: seatByPlayer.get(token.playerId) ?? token.seat,
      })),
    };
  }
  if (intent.type === "remove-player") {
    if (actorId !== state.hostId || state.status !== "lobby") return null;
    const player = state.players.find((item) => item.id === intent.playerId);
    if (!player || player.id === state.hostId) return null;
    const players = state.players.filter((item) => item.id !== player.id);
    const playerIds = new Set(players.map((item) => item.id));
    const tokens = state.tokens.filter((token) => token.playerId !== player.id);
    const playerStats = Object.fromEntries(
      players.map((item) => {
        const stats = state.playerStats[item.id] ?? {
          rolls: 0,
          sixes: 0,
          captures: {},
        };
        const captures = Object.fromEntries(
          Object.entries(stats.captures).filter(([victimId]) => playerIds.has(victimId)),
        );
        return [item.id, { ...stats, captures }];
      }),
    );
    return {
      ...state,
      revision: state.revision + 1,
      players,
      tokens,
      playerStats,
      currentPlayerIndex: Math.min(state.currentPlayerIndex, Math.max(players.length - 1, 0)),
      rollerIndex: Math.min(state.rollerIndex, Math.max(players.length - 1, 0)),
    };
  }
  if (intent.type === "add-bot") {
    if (actorId !== state.hostId) return null;
    const next = addBot(state);
    return next === state ? null : next;
  }
  if (intent.type === "start") {
    if (actorId !== state.hostId) return null;
    const next = startMatch(state, now);
    return next === state ? null : next;
  }
  if (intent.type === "rematch") {
    if (actorId !== state.hostId) return null;
    if (state.rankings.length === 0 && state.status !== "finished") return null;
    return rematch(state, now);
  }
  if (intent.type === "pass") {
    if (actorId !== state.hostId && actorId !== state.players[state.currentPlayerIndex]?.id) return null;
    if (state.phase !== "roll" || state.status !== "playing" || now < state.busyUntil) return null;
    const waiting = state.players[state.currentPlayerIndex];
    if (waiting?.kind === "human" && !waiting.connected) return null;
    if (state.rollDeadline && now + 250 < state.rollDeadline) return null;
    const next = passRoll(state, now);
    return next.revision === state.revision ? null : next;
  }
  if (state.status !== "playing") return null;
  if (now < state.busyUntil) return null;
  const current = state.players[state.currentPlayerIndex];
  if (!current) return null;
  const actorIsCurrent = current.id === actorId || (current.kind === "bot" && actorId === state.hostId);
  if (!actorIsCurrent) return null;
  if (intent.type === "roll") {
    if (state.phase !== "roll") return null;
    return applyRoll(state, rollForTurn(state), now);
  }
  if (intent.type === "move") {
    const next = applyMove(state, intent.tokenId, now);
    return next === state ? null : next;
  }
  return null;
}

/**
 * True until this player has brought one token out of the yard.
 * Later sixes, including bringing out the other tokens, stay fair.
 */
export function needsOpeningSix(state: GameState): boolean {
  const player = state.players[state.currentPlayerIndex];
  if (!player) return false;
  if ((state.introducedIds ?? []).includes(player.id)) return false;
  return state.tokens.some((token) => token.playerId === player.id && token.progress < 0);
}

/** Each face from 1 to 6 is equally likely. Rejection sampling removes modulo bias. */
export function rollDie(): number {
  return rollIndex(6) + 1;
}

/**
 * The first two tries to leave the yard use a fair die.
 * After two misses, 6 is one extra face in seven, still well short of a sure six.
 */
export function openingFaceCount(misses: number): number {
  return misses < 2 ? 6 : 7;
}

function rollForTurn(state: GameState): number {
  if (!needsOpeningSix(state)) return rollDie();
  const player = state.players[state.currentPlayerIndex];
  const misses = state.openingMisses?.[player.id] ?? 0;
  if (openingFaceCount(misses) === 6) return rollDie();
  const faces = [1, 2, 3, 4, 5, 6, 6];
  return faces[rollIndex(faces.length)];
}

function noteOpeningMiss(state: GameState, value: number): Record<string, number> {
  const misses = { ...(state.openingMisses ?? {}) };
  if (value === 6 || !needsOpeningSix(state)) return misses;
  const player = state.players[state.currentPlayerIndex];
  misses[player.id] = (misses[player.id] ?? 0) + 1;
  return misses;
}

function rollIndex(spanCount: number): number {
  const bucket = new Uint32Array(1);
  const span = 0x1_0000_0000;
  const limit = span - (span % spanCount);
  let pick = 0;
  do {
    crypto.getRandomValues(bucket);
    pick = bucket[0];
  } while (pick >= limit);
  return pick % spanCount;
}

export function describeMove(state: GameState, token: Token): string {
  if (state.gameMode === "snakes") {
    if (token.progress < 0) return "منتظر شش";
    if (token.progress === SNAKES_GOAL) return "برنده";
    return `خانه ${token.progress}`;
  }
  const len = trackLength(state.maxPlayers);
  if (token.progress < 0) return "خروج از خانه";
  if (parkedTokenIds(state.tokens, token.playerId, state.maxPlayers).has(token.id)) return "نشسته";
  if (token.progress >= len) return "مسیر خانه";
  if (token.progress === 0) return "ترک شروع";
  if (len - token.progress <= 6) return "نزدیک خانه";
  return "روی مسیر";
}

export function activePlayer(state: GameState): Player | null {
  return state.players[state.currentPlayerIndex] ?? null;
}

export { trackLength, homeLength, finishProgress };
