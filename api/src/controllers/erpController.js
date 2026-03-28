const env = require('../../config').env;
const PackageModel = require('../models/packageModel');
const axios = require('axios');
const OAuth = require('oauth-1.0a'); 
const crypto = require('crypto');
const knex = require('knex');

const netsuiteService = require('../services/netsuiteService');
const db = require('../../database');

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


}

module.exports = new ErpController();
