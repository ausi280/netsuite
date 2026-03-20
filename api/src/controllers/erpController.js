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


    this.token = {
      key: this.service.ACCESS_TOKEN,
      secret: this.service.TOKEN_SECRET,
    };

    this.oauth = OAuth({
      consumer: {
        key: this.service.CONSUMER_KEY,
        secret: this.service.CONSUMER_SECRET,
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base, key) {
        return crypto.createHmac('sha256', key).update(base).digest('base64');
      },
    });

    this.api = axios.create({
      baseURL: this.service.URL,
      headers: { 
        'Content-Type': 'application/json' 
      },
    });

  }

  #send = async (method, params, data ) => {

    const request = {
      url: this.service.URL,
      method: method,
      headers: {},
      data : params
    }

    request.headers = this.oauth.toHeader(
        this.oauth.authorize(request, this.token)
    );

    request.headers.Authorization = `OAuth realm="${this.service.REALM}", ${request.headers.Authorization.replace('OAuth ', '')}`;

    const response = await axios({
      method,
      url: request.url,
      params: params,
      data: data,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers
      }
    });

    return response;
  }

  #process = async (res, callback, options = {}) => {

    const { returnData = false } = options;

    try {

      const response = await callback();

      if( returnData )
        return response.data;

      res.status(response.status).json(response.data);

    } catch (error) {

      if( returnData )
        throw error;

      const status = error.response?.status || 500;
      const data = error.response?.data || { error: error.message };
      res.status(status).json({data: data});

    }
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
        res.status(500).json({ success: false, message });
      }
      
      throw new Error(message);
    }
  }


}

module.exports = new ErpController();
