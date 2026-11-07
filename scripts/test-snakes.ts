import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameMode, GameState, PlayerCount } from "../src/types/game.ts";
import {
  addBot, addHuman, applyIntent, applyMove, applyRoll, createLobby, createLocalMatch,
  DICE_MS, HOP_MS, legalMoves, markPeerAway, moveDuration, moveHopCount,
  needsOpeningSix, playerFinished, reattachHuman, rematch, startMatch, tokenParked,
} from "../src/utils/gameRules.ts";
import {
  curvePoint, LADDERS, SNAKES, SNAKES_CELL, snakeCurve, snakesPoint, TRANSPORT_MS,
} from "../src/utils/snakesAndLadders.ts";

function fresh(count: PlayerCount = 4, mode: GameMode = "snakes"): GameState {
  return createLocalMatch(count, Array.from({ length: count }, (_, i) => ({
    name: `Player ${i}`, kind: "human" as const,
  })), "Host", 5, mode);
}

function positioned(progress: number, count: PlayerCount = 4): GameState {
  const state = fresh(count);
  return {
    ...state,
    busyUntil: 0,
    rollDeadline: 0,
    introducedIds: progress < 0 ? [] : [state.players[0].id],
    tokens: state.tokens.map((token, i) => i === 0 ? { ...token, progress } : token),
  };
}

function clickMove(state: GameState): GameState {
  const player = state.players[state.currentPlayerIndex];
  const move = legalMoves(state)[0];
  assert.ok(move, "the current player must have a legal move");
  const result = applyIntent(state, { type: "move", tokenId: move.tokenId }, player.id, state.busyUntil);
  assert.ok(result, "a click by the current player must apply the move");
  return result;
}

test("existing games still default to Ludo", () => {
  const local = createLocalMatch(2, [{ name: "A", kind: "human" }, { name: "B", kind: "bot" }], "A");
  const lobby = createLobby({ roomId: "ROOM", hostId: "host", hostName: "Host", count: 2, peerId: "host" });
  assert.equal(local.gameMode, "ludo");
  assert.equal(local.tokenCount, 4);
  assert.equal(lobby.gameMode, "ludo");
});

for (const count of [2, 3, 4, 5, 6] as const) {
  test(`Snakes has exactly one waiting token for each of ${count} players`, () => {
    const state = fresh(count);
    assert.equal(state.gameMode, "snakes");
    assert.equal(state.tokenCount, 1);
    assert.equal(state.tokens.length, count);
    for (const player of state.players) {
      const tokens = state.tokens.filter((token) => token.playerId === player.id);
      assert.equal(tokens.length, 1);
      assert.equal(tokens[0].progress, -1);
    }
  });
}

test("a player cannot enter without a six; a missed opening passes the turn", () => {
  for (let face = 1; face <= 5; face++) {
    const state = fresh();
    const next = applyRoll(state, face, 1000);
    assert.equal(next.phase, "roll");
    assert.equal(next.currentPlayerIndex, 1);
    assert.deepEqual(next.tokens, state.tokens);
    assert.equal(legalMoves(next).length, 0);
  }
});

test("rolling six waits for a click, then enters square 1 and awards another roll", () => {
  const state = fresh();
  const rolled = applyRoll(state, 6, 1000);
  assert.equal(rolled.phase, "move");
  assert.equal(rolled.tokens[0].progress, -1);
  assert.equal(rolled.moveSeq, 0);
  assert.equal(rolled.rollDeadline, 0);
  const moved = clickMove(rolled);
  assert.equal(moved.tokens[0].progress, 1);
  assert.equal(moved.currentPlayerIndex, 0);
  assert.equal(moved.phase, "roll");
  assert.equal(needsOpeningSix(moved), false);
  assert.deepEqual(moved.introducedIds, [state.players[0].id]);
  assert.ok(moved.rollDeadline > moved.busyUntil);
});

test("ordinary movement waits for a click, moves the die distance and changes turns", () => {
  const state = positioned(14);
  const rolled = applyRoll(state, 4, 1000);
  assert.equal(rolled.tokens[0].progress, 14);
  const moved = clickMove(rolled);
  assert.equal(moved.tokens[0].progress, 18);
  assert.equal(moved.currentPlayerIndex, 1);
  assert.equal(moved.lastMove?.landing, 18);
  assert.equal(moved.lastMove?.to, 18);
});

