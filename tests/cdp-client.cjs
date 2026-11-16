// Client minimal du protocole de débogage de Chrome (sans dépendance) et lanceur de Chrome sans fenêtre.
'use strict';
const http = require('http'), net = require('net'), crypto = require('crypto'), cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');

const CHROME = process.env.BROWSER_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(port, p) {
  return new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', rej));
}

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0), upgraded = false, id = 0;
    const pending = new Map(), listeners = [];
    const api = {
      send(method, params = {}, sessionId) {
        return new Promise((res, rej) => {
          const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
          pending.set(id, { res, rej });
          const payload = Buffer.from(JSON.stringify(msg));
          const mask = crypto.randomBytes(4); let header;
          if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
          else if (payload.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
          else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
          const masked = Buffer.alloc(payload.length); for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
          sock.write(Buffer.concat([header, mask, masked]));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { sock.destroy(); }
    };
    function handle(text) {
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
      else listeners.forEach((f) => f(m));
    }
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n'); if (i < 0) return;
        if (!/101/.test(buf.slice(0, i).toString())) return reject(new Error('connexion refusée'));
        upgraded = true; buf = buf.slice(i + 4); resolve(api);
      }
      for (;;) {
        if (buf.length < 2) return;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const op = buf[0] & 0x0f; const payload = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (op === 1) handle(payload.toString('utf8'));
      }
    });
    sock.on('error', reject);
  });
}

// Lance Chrome (sans fenêtre) et renvoie { br, close }
async function launch(port = 9334, extraArgs = []) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-web-test-'));
  const proc = cp.spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', ...extraArgs, 'about:blank'], { stdio: 'ignore' });
  let ver;
  for (let i = 0; i < 60; i++) { try { ver = await getJSON(port, '/json/version'); break; } catch (e) { await sleep(250); } }
  if (!ver) { proc.kill(); throw new Error('Chrome ne démarre pas'); }
  const br = await wsConnect(ver.webSocketDebuggerUrl);
  return {
    br, version: ver.Browser,
    async close() { try { br.close(); } catch (e) { /* déjà fermé */ } proc.kill(); await sleep(600); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignoré */ } }
  };
}

module.exports = { sleep, getJSON, wsConnect, launch };
