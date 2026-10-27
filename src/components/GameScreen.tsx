import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bot,
  Copy,
  Check,
  Clock3,
  LogOut,
  Menu,
  Palette,
  RotateCcw,
  Settings2,
  Trophy,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { GameState, Intent } from "@/types/game";
import { buildLayout, seatChoices } from "@/utils/boardGeometry";
import { activePlayer, legalMoves, playerFinished, tokenParked } from "@/utils/gameRules";
import { faDigits, PLAYER_THEMES, themeFor } from "@/utils/palette";
import { Dice } from "@/components/Dice";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LudoBoard } from "@/components/LudoBoard";

interface GameScreenProps {
  state: GameState;
  online: boolean;
  isHost: boolean;
  myId: string | null;
  syncStatus: string;
  syncDetail: string | null;
  soundOn: boolean;
  diceRolling: boolean;
  inputLocked: boolean;
  offlinePeerIds: string[];
  reconnecting: boolean;
  onAct: (intent: Intent) => void;
  onReconnect: () => void;
  onLeave: () => void;
  onToggleSound: () => void;
}

export function GameScreen(props: GameScreenProps) {
  const { state } = props;
  const layout = useMemo(() => buildLayout(state.maxPlayers), [state.maxPlayers]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [dismissedResultRevision, setDismissedResultRevision] = useState<number | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const current = activePlayer(state);
  const roller = state.players[state.rollerIndex] ?? current;
  const displayed =
    props.diceRolling && state.phase === "roll" && roller ? roller : current;
  const moves = useMemo(() => legalMoves(state), [state]);
  const controllable =
    state.status === "playing" &&
    displayed &&
    !playerFinished(state, displayed.id) &&
    (props.online ? displayed.id === props.myId : displayed.kind === "human");
  const canRoll = Boolean(
    controllable && state.phase === "roll" && !props.inputLocked && !props.diceRolling,
  );
  const canMove = Boolean(
    controllable && state.phase === "move" && !props.inputLocked && !props.diceRolling,
  );
  const place = (id: string) => {
    const index = state.rankings.indexOf(id);
    return index === -1 ? null : index + 1;
  };

  async function copyLink() {
    const code = state.roomId ?? "";
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const playing = state.status !== "lobby";
  const showResults =
    state.status === "finished" && dismissedResultRevision !== state.revision;

  useEffect(() => {
    if (state.status !== "playing") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        !mobileMenuRef.current?.contains(event.target)
      ) {
        setMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(190px,30%)] sm:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_380px]">
      <header className="game-header relative z-30 flex min-w-0 shrink-0 items-center justify-between gap-2 border-b border-[#14324f]/10 px-2 py-2 sm:col-span-2 sm:gap-3 sm:px-3 lg:px-4 lg:py-3">
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-none text-[#14324f] sm:text-xl lg:text-2xl">
            منچ بازی
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#5a7e99]">
            <span className="truncate">
              {faDigits(state.maxPlayers)} نفره ·{" "}
              {props.online ? `اتاق ${state.roomId}` : "روی همین دستگاه"}
            </span>
            {props.online ? (
              <span
                className={`shrink-0 text-[10px] font-extrabold ${
                  props.syncStatus === "live" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {props.syncStatus === "live" ? "وصل" : "قطع"}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {props.online && state.roomId ? (
            <button
              type="button"
              className="icon-btn !h-8 !w-8 sm:!h-9 sm:!w-auto sm:!px-3"
              onClick={props.onReconnect}
              disabled={props.reconnecting}
              aria-label="سینک مجدد"
              title="سینک مجدد"
            >
              <RotateCcw size={14} className={props.reconnecting ? "animate-spin" : ""} />
              <span className="hidden text-xs font-semibold sm:inline">سینک مجدد</span>
            </button>
          ) : null}
          <div className="hidden items-center gap-1 lg:flex lg:gap-2">
            {props.online && state.roomId ? (
              <button
                type="button"
                className="icon-btn game-header-icon"
                onClick={() => void copyLink()}
                aria-label="کپی لینک اتاق"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            ) : null}
            <ThemeToggle />
            <button
              type="button"
              className="icon-btn game-header-icon"
              onClick={props.onToggleSound}
              aria-label={props.soundOn ? "بی‌صدا" : "صدادار"}
            >
              {props.soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              type="button"
              className="icon-btn game-header-icon"
              onClick={() => setRulesOpen(true)}
              aria-label="قوانین"
            >
              <BookOpen size={16} />
            </button>
            <button
              type="button"
              className="icon-btn game-header-icon"
              onClick={() => setLeaveOpen(true)}
              aria-label="خروج"
            >
              <LogOut size={16} />
            </button>
          </div>
          <div className="relative lg:hidden" ref={mobileMenuRef}>
            <button
              type="button"
              className="icon-btn game-header-icon"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "بستن منو" : "باز کردن منو"}
              aria-expanded={mobileMenuOpen}
              aria-haspopup="menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            {mobileMenuOpen ? (
              <div
                role="menu"
                aria-label="تنظیمات بازی"
                className="absolute left-0 top-[calc(100%+0.5rem)] z-50 grid min-w-52 gap-1 rounded-2xl border border-slate-200 bg-white p-2 text-[#16324d] shadow-xl dark:border-white/10 dark:bg-slate-900 dark:text-slate-100"
              >
                {props.online && state.roomId ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-right text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                    onClick={() => {
                      void copyLink();
                      setMobileMenuOpen(false);
                    }}
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                    کپی لینک اتاق
                  </button>
                ) : null}
                <ThemeToggle menuItem onToggle={() => setMobileMenuOpen(false)} />
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-right text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => {
                    props.onToggleSound();
                    setMobileMenuOpen(false);
                  }}
                >
                  {props.soundOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
                  {props.soundOn ? "بی‌صدا" : "صدادار"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-right text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
                  onClick={() => {
                    setRulesOpen(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  <BookOpen size={17} />
                  قوانین
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-right text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  onClick={() => {
                    setLeaveOpen(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  <LogOut size={17} />
                  خروج از بازی
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center sm:contents">
        <div
          className={`${playing ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-1 flex-col px-2 py-1 sm:justify-center sm:px-3 sm:py-2 lg:px-6 lg:py-3`}
        >
          <div className="board-slot min-h-0 w-full flex-1">
            <div className="board-fit">
              <LudoBoard
                layout={layout}
                tokens={state.tokens}
                players={state.players}
                currentSeat={displayed?.seat ?? null}
                legalTokenIds={canMove ? moves.map((move) => move.tokenId) : []}
                lastMove={state.lastMove}
                onToken={(tokenId) => props.onAct({ type: "move", tokenId })}
              />
            </div>
          </div>
        </div>

        <aside
          className={`flex min-h-0 flex-col border-[#14324f]/10 bg-white/75 lg:border-r lg:border-t-0 lg:bg-white/60 lg:p-6 ${
            playing
              ? "shrink-0 overflow-x-hidden border-t px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:min-h-0 sm:overflow-y-auto sm:border-r sm:border-t-0 sm:px-2 sm:py-2 lg:px-3"
              : "flex-1 overflow-y-auto border-t p-4 lg:flex-none"
          }`}
        >
          {state.status === "lobby" ? (
            <div className="m-auto w-full max-w-sm">
              <LobbyPanel {...props} />
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 lg:h-full lg:justify-between lg:gap-6">
              <div className="flex items-center gap-2 sm:flex-col sm:items-stretch lg:contents">
                <div className="min-w-0 flex-1 lg:contents">
                  <TurnCard
                    name={displayed?.name ?? "منچ بازی"}
                    seat={displayed?.seat ?? 0}
                    mine={Boolean(displayed && props.myId && displayed.id === props.myId)}
                    deadline={
                      state.status === "playing" &&
                      state.phase === "roll" &&
                      !props.diceRolling
                        ? state.rollDeadline
                        : 0
                    }
                  />
                </div>
                <div className="dice-dock sm:w-full lg:order-2 lg:flex lg:flex-1 lg:items-center">
                  <Dice
                    value={state.dice}
                    rolling={props.diceRolling}
                    enabled={canRoll}
                    label=""
                    onRoll={() => props.onAct({ type: "roll" })}
                  />
                </div>
              </div>
              {state.lastMove && tokenParked(state, state.lastMove.tokenId) ? (
                <div className="lg:order-1">
                  <ArriveNote state={state} />
                </div>
              ) : null}
              <div className="flex w-full min-w-0 flex-col gap-1.5 py-1 lg:order-3 lg:gap-2 lg:pb-0">
                {state.players.map((player) => (
                  <SeatCard
                    key={player.id}
                    className="w-full"
                    name={player.name}
                    seat={player.seat}
                    active={displayed?.id === player.id}
                    bot={player.kind === "bot"}
                    place={place(player.id)}
                    online={props.online}
                    linked={
                      player.connected &&
                      !props.offlinePeerIds.includes(player.peerId ?? "")
                    }
                  />
                ))}
                {state.rankings.length > 0 && (props.isHost || !props.online) ? (
                  <button
                    type="button"
                    className="btn-primary mt-1 w-full"
                    onClick={() => props.onAct({ type: "rematch" })}
                  >
                    <RotateCcw size={16} /> شروع مجدد
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </aside>
      </div>

      {rulesOpen ? <Rules onClose={() => setRulesOpen(false)} /> : null}
      {leaveOpen ? (
        <ConfirmLeave
          onStay={() => setLeaveOpen(false)}
          onLeave={() => {
            setLeaveOpen(false);
            props.onLeave();
          }}
        />
      ) : null}
      {showResults ? (
        <GameResults
          state={state}
          onClose={() => setDismissedResultRevision(state.revision)}
        />
      ) : null}
    </div>
  );
}

function orderedResults(state: GameState) {
  const rankedPlayers = state.rankings
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is GameState["players"][number] => Boolean(player));
  const rankedIds = new Set(rankedPlayers.map((player) => player.id));
  return [
    ...rankedPlayers,
    ...state.players.filter((player) => !rankedIds.has(player.id)),
  ];
}

function GameResults({ state, onClose }: { state: GameState; onClose: () => void }) {
  const players = orderedResults(state);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#10263a]/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-results-title"
    >
      <section className="relative my-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-white/80 bg-gradient-to-b from-[#fffdf5] to-[#f0f8ff] p-5 text-[#16324d] shadow-[0_28px_90px_rgba(7,28,47,0.36)] sm:p-7">
        <button
          type="button"
          className="icon-btn absolute left-4 top-4"
          onClick={onClose}
          aria-label="بستن نتیجه"
        >
          <X size={18} />
        </button>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-[#ffe59a] text-[#a66b00] shadow-inner">
          <Trophy size={38} strokeWidth={2.2} />
        </div>
        <p className="mt-4 text-center text-sm font-bold text-[#9b741e]">پایان بازی</p>
        <h2
          id="game-results-title"
          className="mt-1 text-center font-display text-3xl text-[#14324f]"
        >
          نتیجه بازی
        </h2>
        <p className="mt-1 text-center text-sm text-[#5a7e99]">
          {players[0]?.name ?? "بازیکنان"} قهرمان این دور شد!
        </p>

        <ol className="mt-6 space-y-2.5">
          {players.map((player, index) => {
            const theme = themeFor(player.seat);
            return (
              <li
                key={player.id}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
                  index === 0
                    ? "border-[#f2d47c] bg-[#fff7d9] shadow-sm"
                    : "border-[#dce9f1] bg-white/80"
                }`}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white shadow-sm"
                  style={{ background: theme.hex }}
                >
                  {faDigits(index + 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-bold text-[#17344f]">
                  {player.name}
                </span>
                <span
                  className={`shrink-0 text-xs font-extrabold ${
                    index === 0 ? "text-amber-700" : "text-[#66829a]"
                  }`}
                >
                  {index === 0 ? "قهرمان 🏆" : `نفر ${faDigits(index + 1)}`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function LobbyPanel({ state, isHost, online, onAct }: GameScreenProps) {
  const empty = state.maxPlayers - state.players.length;
  const colors = seatChoices(state.maxPlayers);
  return (
    <div>
      <h2 className="font-display text-3xl text-[#14324f]">
        {state.roomId ?? "منچ بازی"}
      </h2>
      <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 dark:border-white/10 dark:bg-slate-900/85 dark:shadow-black/20">
        <div className="flex items-center gap-3 border-b border-slate-200/70 bg-gradient-to-l from-sky-50 to-white px-4 py-3 dark:border-white/10 dark:from-slate-800 dark:to-slate-900">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">
            <Settings2 size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
              تنظیمات بازی
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              شخصی‌سازی قوانین و رنگ‌ها
            </p>
          </div>
          {isHost ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              میزبان
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <span aria-hidden="true">●</span> فقط مشاهده
            </span>
          )}
        </div>

        <div className="space-y-4 p-3">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">
                <Clock3 size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  زمان پرتاب تاس
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {state.rollTimerEnabled
                    ? "۱۵ ثانیه برای هر نوبت"
                    : "بدون محدودیت زمانی"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.rollTimerEnabled}
                aria-label="تایمر پرتاب تاس"
                title={isHost ? "تغییر تایمر نوبت" : "فقط میزبان می‌تواند تغییر دهد"}
                disabled={!isHost}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-60 ${
                  state.rollTimerEnabled
                    ? "bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
                onClick={() =>
                  onAct({ type: "set-roll-timer", enabled: !state.rollTimerEnabled })
                }
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
                    state.rollTimerEnabled ? "right-1" : "right-6"
                  }`}
                />
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <Palette size={15} className="text-slate-500 dark:text-slate-400" />
              <p className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
                رنگ مهره‌های بازیکنان
              </p>
            </div>
            <div className="space-y-2">
              {state.players.map((player) => {
                const currentTheme = PLAYER_THEMES[player.seat];
                return (
                  <div
                    key={player.id}
                    className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-800/70"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white shadow-sm"
                      style={{ backgroundColor: currentTheme.hex }}
                    >
                      {player.name.trim().slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                        {player.name}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {currentTheme.label}
                      </p>
                    </div>
                    <div
                      className="flex shrink-0 items-center gap-1.5"
                      role="group"
                      aria-label={`انتخاب رنگ برای ${player.name}`}
                    >
                      {colors.map((seat) => {
                        const theme = PLAYER_THEMES[seat];
                        const selected = player.seat === seat;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            className={`grid h-6 w-6 place-items-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
                              selected
                                ? "ring-2 ring-slate-800 ring-offset-2 ring-offset-white dark:ring-white dark:ring-offset-slate-800"
                                : isHost
                                  ? "hover:scale-110"
                                  : "cursor-default"
                            }`}
                            style={{ backgroundColor: theme.hex }}
                            aria-label={`${player.name}: ${theme.label}`}
                            aria-pressed={selected}
                            title={`${player.name} · ${theme.label}`}
                            disabled={!isHost || selected}
                            onClick={() =>
                              onAct({
                                type: "set-player-seat",
                                playerId: player.id,
                                seat,
                              })
                            }
                          >
                            {selected ? (
                              <Check size={13} className="text-white drop-shadow" />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
      {isHost || !online ? (
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={empty === 0}
            onClick={() => onAct({ type: "add-bot" })}
          >
            <UserPlus size={16} /> افزودن ربات
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={state.players.length < 2 || state.players.length > state.maxPlayers}
            onClick={() => onAct({ type: "start" })}
          >
            شروع بازی
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#24506f]">منتظر شروع میزبان.</p>
      )}
    </div>
  );
}

function ArriveNote({ state }: { state: GameState }) {
  const move = state.lastMove;
  if (!move) return null;
  const player = state.players.find((item) => item.seat === move.seat);
  const theme = themeFor(move.seat);
  const finished = player ? playerFinished(state, player.id) : false;
  const text = finished
    ? `${player?.name ?? "بازیکن"} هر چهار مهره را در خانه‌های رنگی نشاند.`
    : `${player?.name ?? "بازیکن"} یک مهره را در خانه رنگی نشاند.`;
  return (
    <p
      className="rounded-2xl px-4 py-3 text-center text-sm font-bold text-[#14324f]"
      style={{ background: theme.soft }}
    >
      {text}
    </p>
  );
}

function ConfirmLeave({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onStay}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-[#16324d]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-3xl text-[#14324f]">خروج از بازی؟</h2>
        <p className="mt-3 text-sm leading-relaxed text-[#24506f]">
          اگر خارج شوید این دست را ترک می‌کنید.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost" onClick={onStay}>
            ماندن
          </button>
          <button type="button" className="btn-primary" onClick={onLeave}>
            خروج
          </button>
        </div>
      </div>
    </div>
  );
}

function TurnCard({
  name,
  seat,
  mine,
  deadline,
}: {
  name: string;
  seat: number;
  mine: boolean;
  deadline: number;
}) {
  const theme = themeFor(seat);
  const label = mine ? "شما" : name;
  return (
    <div
      className="flex w-full min-w-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm lg:gap-4 lg:rounded-[1.8rem] lg:px-5 lg:py-5"
      style={{ borderRight: `8px solid ${theme.hex}` }}
    >
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white shadow-inner lg:h-20 lg:w-20 lg:rounded-3xl lg:text-4xl"
        style={{ background: theme.hex }}
      >
        {label.trim().slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-[#5a7e99] lg:text-sm">نوبت</p>
        <p className="truncate text-xl font-extrabold leading-tight text-[#14324f] lg:text-4xl">
          {label}
        </p>
      </div>
      {deadline > 0 ? <RollClock deadline={deadline} /> : null}
    </div>
  );
}

function RollClock({ deadline }: { deadline: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg font-extrabold lg:h-14 lg:w-14 lg:text-2xl ${left <= 5 ? "bg-rose-100 text-rose-700" : "bg-[#eef6fb] text-[#14324f]"}`}
    >
      {faDigits(left)}
    </span>
  );
}

function placeLabel(place: number): string {
  if (place === 1) return "برنده بازی";
  const names = ["نفر دوم", "نفر سوم", "نفر چهارم", "نفر پنجم", "نفر ششم"];
  return names[place - 2] ?? `نفر ${faDigits(place)}`;
}

function LinkDot({ on }: { on: boolean }) {
  return (
    <span
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-rose-500"}`}
      title={on ? "وصل" : "قطع، در حال برگشت"}
    />
  );
}

function SeatCard({
  name,
  className,
  seat,
  active,
  bot,
  place,
  online,
  linked,
}: {
  name: string;
  className?: string;
  seat: number;
  active: boolean;
  bot: boolean;
  place: number | null;
  online: boolean;
  linked: boolean;
}) {
  const theme = themeFor(seat);
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-2 py-1.5 lg:w-full lg:gap-2 lg:px-3 lg:py-3 ${active ? "bg-white shadow-sm" : "bg-white/70"} ${className ?? ""}`}
      style={active ? { outline: `2px solid ${theme.hex}` } : undefined}
    >
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: theme.hex }} />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#14324f] lg:text-sm">
        {name}
      </span>
      {online && !bot ? <LinkDot on={linked} /> : null}
      {bot && !place ? <Bot size={14} className="shrink-0 text-[#7f9aaf]" /> : null}
      {place ? (
        <span
          className={`shrink-0 text-xs font-bold ${place === 1 ? "text-amber-600" : "text-[#5a7e99]"}`}
        >
          {placeLabel(place)}
        </span>
      ) : null}
    </div>
  );
}

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-[#16324d]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-3xl text-[#14324f]">قانون منچ بازی</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[#24506f]">
          <li>هر رنگ چهار مهره دارد و از خانه شروع می‌کند.</li>
          <li>
            با آوردن ۶ یک مهره روی خانه شروع همان رنگ می‌آید و دوباره تاس می‌اندازی.
          </li>
          <li>سه بار ۶ پشت سر هم نوبت را می‌سوزاند. شش سوم بازی نمی‌شود.</li>
          <li>
            اگر روی خانهٔ حریف بنشینی، همهٔ مهره‌های او در آن خانه به چهارخانهٔ اول
            برمی‌گردند.
          </li>
          <li>
            از مهره‌های سر راه می‌توانی رد شوی. فقط نشستن روی همان خانه آن‌ها را می‌زند.
          </li>
          <li>زدن مهره هم یک تاس اضافه می‌دهد.</li>
          <li>
            در مسیر رنگی، مهره اول در خانه پنجم می‌ایستد، بعدی در چهارم، و همین‌طور
            عقب‌تر. از مهره جلویی نمی‌شود رد شد و عدد اضافه هم مجاز نیست.
          </li>
          <li>اگر با آن تاس حرکتی ممکن نباشد، نوبت رد می‌شود.</li>
          <li>برای انداختن تاس ۱۵ ثانیه وقت هست. اگر نیندازی نوبت نفر بعدی می‌شود.</li>
          <li>
            هر کس زودتر هر چهار مهره را در خانه‌های رنگی بنشاند برنده است. بقیه ادامه
            می‌دهند و نفر دوم و سوم مشخص می‌شود.
          </li>
        </ul>
        <button type="button" className="btn-primary mt-5" onClick={onClose}>
          برگشت به میز
        </button>
      </div>
    </div>
  );
}
