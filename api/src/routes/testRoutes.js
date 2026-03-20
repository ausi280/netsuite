const router = require('express').Router();
const testController = require('../controllers/testController'); 

router.route('/db')
            .get(testController.getDB);

module.exports = router;