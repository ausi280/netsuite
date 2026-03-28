const router = require('express').Router();
const erpController = require('../controllers/erpController'); 

router.route('/sync-netsuite')
            .post(erpController.syncNetsuiteData);

router.route('/employees')
            .get(erpController.getEmployees);

router.route('/suiteql')
            .post(erpController.runSuiteQL);

module.exports = router;