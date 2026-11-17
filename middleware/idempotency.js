const crypto = require('crypto');
const IdempotencyRecord = require('../models/IdempotencyRecord');

const responseLimit = () => {
  const value = Number(process.env.IDEMPOTENCY_MAX_RESPONSE_BYTES);
  return Number.isInteger(value) && value > 0 ? value : 128 * 1024;
};

const ttlSeconds = () => {
  const value = Number(process.env.IDEMPOTENCY_TTL_HOURS);
  return (Number.isFinite(value) && value > 0 ? value : 24) * 60 * 60;
};

const maxRecordsPerUser = () => {
  const value = Number(process.env.IDEMPOTENCY_MAX_RECORDS_PER_USER);
  return Number.isInteger(value) && value > 0 ? value : 200;
};

const maxKeyLength = () => {
  const value = Number(process.env.IDEMPOTENCY_KEY_MAX_LENGTH);
  return Number.isInteger(value) && value > 0 ? value : 200;
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
};

const getRequestHash = (body) => crypto
  .createHash('sha256')
  .update(JSON.stringify(canonicalize(body) ?? null))
  .digest('hex');

const idempotency = async (req, res, next) => {
  const key = req.get('Idempotency-Key');
  if (!key) return next();
  if (key.length > maxKeyLength()) {
    return res.status(400).json({ error: 'Idempotency-Key is too long' });
  }

  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const route = `${req.method} ${req.originalUrl.split('?')[0]}`;
  const requestHash = getRequestHash(req.body);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds() * 1000);
  let record;
  await IdempotencyRecord.deleteOne({ userId, key, expiresAt: { $lte: now } });
  record = await IdempotencyRecord.findOne({ userId, key, expiresAt: { $gt: now } });
  if (record) {
    if (record.route !== route || record.requestHash !== requestHash) {
      return res.status(422).json({ error: 'Idempotency-Key was already used with a different request' });
    }
    if (record.status === 'completed') {
      res.set('Idempotency-Replayed', 'true');
      return res.status(record.responseStatus).json(record.responseBody);
    }
    return res.status(409).json({ error: 'Request is already in progress' });
  }
  const activeCount = await IdempotencyRecord.countDocuments({
    userId,
    expiresAt: { $gt: now },
  });
  if (activeCount >= maxRecordsPerUser()) {
    const oldest = await IdempotencyRecord.findOne({
      userId,
      expiresAt: { $gt: now },
    }).sort({ expiresAt: 1 }).select('expiresAt');
    const retryAfter = oldest?.expiresAt
      ? Math.max(1, Math.ceil((oldest.expiresAt - now) / 1000))
      : 1;
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'Too many recent finance updates. Please retry after the current requests expire.',
      retryAfter,
    });
  }
  try {
    record = await IdempotencyRecord.create({
      userId,
      key,
      route,
      requestHash,
      status: 'in-progress',
      expiresAt,
    });
  } catch (error) {
    if (error.code !== 11000) return next(error);
    record = await IdempotencyRecord.findOne({ userId, key, expiresAt: { $gt: new Date() } });
    if (!record) return res.status(409).json({ error: 'Request is already in progress' });
    if (record.route !== route || record.requestHash !== requestHash) {
      return res.status(422).json({ error: 'Idempotency-Key was already used with a different request' });
    }
    if (record.status === 'completed') {
      res.set('Idempotency-Replayed', 'true');
      return res.status(record.responseStatus).json(record.responseBody);
    }
    return res.status(409).json({ error: 'Request is already in progress' });
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const statusCode = res.statusCode;
    if (statusCode < 200 || statusCode >= 300) {
      return IdempotencyRecord.deleteOne({ _id: record._id })
        .then(() => originalJson(body))
        .catch(next);
    }

    let serialized;
    try {
      serialized = JSON.stringify(body) ?? 'null';
    } catch (error) {
      return IdempotencyRecord.deleteOne({ _id: record._id })
        .then(() => next(error))
        .catch(next);
    }
    if (Buffer.byteLength(serialized, 'utf8') > responseLimit()) {
      const boundedBody = { error: 'Response exceeds the configured idempotency storage limit' };
      res.statusCode = 500;
      return IdempotencyRecord.updateOne(
        { _id: record._id, status: 'in-progress' },
        { $set: { status: 'completed', responseStatus: 500, responseBody: boundedBody } },
      ).then(() => originalJson(boundedBody)).catch(next);
    }
    const responseBody = JSON.parse(serialized);

    return IdempotencyRecord.updateOne(
      { _id: record._id, status: 'in-progress' },
      { $set: { status: 'completed', responseStatus: statusCode, responseBody } },
    ).then(() => originalJson(body)).catch(next);
  };
  next();
};

module.exports = idempotency;
