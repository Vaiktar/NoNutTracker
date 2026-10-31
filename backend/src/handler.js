const crypto = require("crypto");
const { USERNAMES } = require("./users");
const { HttpError } = require("./errors");
const { novemberDates, todayISO, assertNovemberDate } = require("./dates");
const { authenticate, readUser } = require("./auth");
const store = require("./store");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(payload),
  };
}

function header(event, name) {
  const headers = event.headers || {};
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name);
  return match ? headers[match] : undefined;
}

function readBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError(400, "JSON non valido");
    }
    return parsed;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "JSON non valido");
  }
}

function routePath(event) {
  const raw = event.rawPath || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

function assertOpen(date) {
  assertNovemberDate(date);
  if (date > todayISO()) throw new HttpError(400, "Questo giorno non è ancora aperto");
}

function dayPoints(choice) {
  if (choice === "si") return 10;
  if (choice === "no" || choice === "dimenticato") return -10;
  return 0;
}

function ownImageKey(username, date, imageKey) {
  const prefix = `proofs/${username}/${date}/`;
  if (typeof imageKey !== "string" || !imageKey.startsWith(prefix)) return false;
  return /^[0-9a-f-]{36}\.jpg$/i.test(imageKey.slice(prefix.length));
}

async function postLogin(event) {
  const body = readBody(event);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const token = authenticate(username, body.password);
  return json(200, { token, username });
}

async function entryView(username, item, date, today) {
  if (item && item.choice === "si") {
    return { username, choice: "si", motivation: null, imageUrl: null };
  }
  if (item && item.choice === "no") {
    return {
      username,
      choice: "no",
      motivation: typeof item.motivation === "string" ? item.motivation : "",
      imageUrl: item.imageKey ? await store.viewUrl(item.imageKey) : null,
    };
  }
  if (date < today) {
    return { username, choice: "dimenticato", motivation: null, imageUrl: null };
  }
  return { username, choice: null, motivation: null, imageUrl: null };
}

async function getBoard(username) {
  const today = todayISO();
  const { entries } = await store.loadBoardData();
  const byId = new Map(entries.map((item) => [`${item.date}#${item.username}`, item]));
  const days = await Promise.all(
    novemberDates().map(async (date) => ({
      date,
      locked: date > today,
      entries: await Promise.all(
        USERNAMES.map((name) => entryView(name, byId.get(`${date}#${name}`), date, today)),
      ),
    })),
  );

  const totals = Object.fromEntries(USERNAMES.map((name) => [name, 0]));
  for (const day of days) {
    for (const entry of day.entries) totals[entry.username] += dayPoints(entry.choice);
  }

  const leaderboard = USERNAMES.map((name) => ({
    username: name,
    points: totals[name],
  }))
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return json(200, {
    month: "2026-11",
    today,
    me: username,
    leaderboard,
    days,
  });
}

async function postUpload(username, event) {
  const body = readBody(event);
  assertOpen(body.date);
  const imageKey = `proofs/${username}/${body.date}/${crypto.randomUUID()}.jpg`;
  const uploadUrl = await store.createUpload(imageKey);
  return json(200, { uploadUrl, imageKey });
}

async function postEntry(username, event) {
  const body = readBody(event);
  assertOpen(body.date);
  if (body.choice !== "si" && body.choice !== "no") {
    throw new HttpError(400, "La scelta deve essere Sì o No");
  }

  if (body.choice === "si") {
    await store.saveEntry({
      username,
      date: body.date,
      choice: "si",
    });
    return json(200, { ok: true });
  }

  const motivation = typeof body.motivation === "string" ? body.motivation.trim() : "";
  if (motivation.length < 1 || motivation.length > 500) {
    throw new HttpError(400, "La motivazione deve avere da 1 a 500 caratteri");
  }
  if (!ownImageKey(username, body.date, body.imageKey)) {
    throw new HttpError(400, "Manca la foto");
  }
  if (!(await store.imageExists(body.imageKey))) {
    throw new HttpError(400, "Manca la foto");
  }

  await store.saveEntry({
    username,
    date: body.date,
    choice: "no",
    motivation,
    imageKey: body.imageKey,
  });
  return json(200, { ok: true });
}

async function handler(event) {
  const method = event.requestContext?.http?.method || "GET";
  const path = routePath(event);

  try {
    if (method === "POST" && path === "/login") return await postLogin(event);
    const username = readUser(header(event, "authorization"));
    if (method === "GET" && path === "/board") return await getBoard(username);
    if (method === "POST" && path === "/uploads") return await postUpload(username, event);
    if (method === "POST" && path === "/entries") return await postEntry(username, event);
    return json(404, { error: "Non trovato" });
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message });
    console.error(err);
    return json(500, { error: "Errore del server" });
  }
}

module.exports = { handler };
