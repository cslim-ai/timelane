import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createAppServer } from '../server.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'timelane-test-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<h1>TimeLane</h1>');
  await writeFile(join(root, 'src', 'app.js'), 'export const ok = true;');
  await writeFile(join(root, 'assets', 'timelane.js'), '(() => {})();');
  await writeFile(join(root, 'private.txt'), '외부 제공 금지');
  const server = createAppServer({ root });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  const port = server.address().port;
  return async (path, options = {}) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, ...options }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', data => body += data);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
}
test('루트와 모듈에 올바른 형식 및 보안 헤더를 제공합니다', async t => {
  const get = await fixture(t);
  const root = await get('/');
  assert.equal(root.status, 200); assert.match(root.body, /TimeLane/);
  assert.match(root.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.match((await get('/src/app.js')).headers['content-type'], /javascript/);
  assert.equal((await get('/assets/timelane.js')).status, 200);
  assert.equal((await get('/', { method: 'HEAD' })).body, '');
});
test('소스 외 파일과 경로 순회 및 외부 Host를 차단합니다', async t => {
  const get = await fixture(t);
  for (const path of ['/private.txt', '/src/%2e%2e/private.txt', '/src/..%5cprivate.txt', '/%ZZ', '/src/%00.js']) {
    assert.ok((await get(path)).status >= 400, path);
  }
  assert.equal((await get('/', { headers: { Host: 'attacker.example' } })).status, 403);
  assert.equal((await get('/', { method: 'POST' })).status, 405);
});
