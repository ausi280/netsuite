const router = require('express').Router();
const erpController = require('../controllers/erpController');
const apiKeyAuth = require('../middleware/apiKeyAuth');

router.route('/sync-netsuite')
            .post(erpController.syncNetsuiteData);

router.route('/employees')
            .get(erpController.getEmployees);

router.route('/suiteql')
            .post(erpController.runSuiteQL);

router.route('/contracts/fechas')
            .post(apiKeyAuth, erpController.updateContractFechas);

// Same handler, same body params (contractId/contractName, fechaNacimiento, fechaColecta/
// fechaProcesamiento, especimenNombre) - just a PATCH-verb alias at a clearer URL.
router.route('/contracts/update')
            .patch(apiKeyAuth, erpController.updateContractFechas);

// Body: exactly one of contractId, contractName, or folioSistemaAnterior.
router.route('/contracts/debt')
            .post(apiKeyAuth, erpController.getContractDebt);

module.exports = router;