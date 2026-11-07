import type { GameMode } from "@/types/game";

export function GameModePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: GameMode;
  disabled?: boolean;
  onChange: (mode: GameMode) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 px-1 text-xs font-bold text-[#5a7e99]">انتخاب بازی</legend>
      <div className="flex gap-1.5 rounded-2xl bg-[#eaf2f7] p-1.5">
        {([
          ["ludo", "منچ", "مهره‌ها را به خانه برسان"],
          ["snakes", "مار و پله", "یک مهره تا خانهٔ ۱۰۰"],
        ] as const).map(([mode, title, detail]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            className={`seg min-w-0 flex-col rounded-xl !px-2 !py-2.5 ${value === mode ? "seg-on" : ""}`}
            onClick={() => onChange(mode)}
          >
            <span className="text-sm font-extrabold">{title}</span>
            <span className="text-[10px] opacity-75">{detail}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
