// 1010 컬러: 정적 파일 + 순위 API (의존성 없음)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scores.json');
const PUBLIC = path.join(__dirname, 'public');

let scores = {};
try { scores = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { scores = {}; }

let saving = false, dirty = false;
function save() {
  if (saving) { dirty = true; return; }
  saving = true;
  fs.mkdir(DATA_DIR, { recursive: true }, () => {
    fs.writeFile(DATA_FILE, JSON.stringify(scores), () => {
      saving = false;
      if (dirty) { dirty = false; save(); }
    });
  });
}

function top(n) {
  return Object.values(scores)
    .sort((a, b) => b.best - a.best || a.name.localeCompare(b.name))
    .slice(0, n)
    .map(({ name, best }) => ({ name, best }));
}

const hits = new Map(); // IP별 간단한 쓰기 제한: 분당 20회
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  h.push(now); hits.set(ip, h);
  return h.length > 20;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/scores') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(top(100)));
    }
    if (req.method === 'POST') {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      if (limited(ip)) { res.writeHead(429); return res.end('{}'); }
      let body = '';
      req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        try {
          const j = JSON.parse(body);
          const name = String(j.name || '').trim().slice(0, 12);
          const score = Math.floor(Number(j.score));
          if (!name || !Number.isFinite(score) || score < 0 || score > 10000000) throw 0;
          const id = name.toLowerCase();
          if (!scores[id] || score > scores[id].best) { scores[id] = { name, best: score, at: Date.now() }; save(); }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"ok":true}');
        } catch (e) { res.writeHead(400); res.end('{}'); }
      });
      return;
    }
    res.writeHead(405); return res.end();
  }
  let p = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log('listening on ' + PORT));
