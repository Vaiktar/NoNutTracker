import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getBoard } from "./api";
import { Calendar } from "./components/Calendar";
import { DayPanel } from "./components/DayPanel";
import { Leaderboard } from "./components/Leaderboard";
import { Login } from "./components/Login";
import { formatPoints } from "./format";
import { clearSession, readSession } from "./session";
import type { Board, Session } from "./types";

function BoardScreen({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const next = await getBoard(session.token);
      if (id !== latest.current) return;
      setBoard(next);
      setError(null);
    } catch (err) {
      if (id !== latest.current) return;
      if (err instanceof ApiError && err.status === 401) {
        logoutRef.current();
        return;
      }
      setError(err instanceof Error ? err.message : "Non riesco a caricare il calendario");
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [session.token]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const day = board?.days.find((item) => item.date === selected) ?? null;
  const mine = board?.leaderboard.find((row) => row.username === board.me);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium tracking-[0.22em] text-ember uppercase">No Nut November</p>
            <p className="text-sm text-mist">
              {session.username}
              {mine ? ` · ${formatPoints(mine.points)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-line px-3 py-1.5 text-sm text-cream"
            >
              Aggiorna
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl border border-line px-3 py-1.5 text-sm text-mist"
            >
              Esci
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <aside className="lg:sticky lg:top-5 lg:col-start-2 lg:row-start-1">
          {board ? (
            <Leaderboard rows={board.leaderboard} me={board.me} />
          ) : (
            <section className="rounded-3xl border border-line bg-panel p-4 text-sm text-mist">Caricamento classifica…</section>
          )}
        </aside>

        <div className="grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
          {error && (
            <p role="alert" className="rounded-2xl border border-no/40 bg-no/10 px-4 py-3 text-sm text-no">
              {error}
            </p>
          )}
          {loading && !board && <p className="text-sm text-mist">Caricamento di novembre…</p>}
          {board && (
            <Calendar
              days={board.days}
              today={board.today}
              me={board.me}
              selected={selected}
              onSelect={setSelected}
            />
          )}
          {board && day && (
            <DayPanel
              key={day.date}
              day={day}
              today={board.today}
              me={board.me}
              token={session.token}
              onSaved={load}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => readSession());

  function logout() {
    clearSession();
    setSession(null);
  }

  if (!session) return <Login onSuccess={setSession} />;
  return <BoardScreen session={session} onLogout={logout} />;
}
