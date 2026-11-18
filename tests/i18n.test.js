import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { selectLocale, messages } from '../src/locale.js';

test('한국어 또는 대한민국 지역이 지정된 브라우저 로케일은 한국어를 선택합니다', () => {
  for (const locale of ['ko', 'KO-kr', 'ko-KP', 'en-KR', 'ja-KR', 'ko-Kore-KR']) {
    assert.equal(selectLocale(locale), 'ko-KR', locale);
  }
});

test('그 외 로케일과 잘못된 로케일은 영어를 선택합니다', () => {
  for (const locale of ['en-US', 'en-GB', 'ja-JP', 'zh-CN', 'fr-CA', 'kr-NG', 'not_a_locale', '', undefined]) {
    assert.equal(selectLocale(locale), 'en-US', String(locale));
  }
});

test('초기 HTML은 영어이고 현지화하는 화면 문구와 접근성 속성에 두 언어가 있습니다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.doesNotMatch(html, /\p{Script=Hangul}/u);
  const keys = [...html.matchAll(/data-i18n(?:-label|-placeholder|-content)?="([^"]+)"/g)].map(match => match[1]);
  assert.ok(keys.includes('returnToNow'));
  for (const key of keys) {
    assert.equal(typeof messages['en-US'][key], 'string', key);
    assert.equal(typeof messages['ko-KR'][key], 'string', key);
    assert.doesNotMatch(messages['en-US'][key], /\p{Script=Hangul}/u, key);
  }
});
