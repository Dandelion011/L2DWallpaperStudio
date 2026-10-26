const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const outputDir = path.resolve(__dirname, '../exports');
fs.mkdirSync(outputDir, { recursive: true });
let reportBody = '';

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5173');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ready: true }));
    return;
  }
  if (request.method === 'POST' && request.url === '/report') {
    request.setEncoding('utf8');
    request.on('data', (chunk) => { reportBody += chunk; });
    request.on('end', () => {
      fs.writeFileSync(path.join(outputDir, 'batch-report.json'), reportBody, 'utf8');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ saved: true }));
      reportBody = '';
    });
    return;
  }
  if (request.method !== 'POST' || request.url.startsWith('/save?') === false) {
    response.writeHead(404);
    response.end();
    return;
  }
  const filename = path.basename(new URL(request.url, 'http://127.0.0.1').searchParams.get('filename') || 'wallpaper.webm');
  const target = path.join(outputDir, filename);
  const file = fs.createWriteStream(target);
  request.pipe(file);
  request.on('error', (error) => { file.destroy(error); });
  file.on('finish', () => {
    file.close();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ path: target, size: fs.statSync(target).size }));
  });
  file.on('error', (error) => {
    response.writeHead(500);
    response.end(error.message);
  });
});

const port = Number(process.env.BATCH_SAVE_PORT || 5176);
server.listen(port, '127.0.0.1', () => console.log(`batch-save listening on http://127.0.0.1:${port}`));
