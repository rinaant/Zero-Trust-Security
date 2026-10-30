const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');
const config = require('../../shared/config');

function build(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: false,
    on: {
      proxyReq: (proxyReq, req) => {
        // Gateway menyisipkan secret; nilai kiriman client selalu ditimpa.
        proxyReq.setHeader('X-Gateway-Secret', config.gatewaySecret);
        fixRequestBody(proxyReq, req);
      },
      error: (err, req, res) => {
        if (res && !res.headersSent && typeof res.writeHead === 'function') {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Service tidak dapat dihubungi' }));
        }
      },
    },
  });
}

const nilai = build(config.urls.nilai);
const transkrip = build(config.urls.transkrip);

// Routing berdasarkan prefix path.
function forward(req, res, next) {
  if (req.path.startsWith('/transkrip')) return transkrip(req, res, next);
  if (req.path.startsWith('/nilai') || req.path.startsWith('/kelas')) return nilai(req, res, next);
  return res.status(404).json({ error: 'NOT_FOUND', message: 'Route tidak ditemukan' });
}

module.exports = { forward };
