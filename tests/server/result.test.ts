import { describe, it, expect } from 'bun:test';
import { Result } from '../../src/server/utils/result';

describe('Result', () => {
  describe('ok', () => {
    it('should create a successful result with a value', () => {
      const result = Result.ok(42);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    it('should handle complex objects', () => {
      const data = { name: 'test', items: [1, 2, 3] };
      const result = Result.ok(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(data);
      }
    });

    it('should handle null and undefined values', () => {
      const nullResult = Result.ok(null);
      const undefinedResult = Result.ok(undefined);

      expect(nullResult.success).toBe(true);
      expect(undefinedResult.success).toBe(true);
    });
  });

  describe('fail', () => {
    it('should create a failed result with an error message', () => {
      const result = Result.fail<number>('Something went wrong');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Something went wrong');
        expect(result.code).toBeUndefined();
      }
    });

    it('should create a failed result with an error code', () => {
      const result = Result.fail<number>('Not found', 'NOT_FOUND');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Not found');
        expect(result.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('isOk', () => {
    it('should return true for successful results', () => {
      const result = Result.ok('test');
      expect(Result.isOk(result)).toBe(true);
    });

    it('should return false for failed results', () => {
      const result = Result.fail<string>('error');
      expect(Result.isOk(result)).toBe(false);
    });
  });

  describe('isFail', () => {
    it('should return true for failed results', () => {
      const result = Result.fail<string>('error');
      expect(Result.isFail(result)).toBe(true);
    });

    it('should return false for successful results', () => {
      const result = Result.ok('test');
      expect(Result.isFail(result)).toBe(false);
    });
  });

  describe('unwrap', () => {
    it('should return the value for successful results', () => {
      const result = Result.ok(42);
      expect(Result.unwrap(result)).toBe(42);
    });

    it('should throw for failed results', () => {
      const result = Result.fail<number>('Something went wrong');
      expect(() => Result.unwrap(result)).toThrow('Something went wrong');
    });
  });

  describe('unwrapOr', () => {
    it('should return the value for successful results', () => {
      const result = Result.ok(42);
      expect(Result.unwrapOr(result, 0)).toBe(42);
    });

    it('should return the default for failed results', () => {
      const result = Result.fail<number>('error');
      expect(Result.unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('map', () => {
    it('should transform successful results', () => {
      const result = Result.ok(5);
      const mapped = Result.map(result, (x) => x * 2);
      expect(Result.isOk(mapped)).toBe(true);
      if (mapped.success) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should pass through failed results', () => {
      const result = Result.fail<number>('error', 'ERR');
      const mapped = Result.map(result, (x) => x * 2);
      expect(Result.isFail(mapped)).toBe(true);
      if (!mapped.success) {
        expect(mapped.error).toBe('error');
        expect(mapped.code).toBe('ERR');
      }
    });
  });

  describe('mapAsync', () => {
    it('should transform successful results asynchronously', async () => {
      const result = Result.ok(5);
      const mapped = await Result.mapAsync(result, async (x) => x * 2);
      expect(Result.isOk(mapped)).toBe(true);
      if (mapped.success) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should pass through failed results', async () => {
      const result = Result.fail<number>('error');
      const mapped = await Result.mapAsync(result, async (x) => x * 2);
      expect(Result.isFail(mapped)).toBe(true);
    });
  });

  describe('flatMap', () => {
    it('should chain successful results', () => {
      const result = Result.ok(5);
      const chained = Result.flatMap(result, (x) =>
        x > 0 ? Result.ok(x * 2) : Result.fail('Must be positive'),
      );
      expect(Result.isOk(chained)).toBe(true);
      if (chained.success) {
        expect(chained.value).toBe(10);
      }
    });

    it('should short-circuit on failure', () => {
      const result = Result.ok(-5);
      const chained = Result.flatMap(result, (x) =>
        x > 0 ? Result.ok(x * 2) : Result.fail<number>('Must be positive'),
      );
      expect(Result.isFail(chained)).toBe(true);
    });

    it('should pass through initial failure', () => {
      const result = Result.fail<number>('initial error');
      const chained = Result.flatMap(result, (x) => Result.ok(x * 2));
      expect(Result.isFail(chained)).toBe(true);
      if (!chained.success) {
        expect(chained.error).toBe('initial error');
      }
    });
  });

  describe('flatMapAsync', () => {
    it('should chain successful results asynchronously', async () => {
      const result = Result.ok(5);
      const chained = await Result.flatMapAsync(result, async (x) =>
        x > 0 ? Result.ok(x * 2) : Result.fail<number>('Must be positive'),
      );
      expect(Result.isOk(chained)).toBe(true);
      if (chained.success) {
        expect(chained.value).toBe(10);
      }
    });

    it('should short-circuit on initial failure', async () => {
      const result = Result.fail<number>('error');
      let called = false;
      const chained = await Result.flatMapAsync(result, async (x) => {
        called = true;
        return Result.ok(x * 2);
      });
      expect(called).toBe(false);
      expect(Result.isFail(chained)).toBe(true);
    });
  });

  describe('tryAsync', () => {
    it('should wrap successful async operations', async () => {
      const result = await Result.tryAsync(async () => {
        return 42;
      });
      expect(Result.isOk(result)).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    it('should catch and wrap errors', async () => {
      const result = await Result.tryAsync(async () => {
        throw new Error('async error');
      });
      expect(Result.isFail(result)).toBe(true);
      if (!result.success) {
        expect(result.error).toBe('async error');
      }
    });

    it('should include error code when provided', async () => {
      const result = await Result.tryAsync(async () => {
        throw new Error('db error');
      }, 'DB_ERROR');
      expect(Result.isFail(result)).toBe(true);
      if (!result.success) {
        expect(result.code).toBe('DB_ERROR');
      }
    });
  });

  describe('try', () => {
    it('should wrap successful sync operations', () => {
      const result = Result.try(() => 42);
      expect(Result.isOk(result)).toBe(true);
      if (result.success) {
        expect(result.value).toBe(42);
      }
    });

    it('should catch and wrap errors', () => {
      const result = Result.try(() => {
        throw new Error('sync error');
      });
      expect(Result.isFail(result)).toBe(true);
      if (!result.success) {
        expect(result.error).toBe('sync error');
      }
    });
  });

  describe('all', () => {
    it('should combine all successful results', () => {
      const results = [Result.ok(1), Result.ok(2), Result.ok(3)];
      const combined = Result.all(results);
      expect(Result.isOk(combined)).toBe(true);
      if (combined.success) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first failure', () => {
      const results = [
        Result.ok(1),
        Result.fail<number>('first error', 'ERR1'),
        Result.fail<number>('second error', 'ERR2'),
      ];
      const combined = Result.all(results);
      expect(Result.isFail(combined)).toBe(true);
      if (!combined.success) {
        expect(combined.error).toBe('first error');
        expect(combined.code).toBe('ERR1');
      }
    });
  });

  describe('tap', () => {
    it('should execute side effect for successful results', () => {
      let sideEffect = 0;
      const result = Result.ok(42);
      const tapped = Result.tap(result, (x) => {
        sideEffect = x;
      });
      expect(sideEffect).toBe(42);
      expect(tapped).toBe(result);
    });

    it('should not execute side effect for failed results', () => {
      let sideEffect = 0;
      const result = Result.fail<number>('error');
      Result.tap(result, (x) => {
        sideEffect = x;
      });
      expect(sideEffect).toBe(0);
    });
  });

  describe('tapAsync', () => {
    it('should execute async side effect for successful results', async () => {
      let sideEffect = 0;
      const result = Result.ok(42);
      await Result.tapAsync(result, async (x) => {
        sideEffect = x;
      });
      expect(sideEffect).toBe(42);
    });
  });
});
