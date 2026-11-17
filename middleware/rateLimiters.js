const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const numberFromEnv = (name, fallback, minimum = 1) => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
};

const standardOptions = (windowMs) => ({
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfter = Math.max(1, Math.ceil(windowMs / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter,
    });
  },
});

const globalWindowMs = numberFromEnv('API_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const globalLimiter = rateLimit({
  ...standardOptions(globalWindowMs),
  windowMs: globalWindowMs,
  limit: numberFromEnv('API_RATE_LIMIT_MAX', 100),
  skip: (req) => req.path === '/health' && req.method === 'GET',
});

const authWindowMs = numberFromEnv('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const authLimiter = rateLimit({
  ...standardOptions(authWindowMs),
  windowMs: authWindowMs,
  limit: numberFromEnv('AUTH_RATE_LIMIT_MAX', 10),
});

const writeWindowMs = numberFromEnv('USER_WRITE_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const writeLimiter = rateLimit({
  ...standardOptions(writeWindowMs),
  windowMs: writeWindowMs,
  limit: numberFromEnv('USER_WRITE_RATE_LIMIT_MAX', 120),
  keyGenerator: (req) => req.user?.userId
    ? `user:${req.user.userId}`
    : `ip:${ipKeyGenerator(req.ip)}`,
});

module.exports = { globalLimiter, authLimiter, writeLimiter };
