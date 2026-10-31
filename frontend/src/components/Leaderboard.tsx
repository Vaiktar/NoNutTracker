import { formatPoints } from "../format";
import type { Standing } from "../types";

export function Leaderboard({ rows, me }: { rows: Standing[]; me: string }) {
  const span = Math.max(10, ...rows.map((row) => Math.abs(row.points)));

  return (
    <section className="rounded-3xl border border-line bg-panel/95 p-4" aria-labelledby="standings-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="standings-title" className="font-display text-2xl">
          Classifica
        </h2>
        <p className="text-xs text-mist">Sì +10 · No −10</p>
      </div>
      <ol className="mt-3 grid gap-1.5">
        {rows.map((row) => {
          const width = `${Math.round((Math.abs(row.points) / span) * 100)}%`;
          const mine = row.username === me;
          return (
            <li
              key={row.username}
              className={`rounded-2xl border px-3 py-2 ${mine ? "border-ember/70 bg-ember/10" : "border-transparent bg-panel-2"}`}
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-sm text-mist">{row.rank}</span>
                <span className={`flex-1 font-medium ${mine ? "text-ember" : "text-cream"}`}>
                  {row.username}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    row.points > 0 ? "text-si" : row.points < 0 ? "text-no" : "text-mist"
                  }`}
                >
                  {formatPoints(row.points)}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink">
                <div
                  className={`h-full rounded-full ${row.points < 0 ? "bg-no" : "bg-si"}`}
                  style={{ width }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
