import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, runInNewContext } from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createBrowserBundle, buildProjectBundle } from '../scripts/build-browser.mjs';

test('일반 스크립트가 모듈의 동명 변수를 격리하고 가져온 함수를 실행합니다', () => {
  const bundle = createBrowserBundle([
    { name: 'first', source: "const hidden = '서울';\nexport function greet() { return hidden; }" },
    { name: 'second', source: "import { greet } from './first.js';\nconst hidden = '뉴욕';\nglobalThis.result = greet() + ' · ' + hidden;" },
  ]);
  const context = {};
  runInNewContext(bundle, context);
  assert.equal(context.result, '서울 · 뉴욕');
  assert.equal(context.hidden, undefined);
});
test('지원하지 않는 모듈 문법과 잘못된 의존성은 조용히 번들하지 않습니다', () => {
  assert.throws(() => createBrowserBundle([{ name: 'bad', source: 'export default 5;' }]), /지원하지/);
  assert.throws(() => createBrowserBundle([{ name: 'bad', source: "import { missing } from './unknown.js';" }]), /의존/);
  assert.throws(() => createBrowserBundle([{ name: 'one', source: 'export const value = 1;' }, { name: 'two', source: "import { missing } from './one.js';" }]), /내보내/);
});
test('배포된 브라우저 스크립트가 현재 소스와 일치하고 모듈 로더 없이 파싱됩니다', async () => {
  const expected = await buildProjectBundle();
  const deployed = await readFile(new URL('../assets/timelane.js', import.meta.url), 'utf8');
  assert.equal(deployed, expected, 'node scripts/build-browser.mjs로 배포 파일을 갱신해 주세요.');
  assert.doesNotThrow(() => new Script(deployed));
});
test('HTML의 스크립트·스타일·아이콘이 파일 주소에서 실제 로컬 파일로 해석됩니다', async () => {
  const entry = new URL('../index.html', import.meta.url);
  const html = await readFile(entry, 'utf8');
  const references = [...html.matchAll(/<(script|link|img)\b([^>]+)>/g)];
  assert.ok(references.length >= 4);
  for (const [, tag, attributes] of references) {
    const path = /(?:src|href)="([^"]+)"/.exec(attributes)?.[1];
    if (!path) continue;
    const target = new URL(path, entry);
    assert.equal(target.protocol, 'file:');
    assert.ok(target.href.startsWith(new URL('./', entry).href), `${path}가 프로젝트 폴더 안에 있어야 합니다.`);
    const content = await readFile(target, 'utf8');
    if (tag === 'script') {
      assert.doesNotThrow(() => new Script(content));
      assert.equal(/type="module"/.test(attributes), false, '파일 실행에서는 모듈 스크립트를 사용하지 않습니다.');
    }
  }
});
