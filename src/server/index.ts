import { createApp } from './app.js';
import { initDatabase, initSchema, runMigrations, closeDatabase } from './database/database.js';
import { authService } from './services/auth.service.js';
import { cleanupService } from './services/cleanup.service.js';
import { syncQueueService } from './services/integrations/sync-queue.service.js';
import { settingsCacheService } from './services/settings-cache.service.js';
import { initDefaultBrandingUrls } from './storage/files.js';
import { initializeEE } from './utils/ee.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  logger.info('Starting BugPin server...');

  // Database Initialization
  logger.info('Initializing database...');
  try {
    initDatabase();
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database', error);
    process.exit(1);
  }

  // Initialize base schema
  logger.info('Initializing database schema...');
  try {
    await initSchema();
    logger.info('Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize schema', error);
    process.exit(1);
  }

  // Run migrations (for future schema changes)
  logger.info('Running database migrations...');
  try {
    await runMigrations();
    logger.info('Database migrations completed');
  } catch (error) {
    logger.error('Failed to run migrations', error);
    process.exit(1);
  }

  // Warm up settings cache (fail-fast if DB unavailable)
  logger.info('Warming up settings cache...');
  try {
    await settingsCacheService.warmup();
    logger.info('Settings cache ready');
  } catch (error) {
    logger.error('FATAL: Failed to warm up settings cache', error);
    logger.error('Database may not be ready. Exiting...');
    process.exit(1);
  }

  // Bootstrap Admin User

  logger.info('Checking admin user...');
  const result = await authService.bootstrapAdmin();

  if (result.success) {
    if (result.value) {
      logger.info(`Admin user created: ${result.value.email}`);
    } else {
      logger.info('Admin user already exists');
    }
  } else {
    logger.warn('Failed to bootstrap admin user', { error: result.error });
  }

  // Initialize Branding Assets

  logger.info('Initializing branding assets...');
  try {
    await initDefaultBrandingUrls();
    logger.info('Branding assets initialized');
  } catch (error) {
    logger.warn('Failed to initialize branding assets', { error });
  }

  // Initialize Enterprise Edition (if available)

  logger.info('Checking Enterprise Edition...');
  try {
    await initializeEE();
  } catch (error) {
    logger.warn('Failed to initialize Enterprise Edition', { error });
  }

  // Create and Start Server

  const app = createApp();

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.fetch,
  });

  logger.info(`BugPin server running at http://${server.hostname}:${server.port}`);
  logger.info(`Environment: ${config.nodeEnv}`);

  // Start background services
  cleanupService.startCleanupScheduler();
  syncQueueService.start();

  // Graceful shutdown
  const shutdown = (): void => {
    logger.info('Shutting down server...');
    cleanupService.stopCleanupScheduler();
    syncQueueService.stop();
    server.stop();
    closeDatabase();
    logger.info('Server shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run the server
main().catch((error) => {
  logger.error('Fatal error starting server', error);
  process.exit(1);
});
