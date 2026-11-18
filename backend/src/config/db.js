require('dotenv').config();
const mongoose = require('mongoose');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/arixgear';

/* Task 30 — replica-set detection (MongoDB Transactions need a replica set /
   Atlas M10+). Cached after the first connect; consumed by the boot report
   and the admin system/status checklist. */
let REPLICA_SET = null; // null = unknown (not connected yet)

async function detectReplicaSet() {
  if (REPLICA_SET !== null) return REPLICA_SET;
  try {
    const hello = await mongoose.connection.admin().command({ hello: 1 });
    REPLICA_SET = Boolean(hello && hello.setName);
  } catch (_e) {
    REPLICA_SET = false;
  }
  return REPLICA_SET;
}

function replicaSetKnown() {
  return REPLICA_SET;
}

/* Serverless-safe: একই container-এ connection পুনরায় ব্যবহার হয়,
   তাই প্রতিটা request-এ নতুন connection খোলে না */
const cached = global._arixMongo || (global._arixMongo = { promise: null, logged: false });

async function connectDB() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  if (!process.env.MONGODB_URI && !cached.logged) {
    console.warn('[db] MONGODB_URI not set — using local default:', DEFAULT_URI);
    console.warn('[db] For production use MongoDB Atlas: MONGODB_URI=mongodb+srv://...');
  }

  // ইতোমধ্যে connected হলে সরাসরি ফিরে যাও
  if (mongoose.connection.readyState === 1) {
    return detectReplicaSet();
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose
      .connect(uri, {
        maxPoolSize: process.env.VERCEL ? 5 : 10,
        serverSelectionTimeoutMS: 8000,
        bufferCommands: false,
      })
      .then((m) => {
        console.log('[db] MongoDB connected →', m.connection.name);
        return m;
      })
      .catch((e) => {
        cached.promise = null; // পরের request-এ আবার চেষ্টা করবে
        throw e;
      });
  }

  await cached.promise;
  const rs = await detectReplicaSet();
  if (!cached.logged) {
    cached.logged = true;
    console.log(`[db] replica set: ${rs ? 'YES — transactions available' : 'no — order flows run in fallback mode (no multi-doc transactions)'}`);
  }
  return rs;
}

/* masked URI for the admin status page — never leak credentials */
function maskedUri() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  return uri.replace(/(\/\/[^:/@]+):([^@]*)@/, '$1:***@');
}

module.exports = connectDB;
module.exports.detectReplicaSet = detectReplicaSet;
module.exports.replicaSetKnown = replicaSetKnown;
module.exports.maskedUri = maskedUri;
