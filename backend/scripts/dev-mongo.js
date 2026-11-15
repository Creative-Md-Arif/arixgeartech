/**
 * Local development MongoDB — zero-setup.
 * Spins up an in-memory MongoDB (binary auto-downloaded once by
 * mongodb-memory-server) on mongodb://127.0.0.1:27017/arixgear
 * Usage:  npm run mongo   (keep this terminal open while developing)
 *
 * Production: point MONGODB_URI in .env to MongoDB Atlas — this script is NOT needed.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

// keep the ~270MB binary cache OUTSIDE the project tree so backups stay clean
// (re-downloads automatically if the cache dir is ever wiped)
process.env.MONGOMS_DOWNLOAD_DIR = process.env.MONGOMS_DOWNLOAD_DIR || '/tmp/mongodb-bin';

(async () => {
  console.log('Starting in-memory MongoDB (first run downloads the binary ~70MB)...');
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: 'arixgear', port: 27017, ip: '127.0.0.1' },
  });
  console.log('\n✅ MongoDB running:', mongod.getUri());
  console.log('   Keep this window open. Press Ctrl+C to stop.\n');
  // Data lives in memory — restarts are empty; run `npm run seed` again after restart.
  const shutdown = async () => { await mongod.stop(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((e) => {
  console.error('Failed to start in-memory MongoDB:', e.message);
  process.exit(1);
});
