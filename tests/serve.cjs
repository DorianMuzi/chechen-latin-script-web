// Petit serveur statique pour tester le site (dossier docs/). Usage : node tests/serve.cjs [port]
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const DOCS = process.env.CLS_DOCS ? path.resolve(process.env.CLS_DOCS) : path.resolve(__dirname, '..', 'docs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function start(port = 8099) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(DOCS, p);
    if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    // Pour tester la mesure d'audience : sur stats.test et 127.0.0.1 (jamais sur localhost), data.js est servi avec un code de site de TEST
    const host = String(req.headers.host || '').split(':')[0];
    if (p === '/data.js' && (host === 'stats.test' || host === '127.0.0.1')) {
      const body = fs.readFileSync(file, 'utf8').replace(/"goatcounter":"[^"]*"/, '"goatcounter":"testsite"');
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 8099).then(() => console.log('http://localhost:' + (process.argv[2] || 8099) + '/'));
