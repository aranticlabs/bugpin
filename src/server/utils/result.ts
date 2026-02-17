export type Result<T> =
  | { success: true; value: T }
  | { success: false; error: string; code?: string };

export const Result = {
  /**
   * Create a successful result
   */
  ok<T>(value: T): Result<T> {
    return { success: true, value };
  },

  /**
   * Create a failed result
   */
  fail<T>(error: string, code?: string): Result<T> {
    return { success: false, error, code };
  },

  /**
   * Check if result is successful
   */
  isOk<T>(result: Result<T>): result is { success: true; value: T } {
    return result.success;
  },

  /**
   * Check if result is failed
   */
  isFail<T>(result: Result<T>): result is { success: false; error: string; code?: string } {
    return !result.success;
  },

  /**
   * Unwrap result value or throw if failed
   * Use only when you're certain the result is successful
   */
  unwrap<T>(result: Result<T>): T {
    if (result.success) {
      return result.value;
    }
    throw new Error(result.error);
  },

  /**
   * Unwrap result value or return default if failed
   */
  unwrapOr<T>(result: Result<T>, defaultValue: T): T {
    if (result.success) {
      return result.value;
    }
    return defaultValue;
  },

  /**
   * Map result value if successful
   */
  map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
    if (result.success) {
      return Result.ok(fn(result.value));
    }
    return result as Result<U>;
  },

  /**
   * Async version of map - transforms the value if successful
   */
  async mapAsync<T, U>(result: Result<T>, fn: (value: T) => Promise<U>): Promise<Result<U>> {
    if (result.success) {
      const value = await fn(result.value);
      return Result.ok(value);
    }
    return result as Result<U>;
  },

  /**
   * Chain result with another operation that returns a Result
   */
  flatMap<T, U>(result: Result<T>, fn: (value: T) => Result<U>): Result<U> {
    if (result.success) {
      return fn(result.value);
    }
    return result as Result<U>;
  },

  /**
   * Async version of flatMap - chains with an async operation that returns a Result
   */
  async flatMapAsync<T, U>(
    result: Result<T>,
    fn: (value: T) => Promise<Result<U>>,
  ): Promise<Result<U>> {
    if (result.success) {
      return await fn(result.value);
    }
    return result as Result<U>;
  },

  /**
   * Try to execute an async function and wrap the result
   * Catches any thrown errors and returns them as a failed Result
   */
  async tryAsync<T>(fn: () => Promise<T>, errorCode?: string): Promise<Result<T>> {
    try {
      const value = await fn();
      return Result.ok(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Result.fail(message, errorCode);
    }
  },

  /**
   * Try to execute a sync function and wrap the result
   * Catches any thrown errors and returns them as a failed Result
   */
  try<T>(fn: () => T, errorCode?: string): Result<T> {
    try {
      const value = fn();
      return Result.ok(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Result.fail(message, errorCode);
    }
  },

  /**
   * Combine multiple Results into one
   * Returns the first failure or an array of all values if all succeed
   */
  all<T extends Result<unknown>[]>(
    results: [...T],
  ): Result<{ [K in keyof T]: T[K] extends Result<infer U> ? U : never }> {
    const values: unknown[] = [];
    for (const result of results) {
      if (!result.success) {
        return result as Result<never>;
      }
      values.push(result.value);
    }
    return Result.ok(values as { [K in keyof T]: T[K] extends Result<infer U> ? U : never });
  },

  /**
   * Execute a callback for its side effects if Result is successful
   */
  tap<T>(result: Result<T>, fn: (value: T) => void): Result<T> {
    if (result.success) {
      fn(result.value);
    }
    return result;
  },

  /**
   * Async version of tap
   */
  async tapAsync<T>(result: Result<T>, fn: (value: T) => Promise<void>): Promise<Result<T>> {
    if (result.success) {
      await fn(result.value);
    }
    return result;
  },
};
