const router = require('express').Router();
const erpController = require('../controllers/erpController'); 

router.route('/sync-netsuite')
            .post(erpController.syncNetsuiteData);

module.exports = router;