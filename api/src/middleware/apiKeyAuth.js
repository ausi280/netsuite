const env = require('../../config').env;

function apiKeyAuth(req, res, next) {
  const expectedKey = env.SERVICES && env.SERVICES.ERP && env.SERVICES.ERP.LAB_INTEGRATION_API_KEY;
  const providedKey = req.header('x-api-key');

  if (!expectedKey) {
    console.error('LAB_INTEGRATION_API_KEY is not configured in env.json under SERVICES.ERP.');
    return res.status(500).json({ success: false, message: 'API key auth is not configured.' });
  }

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ success: false, message: 'Invalid or missing x-api-key header.' });
  }

  next();
}

module.exports = apiKeyAuth;
