// Static file server for Cloud Run deployment
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = parseInt(process.env.PORT || '8080', 10)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath)
  if (!filePath.startsWith(DIST)) { res.writeHead(403).end('Forbidden'); return }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) filePath = path.join(DIST, 'index.html')
    const ext = path.extname(filePath).toLowerCase()
    const type = MIME[ext] || 'application/octet-stream'
    const isAsset = urlPath.startsWith('/assets/')
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-store, no-cache, must-revalidate, max-age=0',
    })
    fs.createReadStream(filePath).pipe(res)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Legal Workflow FE serving on :${PORT} from ${DIST}`)
})
