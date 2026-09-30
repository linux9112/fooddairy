/**
 * server/index.js
 * 
 * Main entry point for the Food Diary backend service.
 */

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    // Initialize database connection
    await db.initDb();

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n=================================================`);
      console.log(`🌿 Food Diary Backend Server Running`);
      const driver = typeof db.getActiveDriver === 'function' ? db.getActiveDriver() : (typeof db.getDriverName === 'function' ? db.getDriverName() : 'active');
      console.log(`🗄️ Database Driver: ${driver}`);
      console.log(`=================================================\n`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      console.log(`\n[SHUTDOWN] Received ${signal}. Closing HTTP server...`);
      server.close(async () => {
        try {
          await db.closePool();
          console.log('[SHUTDOWN] Database connections closed. Process terminating.');
          process.exit(0);
        } catch (e) {
          process.exit(1);
        }
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