for (const [from, to] of [...LADDERS, ...SNAKES]) {
  test(`${to > from ? "ladder" : "snake"} transports a landing on ${from} to ${to}`, () => {
    const rolled = applyRoll(positioned(from - 1), 1, 1000);
    const moved = clickMove(rolled);
    assert.equal(moved.tokens[0].progress, to);
    assert.equal(moved.lastMove?.landing, from);
    assert.equal(moved.lastMove?.to, to);
    assert.deepEqual(moved.lastMove?.capturedIds, []);
    assert.equal(moveHopCount(moved.lastMove!), 1);
    assert.equal(moveDuration(moved.lastMove!), HOP_MS + 160 + TRANSPORT_MS);
    assert.equal(moved.busyUntil, rolled.busyUntil + moveDuration(moved.lastMove!));
  });
}

test("passing over a snake or ladder does not activate it", () => {
  assert.equal(clickMove(applyRoll(positioned(2), 2, 1000)).tokens[0].progress, 4);
  assert.equal(clickMove(applyRoll(positioned(26), 2, 1000)).tokens[0].progress, 28);
});

test("landing on an opponent returns its token to the yard and records the capture", () => {
  const state = positioned(14);
  state.tokens[1] = { ...state.tokens[1], progress: 18 };
  const moved = clickMove(applyRoll(state, 4, 1000));
  assert.deepEqual(moved.tokens.map((token) => token.progress), [18, -1, -1, -1]);
  assert.deepEqual(moved.lastMove?.capturedIds, [state.tokens[1].id]);
  assert.equal(moved.playerStats[state.players[0].id].captures[state.players[1].id], 1);
  assert.equal(moved.busyUntil, rolledMoveEnd(state, 4) + HOP_MS);
});

function rolledMoveEnd(state: GameState, die: number): number {
  const rolled = applyRoll(state, die, 1000);
  return rolled.busyUntil + moveDuration(legalMoves(rolled)[0]);
}

test("entering square 1 also captures an opponent waiting there", () => {
  const state = fresh();
  state.tokens[1] = { ...state.tokens[1], progress: 1 };
  const moved = clickMove(applyRoll(state, 6, 1000));
  assert.deepEqual(moved.tokens.slice(0, 2).map((token) => token.progress), [1, -1]);
  assert.equal(moved.currentPlayerIndex, 0);
  assert.equal(moved.playerStats[state.players[0].id].captures[state.players[1].id], 1);
});

for (const [landing, destination] of [LADDERS[0], SNAKES[0]]) {
  test(`transport to square ${destination} captures at the final destination`, () => {
    const state = positioned(landing - 1);
    state.tokens[1] = { ...state.tokens[1], progress: destination };
    const rolled = applyRoll(state, 1, 1000);
    const moved = clickMove(rolled);
    assert.equal(moved.tokens[0].progress, destination);
    assert.equal(moved.tokens[1].progress, -1);
    assert.deepEqual(moved.lastMove?.capturedIds, [state.tokens[1].id]);
    assert.equal(moved.busyUntil - rolled.busyUntil, moveDuration(moved.lastMove!) + HOP_MS);
    assert.equal(moved.playerStats[state.players[0].id].captures[state.players[1].id], 1);
    const snapshot: GameState = JSON.parse(JSON.stringify(moved));
    assert.deepEqual(snapshot.playerStats, moved.playerStats);
    assert.deepEqual(snapshot.lastMove, moved.lastMove);
  });
}

test("passing an opponent does not capture it", () => {
  const state = positioned(14);
  state.tokens[1] = { ...state.tokens[1], progress: 16 };
  const moved = clickMove(applyRoll(state, 4, 1000));
  assert.equal(moved.tokens[1].progress, 16);
  assert.deepEqual(moved.lastMove?.capturedIds, []);
});

test("a captured player needs a six to re-enter even after previously entering", () => {
  const state = positioned(14);
  state.introducedIds = state.players.map((player) => player.id);
  state.tokens[1] = { ...state.tokens[1], progress: 18 };
  const moved = clickMove(applyRoll(state, 4, 1000));
  assert.equal(moved.currentPlayerIndex, 1);
  const missed = applyRoll(moved, 5, moved.busyUntil);
  assert.equal(missed.tokens[1].progress, -1);
  assert.equal(missed.currentPlayerIndex, 2);
  const reenter = clickMove(applyRoll({ ...moved, phase: "roll" }, 6, moved.busyUntil));
  assert.equal(reenter.tokens[1].progress, 1);
});

