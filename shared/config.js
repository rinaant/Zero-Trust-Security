const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const env = process.env;

module.exports = {
  ports: {
    gateway: Number(env.GATEWAY_PORT) || 3000,
    nilai: Number(env.NILAI_PORT) || 3001,
    transkrip: Number(env.TRANSKRIP_PORT) || 3002,
  },
  urls: {
    gateway: env.GATEWAY_URL || `http://localhost:${Number(env.GATEWAY_PORT) || 3000}`,
    nilai: env.NILAI_URL || `http://localhost:${Number(env.NILAI_PORT) || 3001}`,
    transkrip: env.TRANSKRIP_URL || `http://localhost:${Number(env.TRANSKRIP_PORT) || 3002}`,
  },
  dbPath: env.DB_PATH || path.join(__dirname, '..', 'database', 'database.sqlite'),

  jwtSecret: env.JWT_SECRET || 'dev-jwt-secret-ganti-di-produksi',
  gatewaySecret: env.GATEWAY_SECRET || 'dev-gateway-secret-ganti-di-produksi',
  jwtIssuer: 'zt-gateway',
  accessTokenTtl: '10m',
  serviceTokenTtl: '5m',
  refreshTokenTtlMs: 24 * 60 * 60 * 1000, // 1 hari

  serviceClient: {
    id: env.SERVICE_CLIENT_ID || 'service-nilai',
    secret: env.SERVICE_CLIENT_SECRET || 'dev-service-client-secret',
  },

  accessHours: {
    start: env.ACCESS_HOUR_START || '07:00',
    end: env.ACCESS_HOUR_END || '21:00',
    timezone: env.ACCESS_TIMEZONE || 'Asia/Jakarta',
  },
  demoMode: env.DEMO_MODE !== 'false',
  corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3100,http://127.0.0.1:3100')
    .split(',').map((s) => s.trim()).filter(Boolean),
};
