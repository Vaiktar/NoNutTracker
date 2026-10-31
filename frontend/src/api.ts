import type { Board, Session } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function apiUrl() {
  const url = import.meta.env.VITE_API_URL;
  if (!url) throw new ApiError(0, "VITE_API_URL non è impostato");
  return url.replace(/\/$/, "");
}

async function request<T>(path: string, init: RequestInit, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Server irraggiungibile");
  }

  const text = await response.text();
  let payload: { error?: string } | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as { error?: string };
    } catch {
      payload = { error: text.slice(0, 180) };
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error || "Richiesta non riuscita");
  }
  return payload as T;
}

export function login(username: string, password: string) {
  return request<Session>("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getBoard(token: string) {
  return request<Board>("/board", { method: "GET" }, token);
}

export async function saveSi(token: string, date: string) {
  await request("/entries", {
    method: "POST",
    body: JSON.stringify({ date, choice: "si" }),
  }, token);
}

export async function saveNo(token: string, date: string, motivation: string, file: Blob) {
  const presign = await request<{ uploadUrl: string; imageKey: string }>(
    "/uploads",
    { method: "POST", body: JSON.stringify({ date }) },
    token,
  );

  let upload: Response;
  try {
    upload = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: file,
    });
  } catch {
    throw new ApiError(0, "Caricamento della foto non riuscito");
  }
  if (!upload.ok) throw new ApiError(upload.status, "Caricamento della foto non riuscito");

  await request("/entries", {
    method: "POST",
    body: JSON.stringify({
      date,
      choice: "no",
      motivation,
      imageKey: presign.imageKey,
    }),
  }, token);
}
