import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LastMove, Player, Point, Token } from "@/types/game";
import { HOP_MS, moveDuration } from "@/utils/gameRules";
import { faDigits, themeFor } from "@/utils/palette";
import {
  curvePoint, LADDERS, SNAKES, SNAKES_CELL, snakeCurve, snakesPoint,
  TRANSPORT_MS, waitingPoint,
} from "@/utils/snakesAndLadders";

interface SnakesBoardProps {
  tokens: Token[];
  players: Player[];
  currentSeat: number | null;
  legalTokenIds: string[];
  lastMove: LastMove | null;
  onToken?: (tokenId: string) => void;
}

const CELL_COLORS = Array.from({ length: 5 }, (_, i) => `var(--snakes-cell-${i + 1})`);
const SNAKE_COLORS = ["#e89327", "#39a66b", "#cf4f96", "#e1ae24", "#42945c", "#a653bb"];

export function SnakesBoard({ tokens, players, currentSeat, legalTokenIds, lastMove, onToken }: SnakesBoardProps) {
  const offsets = useMemo(() => {
    const groups = new Map<number, Token[]>();
    for (const token of tokens) {
      if (token.progress < 0) continue;
      const group = groups.get(token.progress) ?? [];
      group.push(token);
      groups.set(token.progress, group);
    }
    const result = new Map<string, Point>();
    for (const group of groups.values()) {
      group.forEach((token, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / group.length;
        result.set(token.id, group.length === 1 ? { x: 0, y: 5 } : { x: Math.cos(angle) * 22, y: Math.sin(angle) * 22 + 5 });
      });
    }
    return result;
  }, [tokens]);

  return (
    <div className="board-shell snakes-board">
      <div className="board-frame">
        <svg viewBox="0 0 1000 1000" role="img" aria-label="صفحه مار و پله، از خانه ۱ تا ۱۰۰">
          <rect width="1000" height="1000" fill="var(--snakes-surface)" />
          {Array.from({ length: 100 }, (_, i) => {
            const square = i + 1;
            const p = snakesPoint(square);
            const row = Math.floor(i / 10);
            return (
              <g key={square}>
                <rect x={p.x - SNAKES_CELL / 2} y={p.y - SNAKES_CELL / 2}
                  width={SNAKES_CELL} height={SNAKES_CELL}
                  fill={CELL_COLORS[(i + row * 2) % CELL_COLORS.length]} stroke="var(--snakes-grid)" strokeWidth="2" />
                <text x={p.x - 34} y={p.y - 20} fontSize="28" fontWeight="800" fill="var(--snakes-ink)"
                  stroke="var(--snakes-number-outline)" strokeWidth="2" paintOrder="stroke" direction="ltr">{faDigits(square)}</text>
              </g>
            );
          })}
          {LADDERS.map(([from, to]) => <Ladder key={from} from={from} to={to} />)}
          {SNAKES.map(([from, to], i) => <Snake key={from} from={from} to={to} color={SNAKE_COLORS[i]} />)}
          <rect x="40" y="20" width="920" height="920" rx="3" fill="none" stroke="var(--snakes-edge)" strokeWidth="5" />
          <text x="74" y="923" fontSize="17" fontWeight="800" fill="var(--snakes-ink)" direction="ltr">شروع →</text>
          <text x="84" y="91" textAnchor="middle" fontSize="30" fill="var(--snakes-star)" aria-hidden="true">★</text>
          {players.map((player) => {
            const token = tokens.find((item) => item.playerId === player.id);
            if (token && token.progress >= 0) return null;
            const p = waitingPoint(player.seat);
            const theme = themeFor(player.seat);
            return (
              <g key={player.id}>
                <circle cx={p.x} cy={p.y} r="23" fill={theme.soft} stroke={theme.deep}
                  strokeWidth={player.seat === currentSeat ? 3 : 1} opacity="0.7" />
                <text x={p.x + 34} y={p.y + 7} textAnchor="start" direction="ltr"
                  fontSize="17" fontWeight="700" fill="var(--snakes-ink)">۶</text>
              </g>
            );
          })}
        </svg>
        {tokens.map((token) => (
          <SnakesToken key={token.id} token={token}
            name={players.find((player) => player.id === token.playerId)?.name ?? "بازیکن"}
            offset={offsets.get(token.id) ?? { x: 0, y: 0 }}
            legal={legalTokenIds.includes(token.id)} active={token.seat === currentSeat}
            move={lastMove?.tokenId === token.id || lastMove?.capturedIds.includes(token.id) ? lastMove : null} onToken={onToken} />
        ))}
      </div>
    </div>
  );
}

