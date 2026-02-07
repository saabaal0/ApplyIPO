function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Retry an async function with simple backoff.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{retries?: number, delayMs?: number, factor?: number, onRetry?: (err: any, attempt: number) => void}} opts
 * @returns {Promise<T>}
 */
async function retry(fn, opts = {}) {
  const retries = opts.retries ?? 3;
  const factor = opts.factor ?? 2;
  let delay = opts.delayMs ?? 1000;
  let last;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt > retries) break;
      opts.onRetry?.(err, attempt);
      await sleep(delay);
      delay *= factor;
    }
  }
  throw last;
}

module.exports = { retry, sleep };
