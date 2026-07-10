'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 4173;
const types = {
  '.css':'text/css; charset=utf-8',
  '.glb':'model/gltf-binary',
  '.gltf':'model/gltf+json',
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.mp3':'audio/mpeg',
  '.png':'image/png',
  '.svg':'image/svg+xml',
  '.wav':'audio/wav',
  '.webp':'image/webp',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if(file !== root && !file.startsWith(root + path.sep)){
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (error, data) => {
    if(error){
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code || 'Error');
      return;
    }
    response.writeHead(200, {'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream'});
    response.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('LOT KING test server: http://127.0.0.1:' + port);
});