function Ladder({ from, to }: { from: number; to: number }) {
  const a = snakesPoint(from);
  const b = snakesPoint(to);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const rungs = Math.max(3, Math.floor(length / 30));
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
      <title>نردبان از {faDigits(from)} به {faDigits(to)}</title>
      <g stroke="#4b2f24" strokeWidth="10" strokeLinecap="round">
        <line x1="0" y1="-16" x2={length} y2="-16" />
        <line x1="0" y1="16" x2={length} y2="16" />
      </g>
      <g stroke="#f4ce8c" strokeWidth="5" strokeLinecap="round">
        <line x1="0" y1="-16" x2={length} y2="-16" />
        <line x1="0" y1="16" x2={length} y2="16" />
        {Array.from({ length: rungs }, (_, i) => (
          <line key={i} x1={(i + 0.5) * length / rungs} y1="-16" x2={(i + 0.5) * length / rungs} y2="16"
            stroke="#6c4330" strokeWidth="7" />
        ))}
      </g>
      <circle r="6" fill="#fff7dd" />
      <path d={`M ${length - 17} -6 L ${length - 7} 0 L ${length - 17} 6`} fill="none" stroke="#fff7dd" strokeWidth="3" />
    </g>
  );
}

function Snake({ from, to, color }: { from: number; to: number; color: string }) {
  const [a, b, c, d] = snakeCurve(from, to);
  const path = `M ${a.x} ${a.y} C ${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return (
    <g>
      <title>مار از {faDigits(from)} به {faDigits(to)}</title>
      <path d={path} fill="none" stroke="#173b3b" strokeWidth="25" strokeLinecap="round" />
      <path d={path} fill="none" stroke={color} strokeWidth="20" strokeLinecap="round" />
      <path d={path} fill="none" stroke="#fff5c7" strokeOpacity="0.6" strokeWidth="6" strokeDasharray="3 17" />
      <g transform={`translate(${a.x} ${a.y}) rotate(${angle})`}>
        <ellipse rx="24" ry="19" fill={color} stroke="#173b3b" strokeWidth="2" />
        <ellipse cx="-9" cy="-9" rx="6" ry="5" fill="#fff" />
        <ellipse cx="-9" cy="9" rx="6" ry="5" fill="#fff" />
        <circle cx="-11" cy="-9" r="2.5" fill="#173b3b" />
        <circle cx="-11" cy="9" r="2.5" fill="#173b3b" />
        <path d="M -24 0 h -12 m 0 0 -5 -4 m 5 4 -5 4" stroke="#c73e52" strokeWidth="2" fill="none" />
      </g>
      <circle cx={d.x} cy={d.y} r="5" fill={color} />
    </g>
  );
}

function SnakesToken({ token, name, offset, legal, active, move, onToken }: {
  token: Token; name: string; offset: Point; legal: boolean; active: boolean;
  move: LastMove | null; onToken?: (tokenId: string) => void;
}) {
  const pointFor = (progress: number) => progress < 0 ? waitingPoint(token.seat) : snakesPoint(progress);
  const target = pointFor(token.progress);
  const [pose, setPose] = useState<Point>(target);
  const gradientId = useId();
  const previous = useRef({ progress: token.progress, moveId: move?.id });
  const moveId = move?.id;
  const moveTo = move?.to;
  const moveLanding = move?.landing;
  const captured = move?.capturedIds.includes(token.id) ?? false;
  const captureWaitMs = captured && move ? moveDuration(move) : 0;

  useEffect(() => {
    const from = previous.current.progress;
    const to = token.progress;
    const isNewMove = moveId != null && moveId !== previous.current.moveId && moveTo === to;
    const isNewCapture = moveId != null && moveId !== previous.current.moveId && captured && to < 0;
    previous.current = { progress: to, moveId };
    const end = to < 0 ? waitingPoint(token.seat) : snakesPoint(to);
    if ((!isNewMove && !isNewCapture) || from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPose(end);
      return;
    }
    if (isNewCapture) {
      const start = snakesPoint(from);
      let frame = 0;
      setPose(start);
      // Keep the victim on the board until the arriving token reaches it.
      const timer = window.setTimeout(() => {
        const started = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - started) / HOP_MS);
          const eased = t * t * (3 - 2 * t);
          setPose({ x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased - Math.sin(t * Math.PI) * 35 });
          if (t < 1) frame = requestAnimationFrame(tick);
          else setPose(end);
        };
        frame = requestAnimationFrame(tick);
      }, captureWaitMs);
      return () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
      };
    }
    const landing = moveLanding ?? to;
    const points: Point[] = [from < 0 ? waitingPoint(token.seat) : snakesPoint(from)];
    if (from < 0) points.push(snakesPoint(landing));
    else for (let square = from + 1; square <= landing; square++) points.push(snakesPoint(square));
    const walkingMs = Math.max(1, points.length - 1) * HOP_MS;
    const transport = landing !== to;
    const duration = walkingMs + (transport ? TRANSPORT_MS : 0);
    const curve = transport && to < landing ? snakeCurve(landing, to) : null;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = Math.min(duration, now - started);
      if (elapsed < walkingMs) {
        const step = elapsed / HOP_MS;
        const i = Math.min(points.length - 2, Math.floor(step));
        const local = step - i;
        const eased = local * local * (3 - 2 * local);
        const a = points[i];
        const b = points[i + 1];
        setPose({ x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased - Math.sin(local * Math.PI) * 10 });
      } else if (transport) {
        const t = Math.min(1, (elapsed - walkingMs) / TRANSPORT_MS);
        const eased = t * t * (3 - 2 * t);
        const a = snakesPoint(landing);
        setPose(curve ? curvePoint(curve, eased) : { x: a.x + (end.x - a.x) * eased, y: a.y + (end.y - a.y) * eased });
      } else setPose(end);
      if (elapsed < duration) frame = requestAnimationFrame(tick);
      else setPose(end);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [token.progress, token.seat, moveId, moveTo, moveLanding, captured, captureWaitMs]);

  const theme = themeFor(token.seat);
  const location = token.progress < 0 ? "منتظر شش" : `خانه ${faDigits(token.progress)}`;
  return (
    <button type="button" className={`token-btn snakes-token ${legal ? "token-legal" : ""} ${active ? "snakes-token-active" : ""}`}
      style={{ left: `${(pose.x + offset.x) / 10}%`, top: `${(pose.y + offset.y) / 10}%`, zIndex: move?.tokenId === token.id ? 6 : captured ? 5 : undefined }}
      disabled={!legal} onClick={() => legal && onToken?.(token.id)} aria-label={`${name}، ${location}`} title={`${name} · ${location}`}>
      {legal ? <span className="token-ring" /> : null}
      <svg viewBox="0 0 80 96" aria-hidden="true">
        <defs>
          <linearGradient id={`${gradientId}-body`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={theme.deep} />
            <stop offset="0.28" stopColor={theme.soft} />
            <stop offset="0.52" stopColor={theme.hex} />
            <stop offset="1" stopColor={theme.deep} />
          </linearGradient>
          <radialGradient id={`${gradientId}-head`} cx="0.32" cy="0.25" r="0.8">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.25" stopColor={theme.soft} />
            <stop offset="0.65" stopColor={theme.hex} />
            <stop offset="1" stopColor={theme.deep} />
          </radialGradient>
          <linearGradient id={`${gradientId}-base`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--snakes-token-base)" />
            <stop offset="0.6" stopColor="var(--snakes-token-base-shade)" />
            <stop offset="1" stopColor="#8a9baa" />
          </linearGradient>
        </defs>
        <ellipse cx="40" cy="88" rx="32" ry="6" fill="#17344f" opacity="0.32" />
        <path d="M9 76 V83 C9 97 71 97 71 83 V76Z" fill={`url(#${gradientId}-base)`} stroke="#40576a" strokeWidth="1.5" />
        <ellipse cx="40" cy="76" rx="31" ry="11" fill="var(--snakes-token-base)" stroke="var(--snakes-token-edge)" strokeWidth="3" />
        <path d="M29 36 C30 49 25 60 20 67 C14 76 21 83 40 83 C59 83 66 76 60 67 C55 60 50 49 51 36Z"
          fill={`url(#${gradientId}-body)`} stroke="var(--snakes-token-edge)" strokeWidth="2.5" />
        <path d="M29 49 Q27 63 23 68 Q19 74 29 77" fill="none" stroke="#fff" strokeOpacity="0.65" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="40" cy="39" rx="13" ry="5" fill={theme.deep} />
        <circle cx="40" cy="23" r="18" fill={`url(#${gradientId}-head)`} stroke="var(--snakes-token-edge)" strokeWidth="3" />
        <ellipse cx="34" cy="16" rx="5" ry="7" fill="#fff" opacity="0.6" transform="rotate(25 34 16)" />
        <path d="M21 76 Q40 85 59 76" fill="none" stroke={theme.deep} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}
