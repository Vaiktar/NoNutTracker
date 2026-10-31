import { useState, type FormEvent } from "react";
import { ApiError, login } from "../api";
import { writeSession } from "../session";
import type { Session } from "../types";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const session = await login(username.trim(), password);
      writeSession(session);
      onSuccess(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Accesso non riuscito");
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl border border-line bg-panel/95 p-7 shadow-2xl shadow-black/30"
      >
        <h1 className="font-display text-4xl text-cream">No Nut November</h1>

        <label className="mt-6 block text-sm text-mist" htmlFor="username">
          Nome utente
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-cream outline-none"
          required
        />

        <label className="mt-4 block text-sm text-mist" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-cream outline-none"
          required
        />

        {error && (
          <p role="alert" className="mt-4 text-sm text-no">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full rounded-xl bg-ember px-4 py-2.5 font-semibold text-ink disabled:opacity-60"
        >
          {pending ? "Accesso in corso…" : "Entra"}
        </button>
      </form>
    </main>
  );
}
