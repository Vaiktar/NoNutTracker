const crypto = require("crypto");
const { USERS, USERNAMES } = require("./users");
const { HttpError } = require("./errors");

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 16) {
    throw new HttpError(500, "Autenticazione non configurata");
  }
  return value;
}

function safeEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left)).digest();
  const b = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function signToken(username) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + 45 * 24 * 60 * 60,
    }),
  );
  const data = `${header}.${body}`;
  const signature = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function authenticate(username, password) {
  const found = USERS.find((user) => user.username === username);
  const expected = found ? found.password : "password0";
  const supplied = typeof password === "string" ? password : "";
  if (!found || !safeEqual(expected, supplied)) {
    throw new HttpError(401, "Nome utente o password non validi");
  }
  return signToken(found.username);
}

function readUser(authorization) {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    throw new HttpError(401, "Devi entrare");
  }

  const token = authorization.slice("Bearer ".length).trim();
  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Devi entrare");

  const [header, body, signature] = parts;
  const data = `${header}.${body}`;
  const expected = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    throw new HttpError(401, "Devi entrare");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(401, "Devi entrare");
  }

  if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") {
    throw new HttpError(401, "Devi entrare");
  }
  if (payload.exp * 1000 < Date.now() || !USERNAMES.includes(payload.sub)) {
    throw new HttpError(401, "Devi entrare");
  }
  return payload.sub;
}

module.exports = { authenticate, readUser };
