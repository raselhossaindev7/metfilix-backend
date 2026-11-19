import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'metfilix';

let client = null;
let db = null;
let connecting = null;

export async function connect() {
  if (db) return db;
  if (!connecting) {
    client = new MongoClient(uri, {
      maxPoolSize: Number(process.env.MONGOPOOL_MAX || 10),
      serverSelectionTimeoutMS: Number(process.env.MONGO_TIMEOUT_MS || 8000),
    });
    connecting = client
      .connect()
      .then((c) => {
        db = c.db(dbName);
        return db;
      })
      .catch((e) => {
        connecting = null;
        throw e;
      });
  }
  return connecting;
}

export async function getDb() {
  return connect();
}

export async function getCollection(name) {
  const database = await connect();
  return database.collection(name);
}

export async function ping() {
  const database = await connect();
  await database.command({ ping: 1 });
}

export async function close() {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
  connecting = null;
}

// Atomic incrementing numeric id — keeps the public API's `id` field numeric
// (the TV app and admin use /movies/:id numeric routes).
export async function nextId(name) {
  const counters = await getCollection('counters');
  const result = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = unwrap(result);
  return doc?.seq ?? 1;
}

export async function setSequence(name, value) {
  const counters = await getCollection('counters');
  await counters.updateOne({ _id: name }, { $set: { seq: Number(value) || 0 } }, { upsert: true });
}

// mongodb v5 returned { value }, v6 returns the document directly.
export function unwrap(result) {
  if (result && typeof result === 'object' && 'value' in result) return result.value;
  return result;
}

export function clean(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

export function cleanAll(docs) {
  return (docs || []).map(clean);
}

export default { connect, getDb, getCollection, ping, close, nextId, setSequence, unwrap, clean, cleanAll };
