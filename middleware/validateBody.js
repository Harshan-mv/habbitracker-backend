const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: result.error.issues.map(({ path, message }) => ({
        path: path.join('.'),
        message,
      })),
    });
  }
  next();
};

module.exports = validateBody;
