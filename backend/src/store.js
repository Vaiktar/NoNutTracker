const fs = require("fs");
const path = require("path");
const { HttpError } = require("./errors");

const MONTH_PK = "MONTH#2026-11";
const SCORE_PK = "SCORE";

let documentClient;
let s3Client;
let queue = Promise.resolve();

function isLocal() {
  return process.env.LOCAL_DEV === "true";
}

function withLock(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function dataFile() {
  const root = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  return path.join(root, "store.json");
}

function imagesRoot() {
  const root = process.env.DATA_DIR || path.join(__dirname, "..", "data");
  return path.resolve(root, "images");
}

function localImageFile(key) {
  if (typeof key !== "string" || key.includes("..") || path.isAbsolute(key)) {
    throw new HttpError(400, "Chiave immagine non valida");
  }
  const root = imagesRoot();
  const full = path.resolve(root, key);
  const relative = path.relative(root, full);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(400, "Chiave immagine non valida");
  }
  return full;
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { entries: {}, scores: {} };
    throw err;
  }
}

function writeData(data) {
  const file = dataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function pointsFor(choice) {
  if (choice === "si") return 10;
  if (choice === "no") return -10;
  throw new HttpError(400, "La scelta deve essere Sì o No");
}

function doc() {
  if (!documentClient) {
    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
    const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return documentClient;
}

function s3() {
  if (!s3Client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    // WHEN_REQUIRED keeps checksum headers out of browser presigned PUTs.
    s3Client = new S3Client({
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return s3Client;
}

function tableName() {
  if (!process.env.TABLE_NAME) throw new HttpError(500, "Tabella non configurata");
  return process.env.TABLE_NAME;
}

function bucketName() {
  if (!process.env.BUCKET_NAME) throw new HttpError(500, "Bucket non configurato");
  return process.env.BUCKET_NAME;
}

async function queryPk(pk) {
  const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
  const items = [];
  let startKey;
  do {
    const result = await doc().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
      }),
    );
    items.push(...(result.Items || []));
    startKey = result.LastEvaluatedKey;
  } while (startKey);
  return items;
}

async function loadBoardData() {
  if (isLocal()) {
    return withLock(async () => {
      const data = readData();
      return {
        entries: Object.values(data.entries),
        scores: { ...data.scores },
      };
    });
  }

  const [entries, scoreItems] = await Promise.all([queryPk(MONTH_PK), queryPk(SCORE_PK)]);
  const scores = {};
  for (const item of scoreItems) scores[item.sk] = Number(item.points) || 0;
  return { entries, scores };
}

function isConflict(err) {
  if (!err || err.name !== "TransactionCanceledException") return false;
  return (err.CancellationReasons || []).some((reason) => reason.Code === "ConditionalCheckFailed");
}

async function saveRemote(input) {
  const { GetCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
  const key = { pk: MONTH_PK, sk: `${input.date}#${input.username}` };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await doc().send(new GetCommand({ TableName: tableName(), Key: key }));
    const existing = current.Item;
    const oldPoints = existing ? pointsFor(existing.choice) : 0;
    const newPoints = pointsFor(input.choice);
    const delta = newPoints - oldPoints;
    const updatedAt = new Date().toISOString();

    const put = {
      TableName: tableName(),
      Item: {
        ...key,
        username: input.username,
        date: input.date,
        choice: input.choice,
        motivation: input.choice === "no" ? input.motivation : undefined,
        imageKey: input.choice === "no" ? input.imageKey : undefined,
        updatedAt,
      },
      ConditionExpression: existing ? "updatedAt = :expected" : "attribute_not_exists(sk)",
    };
    if (existing) put.ExpressionAttributeValues = { ":expected": existing.updatedAt };

    const transactItems = [{ Put: put }];
    if (delta !== 0) {
      transactItems.push({
        Update: {
          TableName: tableName(),
          Key: { pk: SCORE_PK, sk: input.username },
          UpdateExpression: "ADD #points :delta",
          ExpressionAttributeNames: { "#points": "points" },
          ExpressionAttributeValues: { ":delta": delta },
        },
      });
    }

    try {
      await doc().send(new TransactWriteCommand({ TransactItems: transactItems }));
      return;
    } catch (err) {
      if (!isConflict(err) || attempt === 2) {
        if (isConflict(err)) throw new HttpError(409, "Non sono riuscito a salvare, riprova");
        throw err;
      }
    }
  }
}

async function saveLocal(input) {
  return withLock(async () => {
    const data = readData();
    const id = `${input.date}#${input.username}`;
    const existing = data.entries[id];
    const oldPoints = existing ? pointsFor(existing.choice) : 0;
    const newPoints = pointsFor(input.choice);
    data.scores[input.username] = (data.scores[input.username] || 0) + (newPoints - oldPoints);
    const entry = {
      username: input.username,
      date: input.date,
      choice: input.choice,
      updatedAt: new Date().toISOString(),
    };
    if (input.choice === "no") {
      entry.motivation = input.motivation;
      entry.imageKey = input.imageKey;
    }
    data.entries[id] = entry;
    writeData(data);
  });
}

async function saveEntry(input) {
  if (isLocal()) return saveLocal(input);
  return saveRemote(input);
}

async function imageExists(imageKey) {
  if (isLocal()) return fs.existsSync(localImageFile(imageKey));

  const { HeadObjectCommand } = require("@aws-sdk/client-s3");
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: imageKey }));
    return true;
  } catch (err) {
    const status = err.$metadata && err.$metadata.httpStatusCode;
    if (status === 404 || err.name === "NotFound" || err.name === "NoSuchKey") return false;
    throw err;
  }
}

async function createUpload(imageKey) {
  if (isLocal()) {
    const base = process.env.LOCAL_BASE_URL || "http://localhost:3001";
    return `${base}/__upload?key=${encodeURIComponent(imageKey)}`;
  }

  const { PutObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucketName(),
      Key: imageKey,
      ContentType: "image/jpeg",
    }),
    { expiresIn: 900 },
  );
}

async function viewUrl(imageKey) {
  if (isLocal()) {
    const base = process.env.LOCAL_BASE_URL || "http://localhost:3001";
    return `${base}/__image?key=${encodeURIComponent(imageKey)}`;
  }

  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucketName(), Key: imageKey }),
    { expiresIn: 60 * 60 },
  );
}

function writeLocalImage(key, buffer) {
  const file = localImageFile(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
}

function readLocalImage(key) {
  const file = localImageFile(key);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

module.exports = {
  loadBoardData,
  saveEntry,
  imageExists,
  createUpload,
  viewUrl,
  writeLocalImage,
  readLocalImage,
};
