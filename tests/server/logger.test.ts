import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { logger } from '../../src/server/utils/logger';

describe('Logger', () => {
  // Store original console methods
  const originalConsole = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  // Mock console methods
  let debugMock: ReturnType<typeof mock>;
  let infoMock: ReturnType<typeof mock>;
  let warnMock: ReturnType<typeof mock>;
  let errorMock: ReturnType<typeof mock>;

  beforeEach(() => {
    debugMock = mock(() => {});
    infoMock = mock(() => {});
    warnMock = mock(() => {});
    errorMock = mock(() => {});

    console.debug = debugMock;
    console.info = infoMock;
    console.warn = warnMock;
    console.error = errorMock;

    // Clear request ID between tests
    logger.setRequestId(undefined);
  });

  afterEach(() => {
    // Restore original console methods
    console.debug = originalConsole.debug;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });

  describe('setRequestId and getRequestId', () => {
    it('should set and get request ID', () => {
      logger.setRequestId('req-123');
      expect(logger.getRequestId()).toBe('req-123');
    });

    it('should clear request ID when set to undefined', () => {
      logger.setRequestId('req-123');
      logger.setRequestId(undefined);
      expect(logger.getRequestId()).toBeUndefined();
    });
  });

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test message');
      expect(infoMock.mock.calls.length).toBeGreaterThan(0);
      const logOutput = infoMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('[INFO]');
      expect(logOutput).toContain('Test message');
    });

    it('should include context in log output', () => {
      logger.info('Test message', { userId: '123', action: 'test' });
      const logOutput = infoMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('userId');
      expect(logOutput).toContain('123');
    });

    it('should include request ID when set', () => {
      logger.setRequestId('req-456');
      logger.info('Test message');
      const logOutput = infoMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('req-456');
    });
  });

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Warning message');
      expect(warnMock.mock.calls.length).toBeGreaterThan(0);
      const logOutput = warnMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('[WARN]');
      expect(logOutput).toContain('Warning message');
    });
  });

  describe('error', () => {
    it('should log error messages', () => {
      logger.error('Error message');
      expect(errorMock.mock.calls.length).toBeGreaterThan(0);
      const logOutput = errorMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('[ERROR]');
      expect(logOutput).toContain('Error message');
    });

    it('should include Error object details', () => {
      const error = new Error('Something went wrong');
      logger.error('An error occurred', error);
      const logOutput = errorMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('Something went wrong');
      expect(logOutput).toContain('stack');
    });

    it('should handle non-Error objects', () => {
      logger.error('An error occurred', 'string error');
      const logOutput = errorMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('string error');
    });

    it('should include context alongside error', () => {
      const error = new Error('DB error');
      logger.error('Database failed', error, { table: 'users' });
      const logOutput = errorMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('table');
      expect(logOutput).toContain('users');
    });
  });

  describe('child', () => {
    it('should create a child logger with base context', () => {
      const childLogger = logger.child({ service: 'auth' });
      childLogger.info('Child message');
      const logOutput = infoMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('service');
      expect(logOutput).toContain('auth');
      expect(logOutput).toContain('Child message');
    });

    it('should merge child context with call context', () => {
      const childLogger = logger.child({ service: 'auth' });
      childLogger.info('Child message', { action: 'login' });
      const logOutput = infoMock.mock.calls[0][0] as string;
      expect(logOutput).toContain('service');
      expect(logOutput).toContain('action');
    });

    it('should support all log levels', () => {
      const childLogger = logger.child({ service: 'test' });

      childLogger.warn('Warning');
      expect(warnMock.mock.calls.length).toBeGreaterThan(0);

      childLogger.error('Error');
      expect(errorMock.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('log format', () => {
    it('should include ISO timestamp', () => {
      logger.info('Test');
      const logOutput = infoMock.mock.calls[0][0] as string;
      // Check for ISO date format: YYYY-MM-DDTHH:mm:ss
      expect(logOutput).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
