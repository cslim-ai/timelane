import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
export function createAppServer({ root = projectRoot } = {}) {
  const base = resolve(root);
  const server = createServer(async (request, response) => {
    const headers = {
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };
    function send(status, message, extra = {}) { response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', ...extra }); response.end(request.method === 'HEAD' ? undefined : message); }
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(request.headers.host || '')) return send(403, '로컬 주소로 접속해 주세요.');
    if (!['GET', 'HEAD'].includes(request.method)) return send(405, '읽기 요청만 지원합니다.', { Allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent((request.url || '/').split('?')[0]); }
    catch { return send(400, '잘못된 경로입니다.'); }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return send(400, '잘못된 경로입니다.');
    if (pathname === '/') pathname = '/index.html';
    if (pathname !== '/index.html' && !/^\/(src\/[a-z-]+\.(js|css)|assets\/[a-z-]+\.(svg|js))$/.test(pathname)) return send(404, '파일을 찾을 수 없습니다.');
    const filename = resolve(base, `.${pathname}`);
    if (!filename.startsWith(base + sep)) return send(403, '접근할 수 없는 경로입니다.');
    try {
      const content = await readFile(filename);
      response.writeHead(200, { ...headers, 'Content-Type': `${types[extname(filename)]}; charset=utf-8`, 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') send(404, '파일을 찾을 수 없습니다.');
      else { console.error('정적 파일을 제공하는 중 오류가 발생했습니다.', error.code); send(500, '파일을 읽을 수 없습니다. 서버를 다시 시작해 주세요.'); }
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('포트는 1~65535의 정수여야 합니다.'); process.exitCode = 1; }
  else {
    const server = createAppServer();
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `포트 ${port}이 사용 중입니다. node server.mjs --port ${port + 1}로 실행해 주세요.` : `서버 시작 실패: ${error.message}`); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`TimeLane · http://127.0.0.1:${port}\n종료: Ctrl+C`));
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
      server.close(() => { process.exitCode = 0; });
      setTimeout(() => server.closeAllConnections(), 3000).unref();
    });
  }
}
