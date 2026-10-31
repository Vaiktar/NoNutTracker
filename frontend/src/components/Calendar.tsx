import { WEEKDAY_LABELS, choiceLabel, weekdayIndex } from "../format";
import type { Choice, Day } from "../types";

function tone(choice: Choice | null) {
  if (choice === "si") return "bg-si/25 text-si";
  if (choice === "no") return "bg-no/25 text-no";
  if (choice === "dimenticato") return "bg-ember/20 text-ember";
  return "bg-white/5 text-mist";
}

export function Calendar({
  days,
  today,
  me,
  selected,
  onSelect,
}: {
  days: Day[];
  today: string;
  me: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const blanks = days.length ? weekdayIndex(days[0].date) : 0;
  const legend = days[0]?.entries ?? [];

  return (
    <section className="rounded-3xl border border-line bg-panel/95 p-4 sm:p-5" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.22em] text-ember uppercase">Calendario condiviso</p>
          <h2 id="calendar-title" className="font-display text-3xl">
            Novembre 2026
          </h2>
        </div>
        <p className="max-w-xs text-xs leading-5 text-mist">
          I giorni si aprono a mezzanotte, ora italiana. Un segno si può cambiare fino al 30.
        </p>
      </div>

      <ul className="mt-4 flex flex-wrap gap-2">
        {legend.map((entry) => (
          <li key={entry.username} className="rounded-full border border-line px-2.5 py-1 text-xs text-mist">
            <span className="mr-1 font-semibold text-cream">{entry.username.slice(0, 1)}</span>
            {entry.username}
          </li>
        ))}
      </ul>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] tracking-wide text-mist uppercase sm:gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-2">
        {Array.from({ length: blanks }, (_, index) => (
          <div key={`blank-${index}`} />
        ))}
        {days.map((day) => {
          const summary = day.entries
            .map((entry) => `${entry.username} ${choiceLabel(entry.choice)}`)
            .join(", ");
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={selected === day.date}
              aria-label={`${day.date}. ${summary}`}
              onClick={() => onSelect(day.date)}
              className={`min-h-16 rounded-2xl border px-1 py-1.5 text-left sm:min-h-24 sm:px-2 ${
                selected === day.date
                  ? "border-ember bg-panel-2"
                  : "border-line bg-ink/50 hover:border-ember/50"
              } ${day.locked ? "opacity-60" : ""}`}
            >
              <span className={`block text-xs font-semibold sm:text-sm ${day.date === today ? "text-ember" : "text-cream"}`}>
                {Number(day.date.slice(-2))}
              </span>
              <span className="mt-1 grid grid-cols-7 gap-px sm:mt-2 sm:gap-0.5">
                {day.entries.map((entry) => (
                  <span
                    key={entry.username}
                    title={`${entry.username}: ${choiceLabel(entry.choice)}`}
                    className={`mx-auto flex h-2.5 w-2.5 items-center justify-center rounded-full text-[9px] font-semibold sm:h-4 sm:w-4 ${tone(entry.choice)} ${
                      entry.username === me ? "ring-1 ring-ember" : ""
                    }`}
                  >
                    <span className="hidden sm:inline">{entry.username.slice(0, 1)}</span>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
