const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { novemberDates, todayISO, assertNovemberDate } = require("../src/dates");
const { USERS } = require("../src/users");
const { HttpError } = require("../src/errors");

const parentEnv = { ...process.env };
const port = 3099;
const base = `http://127.0.0.1:${port}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nonut-"));
const jpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEhMWFRUVGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGf/9k=",
  "base64",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDateRules() {
  assert(novemberDates().length === 30, "November has 30 days");
  assert(novemberDates()[0] === "2026-11-01", "month starts on the 1st");
  assert(novemberDates()[29] === "2026-11-30", "month ends on the 30th");
  assertNovemberDate("2026-11-15");
  let rejected = false;
  try {
    assertNovemberDate("2026-11-31");
  } catch (err) {
    rejected = err instanceof HttpError;
  }
  assert(rejected, "Nov 31 should be rejected");

  const savedLocal = process.env.LOCAL_DEV;
  const savedOverride = process.env.TODAY_OVERRIDE;
  try {
    delete process.env.LOCAL_DEV;
    process.env.TODAY_OVERRIDE = "2026-11-20";
    const blocked = todayISO(new Date("2026-10-31T16:00:00Z"));
    process.env.LOCAL_DEV = "true";
    const opened = todayISO(new Date("2026-10-31T16:00:00Z"));
    assert(blocked === "2026-10-31", `override leaked without LOCAL_DEV: ${blocked}`);
    assert(opened === "2026-11-20", `local override did not apply: ${opened}`);
  } finally {
    if (savedLocal === undefined) delete process.env.LOCAL_DEV;
    else process.env.LOCAL_DEV = savedLocal;
    if (savedOverride === undefined) delete process.env.TODAY_OVERRIDE;
    else process.env.TODAY_OVERRIDE = savedOverride;
  }
}

function startServer() {
  let logs = "";
  const server = spawn(process.execPath, ["src/local-server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...parentEnv,
      LOCAL_DEV: "true",
      PORT: String(port),
      TODAY_OVERRIDE: "2026-11-15",
      DATA_DIR: dataDir,
      LOCAL_BASE_URL: base,
      JWT_SECRET: "smoke-test-secret-value",
      CORS_ORIGINS: "http://localhost:5173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  return {
    kill() {
      server.kill();
    },
    logs() {
      return logs;
    },
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Vaik", password: "nope" }),
      });
      if (response.status === 401) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Server did not start");
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { status: response.status, payload };
}

async function login(username, password) {
  const result = await api("/login", { method: "POST", body: { username, password } });
  assert(result.status === 200, `${username} login failed: ${result.status}`);
  return result.payload.token;
}

async function runFlow() {
  const bad = await api("/login", { method: "POST", body: { username: "Vaik", password: "password2" } });
  assert(bad.status === 401, "wrong password should be 401");

  const tokens = {};
  for (const user of USERS) {
    tokens[user.username] = await login(user.username, user.password);
  }
  const wrongPaolo = await api("/login", {
    method: "POST",
    body: { username: "Paolo", password: "password1" },
  });
  assert(wrongPaolo.status === 401, "Paolo should reject password1");

  const noToken = await api("/board");
  assert(noToken.status === 401, "board requires auth");

  const missing = await api("/missing", { token: tokens.Vaik });
  assert(missing.status === 404, "unknown route should be 404");

  const initial = await api("/board", { token: tokens.Vaik });
  assert(initial.status === 200, "board should load");
  assert(initial.payload.today === "2026-11-15", "smoke server should simulate Nov 15");
  assert(initial.payload.days.length === 30, "board should list 30 days");
  assert(initial.payload.days[0].entries.length === 7, "each day lists 7 people");
  assert(initial.payload.days[14].locked === false, "Nov 15 is open");
  assert(initial.payload.days[15].locked === true, "Nov 16 is locked");
  assert(
    initial.payload.days[0].entries.every((entry) => entry.choice === "dimenticato"),
    "past empty days are Dimenticato",
  );
  assert(
    initial.payload.days[14].entries.every((entry) => entry.choice === null),
    "today stays empty",
  );
  assert(initial.payload.leaderboard.every((row) => row.points === -140), "14 missed days are -140");

  const future = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-20", choice: "si" },
  });
  assert(future.status === 400, "future day should be rejected");

  const outside = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-10-31", choice: "si" },
  });
  assert(outside.status === 400, "October should be rejected");

  const si = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-01", choice: "si" },
  });
  assert(si.status === 200, "Si should save");

  const again = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-01", choice: "si" },
  });
  assert(again.status === 200, "repeating Si should save");

  let board = await api("/board", { token: tokens.Blumi });
  let vaik = board.payload.leaderboard.find((row) => row.username === "Vaik");
  assert(vaik.points === -120, `Si on a forgotten day should land on -120, got ${vaik.points}`);
  const nov1 = board.payload.days[0].entries.find((entry) => entry.username === "Vaik");
  assert(nov1.choice === "si" && nov1.motivation === null, "Si is visible to the group without a note");

  const bareNo = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-01", choice: "no", motivation: "forgot" },
  });
  assert(bareNo.status === 400, "No without an image should fail");

  const emptyNote = await api("/uploads", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-01" },
  });
  assert(emptyNote.status === 200, "upload URL should be issued");
  const emptyPut = await fetch(emptyNote.payload.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: jpeg,
  });
  assert(emptyPut.status === 200, "image upload should succeed");
  const noNote = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "   ",
      imageKey: emptyNote.payload.imageKey,
    },
  });
  assert(noNote.status === 400, "blank motivation should fail");

  const longNote = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "x".repeat(501),
      imageKey: emptyNote.payload.imageKey,
    },
  });
  assert(longNote.status === 400, "long motivation should fail");

  const forged = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "alarm clock",
      imageKey: "proofs/Blumi/2026-11-01/11111111-1111-1111-1111-111111111111.jpg",
    },
  });
  assert(forged.status === 400, "another person's image key should fail");

  const missingFile = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "alarm clock",
      imageKey: "proofs/Vaik/2026-11-01/11111111-1111-1111-1111-111111111111.jpg",
    },
  });
  assert(missingFile.status === 400, "missing proof file should fail");

  const savedNo = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "alarm clock",
      imageKey: emptyNote.payload.imageKey,
    },
  });
  assert(savedNo.status === 200, "No with proof should save");

  const updatedNo = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: {
      date: "2026-11-01",
      choice: "no",
      motivation: "second alarm",
      imageKey: emptyNote.payload.imageKey,
    },
  });
  assert(updatedNo.status === 200, "updating a No should save");

  board = await api("/board", { token: tokens.Blumi });
  vaik = board.payload.leaderboard.find((row) => row.username === "Vaik");
  assert(vaik.points === -140, `switching Si to No should land on -140, got ${vaik.points}`);
  const failed = board.payload.days[0].entries.find((entry) => entry.username === "Vaik");
  assert(failed.choice === "no" && failed.motivation === "second alarm", "Blumi should see the updated note");
  assert(vaik.points === -140, "updating a No should not change the score again");
  assert(typeof failed.imageUrl === "string" && failed.imageUrl.includes("/__image"), "Blumi should get an image URL");
  const image = await fetch(failed.imageUrl);
  const bytes = Buffer.from(await image.arrayBuffer());
  assert(image.status === 200 && bytes.equals(jpeg), "proof image should round-trip");

  const second = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-02", choice: "si" },
  });
  assert(second.status === 200, "second day Si should save");

  for (const date of ["2026-11-01", "2026-11-02"]) {
    const mark = await api("/entries", {
      method: "POST",
      token: tokens.Blumi,
      body: { date, choice: "si" },
    });
    assert(mark.status === 200, `Blumi Si ${date} should save`);
  }

  const back = await api("/entries", {
    method: "POST",
    token: tokens.Vaik,
    body: { date: "2026-11-01", choice: "si" },
  });
  assert(back.status === 200, "changing No back to Si should save");

  board = await api("/board", { token: tokens.Paolo });
  const cleared = board.payload.days[0].entries.find((entry) => entry.username === "Vaik");
  assert(cleared.choice === "si" && cleared.motivation === null && cleared.imageUrl === null, "Si clears the proof");
  const order = board.payload.leaderboard.map((row) => `${row.rank}:${row.username}:${row.points}`);
  assert(
    order.join(",") === "1:Blumi:-100,2:Vaik:-100,3:Adam:-140,4:Frax:-140,5:Inad:-140,6:Lanza:-140,7:Paolo:-140",
    `unexpected standings ${order.join(",")}`,
  );
}

async function main() {
  assertDateRules();
  const server = startServer();
  try {
    await waitForServer();
    await runFlow();
    console.log("smoke ok");
  } catch (err) {
    console.error(server.logs());
    throw err;
  } finally {
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
