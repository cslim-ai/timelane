import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 이 프로젝트의 이름 있는 import/export 선언만 처리합니다.
// 지원하지 않는 문법은 배포 파일을 만들기 전에 명시적으로 거부합니다.
export function createBrowserBundle(sources) {
  const exportsByModule = new Map();
  const chunks = [];
  for (const { name, source } of sources) {
    if (!/^[a-z][a-z0-9-]*$/.test(name) || exportsByModule.has(name)) throw new Error('잘못되거나 중복된 모듈 이름입니다.');
    const names = [];
    let code = source.replace(/^export\s+(function|const)\s+([A-Za-z_$][\w$]*)/gm, (_, kind, symbol) => {
      names.push(symbol); return `${kind} ${symbol}`;
    });
    code = code.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]\.\/([a-z-]+)\.js['"];?\r?\n?/gm, (_, symbols, dependency) => {
      if (!exportsByModule.has(dependency)) throw new Error(`모듈 의존 순서가 올바르지 않습니다: ${name} → ${dependency}`);
      const imports = symbols.split(',').map(symbol => symbol.trim()).filter(Boolean);
      if (imports.some(symbol => !/^[A-Za-z_$][\w$]*$/.test(symbol))) throw new Error(`지원하지 않는 가져오기 문법입니다: ${name}`);
      if (imports.some(symbol => !exportsByModule.get(dependency).has(symbol))) throw new Error(`내보내지 않은 이름을 가져옵니다: ${name} → ${dependency}`);
      return `const { ${imports.join(', ')} } = modules[${JSON.stringify(dependency)}];\n`;
    });
    if (/^\s*(import|export)\b/m.test(code)) throw new Error(`지원하지 않는 모듈 문법입니다: ${name}`);
    exportsByModule.set(name, new Set(names));
    chunks.push(`// ${name}.js\nmodules[${JSON.stringify(name)}] = (() => {\n${code.trim()}\nreturn { ${names.join(', ')} };\n})();`);
  }
  return `// 자동 생성 파일입니다. 수정 후 node scripts/build-browser.mjs로 갱신하세요.\n(() => {\n'use strict';\nconst modules = Object.create(null);\n${chunks.join('\n\n')}\n})();\n`;
}

export async function buildProjectBundle() {
  const names = ['time', 'locations', 'clock-state', 'locale', 'current-clock', 'app'];
  const sources = await Promise.all(names.map(async name => ({ name, source: await readFile(new URL(`../src/${name}.js`, import.meta.url), 'utf8') })));
  return createBrowserBundle(sources);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = await buildProjectBundle();
  const target = new URL('../assets/timelane.js', import.meta.url);
  if (process.argv.includes('--check')) {
    if (await readFile(target, 'utf8') !== output) { console.error('브라우저 실행 파일이 소스와 다릅니다. node scripts/build-browser.mjs로 갱신해 주세요.'); process.exitCode = 1; }
    else console.log('브라우저 실행 파일이 최신 상태입니다.');
  } else { await writeFile(target, output, 'utf8'); console.log('assets/timelane.js 생성 완료 · index.html 직접 실행 가능'); }
}
