const timeEndpoint = 'https://utctime.app/api/now';
const minimumServerTime = Date.UTC(1900, 0, 1);
const maximumServerTime = Date.UTC(2100, 11, 31, 15); // 2101년 1월 1일 00:00 서울 시각

export function createCurrentClock({
  fetchTime = globalThis.fetch,
  deviceNow = Date.now,
  elapsedNow = () => performance.now(),
  isOnline = () => globalThis.navigator?.onLine !== false,
  timeoutMs = 3000,
} = {}) {
  let sample = null;
  let request = null;

  function source() {
    return sample && isOnline() ? 'server' : 'device';
  }

  function now() {
    if (source() === 'device') return deviceNow();
    return Math.round(sample.time + elapsedNow() - sample.receivedAt);
  }

  function useDeviceTime() {
    sample = null;
    request?.abort();
    request = null;
  }

  async function sync() {
    if (!isOnline()) { useDeviceTime(); return; }
    if (request) return;

    const controller = new AbortController();
    request = controller;
    const startedAt = elapsedNow();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchTime(timeEndpoint, {
        cache: 'no-store', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const receivedAt = elapsedNow();
      if (request !== controller) return;
      const serverTime = data?.unix_ms;
      const delay = receivedAt - startedAt;
      if (!isOnline() || controller.signal.aborted || delay >= timeoutMs ||
          !Number.isSafeInteger(serverTime) || serverTime < minimumServerTime ||
          serverTime >= maximumServerTime || Math.floor(serverTime / 1000) !== data.unix) {
        sample = null;
        return;
      }
      // 응답 시각에 왕복 시간의 절반을 더해 수신 시각을 추정합니다.
      sample = { time: serverTime + delay / 2, receivedAt };
    } catch {
      // 연결 또는 응답 오류가 발생하면 기기 시계로 즉시 전환합니다.
      if (request === controller) sample = null;
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  }

  return { now, source, sync, useDeviceTime };
}
