import { useEffect, useState, type FormEvent } from "react";
import { ApiError, saveNo, saveSi } from "../api";
import { choiceLabel, choiceTone, longDate } from "../format";
import { compressImage, safeImageUrl } from "../image";
import type { Day } from "../types";

export function DayPanel({
  day,
  today,
  me,
  token,
  onSaved,
}: {
  day: Day;
  today: string;
  me: string;
  token: string;
  onSaved: () => Promise<void>;
}) {
  const mine = day.entries.find((entry) => entry.username === me);
  const [showNoForm, setShowNoForm] = useState(false);
  const [motivation, setMotivation] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.getElementById("day-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [day.date]);

  function chooseFile(next: File | null) {
    setFile(next);
    setPreview(null);
    if (!next) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(next);
  }

  async function markSi() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await saveSi(token, day.date);
      setShowNoForm(false);
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Non sono riuscito a salvare");
    } finally {
      setPending(false);
    }
  }

  async function markNo(event: FormEvent) {
    event.preventDefault();
    const note = motivation.trim();
    if (!note) {
      setError("Scrivi una nota breve");
      return;
    }
    if (!file) {
      setError("Allega una foto");
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const blob = await compressImage(file);
      await saveNo(token, day.date, note, blob);
      setShowNoForm(false);
      setMotivation("");
      setFile(null);
      setPreview(null);
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non sono riuscito a salvare");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="day-panel" className="rounded-3xl border border-line bg-panel/95 p-4 sm:p-5" aria-labelledby="day-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-mist uppercase">
            {day.date === today ? "Oggi" : day.locked ? "Non ancora" : "Puoi modificare"}
          </p>
          <h2 id="day-title" className="font-display text-3xl">
            {longDate(day.date)}
          </h2>
        </div>
        {mine?.choice && (
          <p className={`text-sm font-semibold ${choiceTone(mine.choice)}`}>
            Il tuo segno: {choiceLabel(mine.choice)}
          </p>
        )}
      </div>

      {day.locked ? (
        <p className="mt-4 text-sm text-mist">Questo giorno non è ancora iniziato.</p>
      ) : (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void markSi()}
              className="rounded-xl bg-si px-4 py-2 text-sm font-semibold text-ink hover:bg-[#9ae0bb] disabled:opacity-60"
            >
              Sì · +10
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setShowNoForm((open) => !open);
                setMotivation("");
                setFile(null);
                setPreview(null);
                setError(null);
                setSaved(false);
              }}
              className={`rounded-xl bg-no px-4 py-2 text-sm font-semibold text-ink hover:bg-[#f3a394] disabled:opacity-60 ${
                showNoForm ? "ring-2 ring-cream/70" : ""
              }`}
              aria-expanded={showNoForm}
            >
              No · −10
            </button>
          </div>

          {showNoForm && (
            <form onSubmit={markNo} className="mt-4 grid gap-3 rounded-2xl border border-line bg-ink/40 p-3">
              <label className="text-sm text-mist" htmlFor="motivation">
                Cos'è successo?
              </label>
              <textarea
                id="motivation"
                value={motivation}
                maxLength={500}
                required
                onChange={(event) => setMotivation(event.target.value)}
                className="min-h-24 rounded-xl border border-line bg-ink px-3 py-2 text-sm text-cream outline-none"
              />
              <label className="text-sm text-mist" htmlFor="proof">
                Prova fotografica
              </label>
              <input
                id="proof"
                type="file"
                accept="image/*"
                required
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                className="text-sm text-mist file:mr-3 file:rounded-lg file:border-0 file:bg-panel-2 file:px-3 file:py-1.5 file:text-cream file:hover:bg-line"
              />
              {preview && (
                <img src={preview} alt="Anteprima della prova" className="max-h-56 rounded-xl object-contain" />
              )}
              <button
                type="submit"
                disabled={pending}
                className="justify-self-start rounded-xl border border-no px-4 py-2 text-sm font-semibold text-no hover:bg-no/15 disabled:opacity-60"
              >
                {pending ? "Salvataggio…" : "Salva No"}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-no">
              {error}
            </p>
          )}
          {saved && !error && <p className="mt-3 text-sm text-si">Salvato.</p>}
        </div>
      )}

      <ul className="mt-5 grid gap-2">
        {day.entries.map((entry) => {
          const image = safeImageUrl(entry.imageUrl);
          return (
            <li key={entry.username} className="rounded-2xl border border-line bg-panel-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className={entry.username === me ? "font-semibold text-ember" : "font-medium"}>
                  {entry.username}
                </span>
                <span className={`text-sm font-semibold ${choiceTone(entry.choice)}`}>
                  {choiceLabel(entry.choice)}
                </span>
              </div>
              {entry.choice === "no" && (
                <div className="mt-2 grid gap-2">
                  <p className="text-sm leading-6 text-cream">{entry.motivation}</p>
                  {image && (
                    <img
                      src={image}
                      alt={`Prova di ${entry.username}`}
                      className="max-h-64 w-full rounded-xl bg-ink object-contain"
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
