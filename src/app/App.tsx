import { useMemo } from "react";
import { GameScreen } from "@/components/GameScreen";
import { Lobby } from "@/components/Lobby";
import { useGameSession } from "@/hooks/useGameSession";
import { createLocalMatch } from "@/utils/gameRules";
import type { GameState } from "@/types/game";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const room = (params.get("room") ?? "").toUpperCase();
  const resultPreview = import.meta.env.DEV && params.get("previewResult") === "1";
  const previewState = useMemo<GameState | null>(() => {
    if (!resultPreview) return null;
    const sample = createLocalMatch(
      4,
      [
        { name: "آرمان", kind: "human", seat: 0 },
        { name: "سارا", kind: "bot", seat: 1 },
        { name: "کیان", kind: "bot", seat: 2 },
        { name: "نیما", kind: "bot", seat: 3 },
      ],
      "آرمان",
    );
    return {
      ...sample,
      status: "finished",
      rankings: [sample.players[1].id, sample.players[0].id, sample.players[2].id, sample.players[3].id],
    };
  }, [resultPreview]);
  const session = useGameSession();

  if (!session.state && !previewState) {
    if (session.waiting) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-display text-4xl text-[#14324f]">منچ بازی</p>
          <p className="max-w-sm text-[#24506f]">{session.syncDetail ?? "در حال باز کردن لینک…"}</p>
          {session.error ? <p className="text-sm text-rose-700">{session.error}</p> : null}
          <button type="button" className="btn-ghost" onClick={session.leave}>
            لغو
          </button>
        </div>
      );
    }
    return (
      <Lobby
        initialRoom={room}
        busy={session.waiting}
        error={session.error}
        onDismissError={session.dismissError}
        onLocal={session.startLocal}
        onCreate={(count, name, seat) => void session.createOnline(count, name, seat)}
        onJoin={(code, name, seat) => void session.joinOnline(code, name, seat)}
      />
    );
  }

  return (
    <>
      <GameScreen
        state={previewState ?? session.state!}
        online={session.online}
        isHost={session.isHost}
        myId={session.myId}
        syncStatus={session.syncStatus}
        syncDetail={session.syncDetail}
        soundOn={session.soundOn}
        diceRolling={session.diceRolling}
        inputLocked={session.inputLocked}
        offlinePeerIds={session.offlinePeerIds}
        reconnecting={session.reconnecting}
        onAct={session.act}
        onReconnect={() => void session.reconnect()}
        onLeave={session.leave}
        onToggleSound={session.toggleSound}
      />
      {session.error ? (
        <button type="button" className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-rose-600 px-4 py-2 text-sm text-white" onClick={session.dismissError}>
          {session.error}
        </button>
      ) : null}
    </>
  );
}
