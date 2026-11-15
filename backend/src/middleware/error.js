/** 404 + centralized error handler */
function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  /* audit fix — services (dealService.fail, StockError, importer, chat) throw
     with `.status`; honor it the same as `.statusCode` so 4xx stays 4xx */
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Server error';

  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.code === 11000) {
    status = 409;
    const f = Object.keys(err.keyValue || {}).join(',');
    message = `Duplicate value for ${f}`;
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid id: ${err.value}`;
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 400;
    /* Task 38 — banner media uploads allow 40MB video; keep 5MB copy for images */
    message = req.path && req.path.includes('banner')
      ? 'File too large — banners allow 5MB images / posters and 40MB video'
      : 'File too large (max 5MB)';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    status = 400;
    message = 'Too many files in one request';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    status = 400;
    message = req.path && req.path.includes('banner')
      ? 'Unexpected upload field — banner media goes in image | video | poster'
      : 'Unexpected file field — send the payment screenshot in the "screenshot" field';
  } else if (/^The (video slot|image slot|poster)/.test(err.message || '') || /^Only (JPG|CSV)/.test(err.message || '')) {
    /* multer fileFilter rejections arrive as plain Errors → 400, never 500 */
    status = 400;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large (max 2MB)';
  }

  if (status >= 500) console.error('[error]', err);
  /* audit fix — in production a 500 must not echo driver-level messages
     (connection strings, replica-set internals) to the client */
  if (status >= 500 && process.env.NODE_ENV === 'production') message = 'Server error — please try again shortly';
  res.status(status).json({ message, ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}) });
}

module.exports = { notFound, errorHandler };
