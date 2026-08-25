const env = require('../../config').env;
const PackageModel = require('../models/packageModel');
const axios = require('axios');
const OAuth = require('oauth-1.0a'); 
const crypto = require('crypto');
const knex = require('knex');
const pRetry = require('p-retry');

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
      const { contractName, fechaNacimiento, especimenNombre } = req.body;
      // fechaColecta and fechaProcesamiento are accepted as aliases for the same input -
      // callers have used both names; fechaColecta wins if both are somehow sent.
      const fechaColecta = req.body.fechaColecta || req.body.fechaProcesamiento;

      // PATCH /contracts/:contractId supplies the id via the URL, unambiguously - the
      // body-based "contractId or contractName" mutual-exclusion check below only applies
      // to the legacy POST /contracts/fechas shape, which has no URL param to draw it from.
      let contractId = req.params.contractId;
      if (!contractId) {
        const bodyContractId = req.body.contractId;
        const hasId = bodyContractId !== undefined && bodyContractId !== null && bodyContractId !== '';
        const hasName = contractName !== undefined && contractName !== null && contractName !== '';

        if (hasId === hasName) {
          return res.status(400).json({
            success: false,
            message: 'Provide exactly one of "contractId" or "contractName".',
          });
        }
        contractId = bodyContractId;
      }

      if (contractId !== undefined && contractId !== null && contractId !== '' && !/^\d+$/.test(String(contractId).trim())) {
        return res.status(400).json({ success: false, message: '"contractId" must be numeric.' });
      }

      const trimmedEspecimenNombre = typeof especimenNombre === 'string' ? especimenNombre.trim() : '';

      if (!fechaNacimiento && !fechaColecta && !trimmedEspecimenNombre) {
        return res.status(400).json({
          success: false,
          message: 'Provide at least one of "fechaNacimiento", "fechaColecta" (or "fechaProcesamiento"), or "especimenNombre" to update.',
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

      // Read the OLD confirmed birth date (needed below to compute the annuity day-shift) and/or
      // the linked espécimen id (custrecord_cryo_especimen, a customrecord_cryo_familia record)
      // before writing anything — both must be read before any write can invalidate them.
      let oldConf = null;
      let especimenId = null;
      if (fechaNacimiento || trimmedEspecimenNombre) {
        const [current] = await netsuiteService.runSuiteQL(
          `SELECT custrecord_cryo_fnacimientoconf, custrecord_cryo_especimen FROM customrecord1184 WHERE id = ${resolved.id}`,
        );
        oldConf = current?.custrecord_cryo_fnacimientoconf || null;
        especimenId = current?.custrecord_cryo_especimen || null;
      }

      if (trimmedEspecimenNombre && !especimenId) {
        return res.status(422).json({
          success: false,
          message: `Contract ${resolved.id} has no linked espécimen (custrecord_cryo_especimen) to rename.`,
        });
      }

      // Write the user-facing fields FIRST, before touching any partidas.
      // Updating a contract's partidas can bump the parent contract's own
      // internal revision in NetSuite, causing a later PATCH on the
      // contract to be rejected with a "record has changed" conflict even
      // though nothing here modified it concurrently — writing these fields
      // while the record is still untouched avoids that race for the
      // fields that matter most.
      const updated = {};
      if (fechaColecta) updated.custrecord_cryo_fechaprocesamientoi = fechaColecta;
      if (fechaNacimiento) {
        updated.custrecord_cryo_fnacimientoconf = fechaNacimiento;

        // Derived from the "YYYY-MM-DD" string directly (not a parsed Date) to sidestep
        // timezone/day-month-swap pitfalls. custrecord_cryo_mesnacimiento is zero-padded
        // ("08"), custrecord_cryo_mesnac_letra is not ("8") — matches the values NetSuite
        // itself already stores on existing contracts (see confirmed real records).
        const mesNacimiento = fechaNacimiento.split('-')[1];
        if (mesNacimiento) {
          updated.custrecord_cryo_mesnacimiento = mesNacimiento;
          updated.custrecord_cryo_mesnac_letra = String(parseInt(mesNacimiento, 10));
        }
      }

      if (Object.keys(updated).length > 0) {
        await this.#updateRecordWithRetry('customrecord1184', resolved.id, updated);
      }

      let especimenUpdated = null;
      if (trimmedEspecimenNombre) {
        await this.#updateRecordWithRetry('customrecord_cryo_familia', especimenId, {
          custrecord_cryo_nombremiembro: trimmedEspecimenNombre,
        });
        especimenUpdated = { id: especimenId, nombre: trimmedEspecimenNombre };
      }

      let warning = null;

      if (fechaNacimiento) {
        const oldConfDate = parseNsDate(oldConf);
        const isSameDate = oldConfDate && oldConfDate.getTime() === new Date(`${fechaNacimiento}T00:00:00Z`).getTime();

        if (!isSameDate) {
          const newAnchor = await shiftAnnuityDates(resolved.id, fechaNacimiento, oldConf);
          if (newAnchor) {
            // This PATCH still comes after the partida writes above, so it
            // remains exposed to the same conflict. Retry it same as above,
            // but don't fail the whole request if it doesn't clear in
            // time — fechaNacimiento/fechaColecta already saved above.
            try {
              await this.#updateRecordWithRetry('customrecord1184', resolved.id, { custrecord_cryo_fecha_ini_ultima_a: newAnchor });
              updated.custrecord_cryo_fecha_ini_ultima_a = newAnchor;
            } catch (error) {
              warning = `fechaNacimiento/fechaColecta saved, but the annuity anchor date could not be updated: ${error.message}`;
              console.error(`Contract ${resolved.id}:`, warning);
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        contractId: resolved.id,
        updated,
        ...(especimenUpdated ? { especimenUpdated } : {}),
        ...(warning ? { warning } : {}),
      });
    } catch (error) {
      console.error('Error updating contract fechas:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to update contract fechas.' });
    }
  }

  /** Retries a NetSuite record PATCH on the known "record has changed" conflict; aborts immediately on anything else. */
  #updateRecordWithRetry = async (recordType, id, body) => {
    return pRetry(async () => {
      try {
        await netsuiteService.updateRecord(recordType, id, body);
      } catch (error) {
        if (error.message && error.message.includes('ha cambiado')) {
          throw error;
        }
        throw new pRetry.AbortError(error);
      }
    }, {
      retries: 3,
      minTimeout: 500,
      factor: 2,
      onFailedAttempt: (error) => {
        console.warn(`Contract ${contractId} update conflict, retrying (${error.retriesLeft} left)`);
      },
    });
  }

}

module.exports = new ErpController();
