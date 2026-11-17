const positiveInt = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

const getPagination = (req) => {
  const maxLimit = positiveInt(process.env.PAGINATION_MAX_LIMIT, 100);
  const defaultLimit = positiveInt(process.env.PAGINATION_DEFAULT_LIMIT, 50, maxLimit);
  const requested = req.query.page !== undefined || req.query.limit !== undefined;
  const pageValue = req.query.page === undefined ? 1 : Number(req.query.page);
  const limitValue = req.query.limit === undefined ? defaultLimit : Number(req.query.limit);
  const valid = Number.isSafeInteger(pageValue)
    && pageValue > 0
    && Number.isInteger(limitValue)
    && limitValue > 0;
  return {
    requested,
    valid,
    page: valid ? pageValue : 1,
    limit: valid ? Math.min(limitValue, maxLimit) : defaultLimit,
  };
};

const setPaginationHeaders = (res, total, page, limit) => {
  res.set({
    'X-Total-Count': String(total),
    'X-Page': String(page),
    'X-Limit': String(limit),
    'X-Has-More': String(page * limit < total),
  });
};

const hardCap = (name, fallback) => positiveInt(process.env[name], fallback);

module.exports = { getPagination, setPaginationHeaders, hardCap };
