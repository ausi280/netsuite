const env = require('../../config').env;
const PackageModel = require('../models/packageModel');
const axios = require('axios');
const OAuth = require('oauth-1.0a'); 
const crypto = require('crypto');
const knex = require('knex');

const netsuiteService = require('../services/netsuiteService');
const db = require('../../database');
const { shiftAnnuityDates, parseNsDate } = require('../services/contractAnnuityShift');

class ErpController {

  constructor() {

    this.service = env.SERVICES.ERP;

    this.api = axios.create({
      baseURL: this.service.URL,
      headers: { 
        'Content-Type': 'application/json' 
      },
    });

  }

  syncNetsuiteData = async (req, res) => {
    try {
      const count = await netsuiteService.syncAndSaveData();
      const message = `Successfully synced ${count} records from NetSuite.`;

      if (res) {
        res.status(200).json({ success: true, message });
      }
      
      return { success: true, message };
    } catch (error) {
      console.error('Error syncing NetSuite data:', error);
      const message = 'An internal error occurred while syncing data from NetSuite.';
      
      if (res) {
        res.status(500).json({ success: false, message: error.message });
      }
      
      throw new Error(message);
    }
  }

  getEmployees = async (req, res) => {
    try {
      const employees = await netsuiteService.syncEmployees();
      return res.status(200).json({ success: true, count: employees.length, data: employees });
    } catch (error) {
      console.error('Error fetching employees from NetSuite:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to fetch employees.' });
    }
  }

  runSuiteQL = async (req, res) => {
    try {
      const { q, queryKey, idField } = req.body;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ success: false, message: 'Missing or invalid "q" SuiteQL query in request body.' });
      }

      const rows = await netsuiteService.queryAndSaveSuiteQL(q, queryKey || 'suiteql', idField || 'id');
      return res.status(200).json({ success: true, count: rows.length, data: rows });
    } catch (error) {
      console.error('Error running SuiteQL query:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to run SuiteQL query.' });
    }
  }

  /**
   * Resolves a customrecord1184 id from either an explicit contractId or a
   * contractName lookup against the record's `name` field. Throws on
   * zero or multiple matches rather than guessing.
   */
  #resolveContractId = async (contractId, contractName) => {
    if (contractId !== undefined && contractId !== null && contractId !== '') {
      return { id: String(contractId) };
    }

    // This account's NetSuite version doesn't support SuiteQL bound `params`
    // (added in NetSuite 2026.2), so the literal is escaped by doubling
    // single quotes, the standard SQL string-literal escape.
    const escapedName = String(contractName).replace(/'/g, "''");
    const matches = await netsuiteService.runSuiteQL(
      `SELECT id, name FROM customrecord1184 WHERE name = '${escapedName}'`,
    );

    if (matches.length === 0) {
      return { error: { status: 404, message: `No contract found with name "${contractName}".` } };
    }

    if (matches.length > 1) {
      return {
        error: {
          status: 409,
          message: `Multiple contracts found with name "${contractName}".`,
          candidateIds: matches.map((m) => m.id),
        },
      };
    }

    return { id: String(matches[0].id) };
  }

  updateContractFechas = async (req, res) => {
    try {
      const { contractId, contractName, fechaNacimiento, fechaColecta } = req.body;

      const hasId = contractId !== undefined && contractId !== null && contractId !== '';
      const hasName = contractName !== undefined && contractName !== null && contractName !== '';

      if (hasId === hasName) {
        return res.status(400).json({
          success: false,
          message: 'Provide exactly one of "contractId" or "contractName".',
        });
      }

      if (hasId && !/^\d+$/.test(String(contractId).trim())) {
        return res.status(400).json({ success: false, message: '"contractId" must be numeric.' });
      }

      if (!fechaNacimiento && !fechaColecta) {
        return res.status(400).json({
          success: false,
          message: 'Provide at least one of "fechaNacimiento" or "fechaColecta" to update.',
        });
      }

      const resolved = await this.#resolveContractId(contractId, contractName);
      if (resolved.error) {
        return res.status(resolved.error.status).json({
          success: false,
          message: resolved.error.message,
          ...(resolved.error.candidateIds ? { candidateIds: resolved.error.candidateIds } : {}),
        });
      }

      const updateBody = {};
      if (fechaColecta) updateBody.custrecord_cryo_fechaprocesamientoi = fechaColecta;

      if (fechaNacimiento) {
        updateBody.custrecord_cryo_fnacimientoconf = fechaNacimiento;

        const [current] = await netsuiteService.runSuiteQL(
          `SELECT custrecord_cryo_fnacimientoconf FROM customrecord1184 WHERE id = ${resolved.id}`,
        );
        const oldConf = current?.custrecord_cryo_fnacimientoconf || null;
        const oldConfDate = parseNsDate(oldConf);
        const isSameDate = oldConfDate && oldConfDate.getTime() === new Date(`${fechaNacimiento}T00:00:00Z`).getTime();

        if (!isSameDate) {
          const newAnchor = await shiftAnnuityDates(resolved.id, fechaNacimiento, oldConf);
          if (newAnchor) {
            updateBody.custrecord_cryo_fecha_ini_ultima_a = newAnchor;
          }
        }
      }

      await netsuiteService.updateRecord('customrecord1184', resolved.id, updateBody);

      return res.status(200).json({ success: true, contractId: resolved.id, updated: updateBody });
    } catch (error) {
      console.error('Error updating contract fechas:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to update contract fechas.' });
    }
  }

}

module.exports = new ErpController();