test("repeated captures accumulate per opponent without changing unrelated stats", () => {
  const state = positioned(14);
  state.tokens[1] = { ...state.tokens[1], progress: 18 };
  const attacker = state.players[0].id;
  const victim = state.players[1].id;
  state.playerStats[attacker].captures[victim] = 2;
  const moved = clickMove(applyRoll(state, 4, 1000));
  assert.equal(moved.playerStats[attacker].captures[victim], 3);
  assert.deepEqual(moved.playerStats[victim], state.playerStats[victim]);
});

test("overshooting 100 does not move a token or finish the match", () => {
  const state = positioned(99);
  const rolled = applyRoll(state, 2, 1000);
  assert.equal(rolled.tokens[0].progress, 99);
  assert.equal(rolled.phase, "roll");
  assert.equal(rolled.currentPlayerIndex, 1);
  assert.equal(rolled.status, "playing");
  assert.equal(rolled.moveSeq, 0);
});

test("a six still awards another roll when the token would overshoot", () => {
  const rolled = applyRoll(positioned(99), 6, 1000);
  assert.equal(rolled.tokens[0].progress, 99);
  assert.equal(rolled.currentPlayerIndex, 0);
  assert.equal(rolled.phase, "roll");
  assert.equal(rolled.consecutiveSixes, 1);
});

for (const count of [2, 3, 4, 5, 6] as const) {
  test(`the first exact finish ends a ${count}-player match immediately`, () => {
    const rolled = applyRoll(positioned(99, count), 1, 1000);
    const moved = clickMove(rolled);
    assert.equal(moved.tokens[0].progress, 100);
    assert.equal(moved.status, "finished");
    assert.equal(moved.rollDeadline, 0);
    assert.deepEqual(moved.rankings, [moved.players[0].id]);
    assert.equal(playerFinished(moved, moved.players[0].id), true);
    assert.equal(tokenParked(moved, moved.tokens[0].id), true);
    assert.ok(moved.tokens.slice(1).every((token) => token.progress === -1));
    assert.deepEqual(legalMoves(moved), []);
    assert.equal(applyIntent(moved, { type: "roll" }, moved.hostId, moved.busyUntil), null);
  });
}

test("Snakes permits a third consecutive six; Ludo keeps its previous rule", () => {
  const snake = { ...positioned(60), consecutiveSixes: 2 };
  const snakeRoll = applyRoll(snake, 6, 1000);
  assert.equal(snakeRoll.phase, "move");
  assert.equal(snakeRoll.currentPlayerIndex, 0);
  const ludo = { ...fresh(4, "ludo"), consecutiveSixes: 2 };
  const ludoRoll = applyRoll(ludo, 6, 1000);
  assert.equal(ludoRoll.phase, "roll");
  assert.equal(ludoRoll.currentPlayerIndex, 1);
});

test("only the current human can move, and only after the dice animation", () => {
  const rolled = applyRoll(positioned(14), 4, 1000);
  const intent = { type: "move" as const, tokenId: rolled.tokens[0].id };
  assert.equal(applyIntent(rolled, intent, rolled.players[0].id, rolled.busyUntil - 1), null);
  assert.equal(applyIntent(rolled, intent, rolled.players[1].id, rolled.busyUntil), null);
  assert.equal(applyIntent(rolled, { type: "move", tokenId: rolled.tokens[1].id }, rolled.players[0].id, rolled.busyUntil), null);
  assert.equal(applyMove({ ...rolled, phase: "roll" }, rolled.tokens[0].id, 10000).revision, rolled.revision);
  assert.equal(clickMove(rolled).tokens[0].progress, 18);
});

test("only the host can change mode in the lobby; Snakes locks token count to one", () => {
  const lobby = addBot(createLobby({ roomId: "ROOM", hostId: "host", hostName: "Host", count: 4, peerId: "host" }));
  const intent = { type: "set-game-mode" as const, mode: "snakes" as const };
  assert.equal(applyIntent(lobby, intent, "guest", 1000), null);
  const snake = applyIntent(lobby, intent, "host", 1000)!;
  assert.equal(snake.gameMode, "snakes");
  assert.equal(snake.tokenCount, 1);
  assert.equal(snake.tokens.length, snake.players.length);
  assert.equal(applyIntent(snake, { type: "set-token-count", count: 5 }, "host", 1000), null);
  assert.equal(applyIntent(startMatch(snake, 1000), { type: "set-game-mode", mode: "ludo" }, "host", 2000), null);
  assert.equal(applyIntent(snake, { type: "set-game-mode", mode: "unknown" as GameMode }, "host", 1000), null);
  const ludo = applyIntent(snake, { type: "set-game-mode", mode: "ludo" }, "host", 1000)!;
  assert.equal(ludo.tokenCount, 4);
  assert.equal(ludo.tokens.length, ludo.players.length * 4);
});

