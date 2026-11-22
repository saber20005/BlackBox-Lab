// Deliberately tiny, loopback-only HTTP smoke sampler. NEVER use on production.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function safeLocalTarget(value) {
  if (typeof value !== 'string' || value.length > 300) throw Error('local-target-required');
  let url;
  try { url = new URL(value); } catch { throw Error('invalid-target'); }
  if (url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error('loopback-root-http-only');
  }
  return url;
}

export async function sampleLocal(target, { requests = 8, concurrency = 2, fetchImpl = fetch } = {}) {
  const url = safeLocalTarget(target);
  if (!Number.isSafeInteger(requests) || requests < 1 || requests > 16 ||
      !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 2 ||
      concurrency > requests) throw Error('unsafe-sampling-limits');
  const samples = Array(requests);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= requests) return;
      const begin = performance.now();
      try {
        const response = await fetchImpl(url.href, {
          method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
          headers: { Accept: 'text/html' },
        });
        // No automatic redirect: never follow a local redirect to a public host.
        if (response.status !== 200) {
          await response.body?.cancel?.();
          samples[index] = { ok: false, status: response.status, ms: Math.round(performance.now() - begin) };
        } else {
          await response.arrayBuffer();
          samples[index] = { ok: true, status: 200, ms: Math.round(performance.now() - begin) };
        }
      } catch {
        samples[index] = { ok: false, status: 0, ms: Math.round(performance.now() - begin) };
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const latencies = samples.map(item => item.ms).sort((a, b) => a - b);
  const quantile = q => latencies[Math.ceil(q * latencies.length) - 1] ?? 0;
  return {
    target: url.origin + '/', requests, concurrency,
    successful: samples.filter(s => s.ok).length,
    failed: samples.filter(s => !s.ok).length,
    p50Ms: quantile(.5), p95Ms: quantile(.95),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await sampleLocal(process.argv[2] || '');
    console.log(JSON.stringify(result, null, 2));
    if (result.failed) process.exitCode = 1;
  } catch (error) {
    console.error('Local-only smoke rejected:', error.message);
    process.exitCode = 1;
  }
}
