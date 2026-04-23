/**
 * This file exports the router defined in the metaWebhooks controller.
 * server.js will automatically mount this at the SLUG defined in config.
 */
const metaWebhookRouter = require('../controllers/metaWebhooks');

module.exports = metaWebhookRouter;