test("joining, reconnecting and JSON synchronization preserve the mode and positions", () => {
  const lobby = createLobby({ roomId: "ROOM", hostId: "host", hostName: "Host", count: 2, peerId: "host", gameMode: "snakes", tokenCount: 5 });
  const joined = addHuman(lobby, { id: "guest", name: "Guest", seat: 2, kind: "human", peerId: "guest-peer", connected: true })!;
  assert.equal(joined.tokens.length, 2);
  const playing = startMatch(joined, 1000);
  const moved = clickMove(applyRoll(playing, 6, 2000));
  const restored: GameState = JSON.parse(JSON.stringify(moved));
  const away = markPeerAway(restored, "guest-peer");
  const back = reattachHuman(away, "guest", "new-guest-peer");
  assert.equal(back.gameMode, "snakes");
  assert.deepEqual(back.tokens, moved.tokens);
  assert.deepEqual(back.lastMove, moved.lastMove);
  assert.equal(back.players[1].peerId, "new-guest-peer");
});

test("rematch resets the board but keeps Snakes and one token per player", () => {
  const finished = clickMove(applyRoll(positioned(99), 1, 1000));
  const next = rematch(finished, finished.busyUntil + 1000);
  assert.equal(next.gameMode, "snakes");
  assert.equal(next.tokenCount, 1);
  assert.equal(next.status, "playing");
  assert.deepEqual(next.rankings, []);
  assert.deepEqual(next.introducedIds, []);
  assert.equal(next.lastMove, null);
  assert.ok(next.tokens.every((token) => token.progress === -1));
});

test("every board position and die value produces a legal bounded result", () => {
  const transports = new Map([...LADDERS, ...SNAKES]);
  for (const square of [-1, ...Array.from({ length: 100 }, (_, i) => i + 1)]) {
    for (let die = 1; die <= 6; die++) {
      const state = positioned(square);
      const before = structuredClone(state);
      const rolled = applyRoll(state, die, 1000);
      const expectedLanding = square < 0 ? 1 : square + die;
      const canMove = square < 0 ? die === 6 : square < 100 && expectedLanding <= 100;
      const moves = legalMoves(rolled);
      assert.equal(moves.length, canMove ? 1 : 0, `square ${square}, die ${die}`);
      if (canMove) {
        const next = clickMove(rolled);
        assert.equal(next.tokens[0].progress, transports.get(expectedLanding) ?? expectedLanding);
        assert.ok(next.tokens[0].progress >= 1 && next.tokens[0].progress <= 100);
        assert.equal(next.tokens.length, state.tokens.length);
      }
      assert.deepEqual(state, before, "rules must not mutate their input");
    }
  }
});

test("the board is a continuous serpentine path with distinct squares", () => {
  const points = Array.from({ length: 100 }, (_, i) => snakesPoint(i + 1));
  assert.equal(new Set(points.map((point) => `${point.x},${point.y}`)).size, 100);
  for (let i = 1; i < points.length; i++) {
    assert.equal(Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y), SNAKES_CELL);
  }
  assert.equal(points[0].x, points[99].x);
  assert.ok(points[0].y > points[99].y);
  for (const [from, to] of SNAKES) {
    const curve = snakeCurve(from, to);
    assert.deepEqual(curvePoint(curve, 0), snakesPoint(from));
    assert.deepEqual(curvePoint(curve, 1), snakesPoint(to));
    for (let step = 0; step <= 100; step++) {
      const point = curvePoint(curve, step / 100);
      assert.ok(point.x >= 40 && point.x <= 960 && point.y >= 20 && point.y <= 940);
    }
  }
});

test("dice animation duration remains separate from token transport duration", () => {
  const rolled = applyRoll(positioned(2), 1, 1000);
  assert.equal(rolled.busyUntil, 1000 + DICE_MS);
  assert.equal(rolled.moveSeq, 0);
  const moved = clickMove(rolled);
  assert.equal(moved.busyUntil - rolled.busyUntil, HOP_MS + 160 + TRANSPORT_MS);
  assert.equal(moveHopCount(moved.lastMove!), 1);
});
