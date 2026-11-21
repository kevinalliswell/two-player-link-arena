// Strictly local, allowlisted static server. No dependencies or network downloads.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'], '/arena.js': ['arena.js', 'text/javascript; charset=utf-8'], '/game.js': ['game.js', 'text/javascript; charset=utf-8'] };
const server = http.createServer((req, res) => {
  const asset = assets[(req.url || '/').split('?')[0]];
  if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, asset[0]), (error, bytes) => {
    if (error) { res.writeHead(500); res.end('Asset unavailable'); return; }
    res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : bytes);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 4178 is in use. Open http://127.0.0.1:4178 if this game is already running.' : error.message); process.exitCode = 1; });
server.listen(4178, '127.0.0.1', () => console.log('LINK / ARENA is ready: http://127.0.0.1:4178\nKeep this window open while playing. Ctrl+C to stop.'));
