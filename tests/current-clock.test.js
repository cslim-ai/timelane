import assert from 'node:assert/strict';
import test from 'node:test';
import { createCurrentClock } from '../src/current-clock.js';

const serverNow = Date.UTC(2026, 10, 18, 18, 23, 45);
const validResponse = () => Response.json({ unix_ms: serverNow, unix: serverNow / 1000 });

function setup(fetchTime = async () => validResponse(), options = {}) {
  let device = serverNow + 7200000;
  let elapsed = 1000;
  let online = true;
  const clock = createCurrentClock({
    fetchTime,
    deviceNow: () => device,
    elapsedNow: () => elapsed,
    isOnline: () => online,
    ...options,
  });
  return {
    clock,
    get device() { return device; },
    advance: (time, adjustment = 0) => { elapsed += time; device += time + adjustment; },
    setOnline: value => { online = value; },
  };
}

test('서버 응답 전에는 기기 시각을 쓰고, 동기화 후에는 네트워크 지연을 보정해 경과 시간을 더합니다', async () => {
  const { clock, advance, device } = setup();
  const sync = clock.sync();
  assert.equal(clock.now(), device);
  advance(200);
  await sync;
  assert.equal(clock.now(), serverNow + 100);
  advance(1000, 60000);
  assert.equal(clock.now(), serverNow + 1100);
});

test('연결이 끊기면 기기 시계로 전환하고 재연결하면 다시 서버 시각을 사용합니다', async () => {
  let attempts = 0;
  const env = setup(async () => { attempts++; return validResponse(); });
  await env.clock.sync();
  assert.equal(env.clock.now(), serverNow);
  env.setOnline(false);
  env.clock.useDeviceTime();
  await env.clock.sync();
  assert.equal(attempts, 1);
  assert.equal(env.clock.now(), env.device);
  env.setOnline(true);
  await env.clock.sync();
  assert.equal(attempts, 2);
  assert.equal(env.clock.now(), serverNow);
});

test('네트워크 오류, HTTP 오류 또는 잘못된 응답이면 이전 동기화 값을 폐기합니다', async () => {
  const responses = [
    () => { throw new TypeError('network failure'); },
    () => Response.json({}, { status: 503 }),
    () => new Response('not JSON'),
    () => Response.json({ unix_ms: String(serverNow), unix: serverNow / 1000 }),
    () => Response.json({ unix_ms: serverNow / 1000, unix: serverNow / 1000 }),
    () => Response.json({ unix_ms: 8640000000000001, unix: 8640000000000 }),
  ];
  for (const response of responses) {
    let next = validResponse;
    const env = setup(async () => next());
    await env.clock.sync();
    assert.equal(env.clock.now(), serverNow);
    next = response;
    await env.clock.sync();
    assert.equal(env.clock.now(), env.device);
  }
});

test('응답 본문이 지연되어도 요청을 중단하고 기기 시계를 사용합니다', async () => {
  let signal;
  const env = setup(async (_, options) => ({
    ok: true,
    json: () => new Promise((_, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }), { timeoutMs: 5 });
  await env.clock.sync();
  assert.equal(signal.aborted, true);
  assert.equal(env.clock.now(), env.device);
});

test('동시 요청을 합치고 취소한 응답은 새 동기화 결과를 덮어쓰지 않습니다', async () => {
  let resolveFirst;
  let firstSignal;
  let attempts = 0;
  const env = setup(async (_, { signal }) => {
    if (++attempts !== 1) return validResponse();
    firstSignal = signal;
    return new Promise(resolve => { resolveFirst = resolve; });
  });
  const oldSync = env.clock.sync();
  await env.clock.sync();
  assert.equal(attempts, 1);
  env.clock.useDeviceTime();
  assert.equal(firstSignal.aborted, true);
  await env.clock.sync();
  assert.equal(attempts, 2);
  resolveFirst(Response.json({ unix_ms: serverNow - 1000, unix: serverNow / 1000 - 1 }));
  await oldSync;
  assert.equal(env.clock.now(), serverNow);
});
