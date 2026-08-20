export interface TimedExecutionResult<T> {
  result: T;
  durationMs: number;
}

export async function timeExecution<T>(fn: () => Promise<T>): Promise<TimedExecutionResult<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Number((performance.now() - start).toFixed(2));
  return { result, durationMs };
}
