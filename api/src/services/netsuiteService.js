const axios = require('axios');
const env = require('../../config').env;
const db = require('../../database');
const OAuth = require('oauth-1.0a'); 
const crypto = require('crypto');

class NetsuiteService {

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
  }

  async #validateCredentials() {
    try {
      const realm = this.service.REALM.replace('_', '-').toLowerCase();
      const url = `https://${realm}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;
      const body = { "q": "SELECT 1 FROM dual" };
      const requestData = { url, method: 'POST' };
      const authHeaders = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
      authHeaders.Authorization = `OAuth realm="${this.service.REALM}", ${authHeaders.Authorization.replace('OAuth ', '')}`;

      await axios.post(url, body, { headers: { 
            'Content-Type': 'application/json',
            'Prefer': 'transient',
            'Accept': 'application/json' , 
            ...authHeaders 
          }  });
    } catch (error) {
      if (error.response && error.response.data && error.response.data['o:errorCode'] === 'INVALID_LOGIN') {
        throw new Error('Invalid NetSuite credentials. Please check your configuration.');
      }
      console.error('Failed to connect to NetSuite:', error.response ? error.response.data : error.message);
      throw new Error(`Failed to connect to NetSuite. Reason: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
    }
  }

  async #executeSuiteQL(query) {
    let allItems = [];
    let hasMore = true;
    const realm = this.service.REALM.replace('_', '-').toLowerCase();
    let url = `https://${realm}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql`;

    const body = { q: query };

    while (hasMore) {
      try {
        const requestData = {
          url,
          method: 'POST',
        };

        const authHeaders = this.oauth.toHeader(this.oauth.authorize(requestData, this.token));
        authHeaders.Authorization = `OAuth realm="${this.service.REALM}", ${authHeaders.Authorization.replace('OAuth ', '')}`;

        const response = await axios.post(url, body, {
          headers: {
            'Content-Type': 'application/json',
            'Prefer': 'transient',
            'Accept': 'application/json',
            ...authHeaders,
          },
        });

        if (response.data && response.data.items) {
          allItems = allItems.concat(response.data.items);
        }

        hasMore = Boolean(response.data && response.data.hasMore);

        if (hasMore) {
          const nextLink = response.data.links.find((link) => link.rel === 'next');
          if (nextLink) {
            url = nextLink.href;
          } else {
            hasMore = false;
          }
        }
      } catch (error) {
        console.error('Error fetching data from NetSuite:', error.message);
        if (error.response) {
          console.error('Response data:', error.response.data);
          console.error('Response status:', error.response.status);
        }
        hasMore = false;
        throw new Error('Failed to fetch data from NetSuite.');
      }
    }

    return allItems;
  }

  async #fetchAllRecords() {
    return this.#executeSuiteQL('SELECT * FROM customrecord1184');
  }

  async fetchAllEmployees() {
    return this.#executeSuiteQL('SELECT * FROM employee');
  }

  async saveSuiteQLResults(queryKey, records, idField = 'id') {
    if (!queryKey || !Array.isArray(records)) {
      throw new Error('queryKey and records (array) are required to save SuiteQL results.');
    }

    const results = records.map(record => ({
      query_key: queryKey,
      suite_id: record[idField] !== undefined && record[idField] !== null ? String(record[idField]) : null,
      raw_data: JSON.stringify(record),
      created_at: new Date(),
      updated_at: new Date(),
    }));

    const dialect = db.client.config.client;

    if (results.length === 0) {
      return 0;
    }

    if (dialect === 'mssql') {
      await db.transaction(async trx => {
        for (const row of results) {
          const existing = await trx('netsuite_query_results')
            .where('query_key', row.query_key)
            .andWhere('suite_id', row.suite_id)
            .first();

          if (existing) {
            await trx('netsuite_query_results').where('id', existing.id).update({ raw_data: row.raw_data, updated_at: row.updated_at });
          } else {
            await trx('netsuite_query_results').insert(row);
          }
        }
      });
    } else {
      await db.transaction(async trx => {
        await trx('netsuite_query_results')
          .insert(results)
          .onConflict(['query_key', 'suite_id'])
          .merge(['raw_data', 'updated_at']);
      });
    }

    return results.length;
  }

  async syncEmployees() {
    const employees = await this.fetchAllEmployees();
    await this.saveSuiteQLResults('employee', employees, 'id');
    return employees;
  }

  async queryAndSaveSuiteQL(query, queryKey = 'suiteql', idField = 'id') {
    if (!query || typeof query !== 'string') {
      throw new Error('Valid SuiteQL query string is required.');
    }

    const records = await this.#executeSuiteQL(query);
    await this.saveSuiteQLResults(queryKey, records, idField);
    return records;
  }

  async syncAndSaveData() {
    await this.#validateCredentials();
    const records = await this.#fetchAllRecords();
    const formattedRecords = records.map(record => ({
      netsuite_id: record.id,
      name: record.name,
      created: record.created,
      lastmodified: record.lastmodified,
      custrecord_cryo_contratosistemaanterior: record.custrecord_cryo_contratosistemaanterior,
      custrecord_cryo_numerocontrato: record.custrecord_cryo_numerocontrato,
      custrecord_nso_token: record.custrecord_nso_token,
      links: JSON.stringify(record.links),
      custrecord_cryo_actualizar_fecha: record.custrecord_cryo_actualizar_fecha,
      custrecord_cryo_aniosanticipados: record.custrecord_cryo_aniosanticipados,
      custrecord_cryo_articulobonif: record.custrecord_cryo_articulobonif,
      custrecord_cryo_cesarea: record.custrecord_cryo_cesarea,
      custrecord_cryo_duenio: record.custrecord_cryo_duenio,
      custrecord_cryo_envio_exitoso: record.custrecord_cryo_envio_exitoso,
      custrecord_cryo_especimen: record.custrecord_cryo_especimen,
      custrecord_cryo_estatus: record.custrecord_cryo_estatus,
      custrecord_cryo_fecha_ini_ultima_a: record.custrecord_cryo_fecha_ini_ultima_a,
      custrecord_cryo_fechanacimiento: record.custrecord_cryo_fechanacimiento,
      custrecord_cryo_fechaprocesamientoi: record.custrecord_cryo_fechaprocesamientoi,
      custrecord_cryo_finicio: record.custrecord_cryo_finicio,
      custrecord_cryo_fnacimientoconf: record.custrecord_cryo_fnacimientoconf,
      custrecord_cryo_garantia_completa: record.custrecord_cryo_garantia_completa,
      custrecord_cryo_garantiafallecimiento: record.custrecord_cryo_garantiafallecimiento,
      custrecord_cryo_mensaje_email_mostrado: record.custrecord_cryo_mensaje_email_mostrado,
      custrecord_cryo_mesnac_letra: record.custrecord_cryo_mesnac_letra,
      custrecord_cryo_mesnacimiento: record.custrecord_cryo_mesnacimiento,
      custrecord_cryo_moneda: record.custrecord_cryo_moneda,
      custrecord_cryo_numerofamilia: record.custrecord_cryo_numerofamilia,
      custrecord_cryo_padres: record.custrecord_cryo_padres,
      custrecord_cryo_primera_vez_part: record.custrecord_cryo_primera_vez_part,
      custrecord_cryo_procesadosi: record.custrecord_cryo_procesadosi,
      custrecord_cryo_saldo_inicial: record.custrecord_cryo_saldo_inicial,
      custrecord_cryo_servicio: record.custrecord_cryo_servicio,
      custrecord_cryo_solicitaaprobacion: record.custrecord_cryo_solicitaaprobacion,
      custrecord_cryo_subsidiariacontrato: record.custrecord_cryo_subsidiariacontrato,
      custrecord_cryo_titular_deudor: record.custrecord_cryo_titular_deudor,
      custrecord_cryo_titularcontrato: record.custrecord_cryo_titularcontrato,
      custrecord_cryo_ubicacion: record.custrecord_cryo_ubicacion,
      custrecord_cryo_vendedor: record.custrecord_cryo_vendedor,
      custrecord_nso_cc_marca_contrato_mx: record.custrecord_nso_cc_marca_contrato_mx,
      custrecordcryo_tipocambiocontrato: record.custrecordcryo_tipocambiocontrato,
      isinactive: record.isinactive,
      lastmodifiedby: record.lastmodifiedby,
      owner: record.owner,
      recordid: record.recordid,
      scriptid: record.scriptid,
      raw_data: JSON.stringify(record)
    }));

    const dialect = db.client.config.client;

    if (dialect === 'mssql') {
      await db.transaction(async trx => {
        for (const record of formattedRecords) {
          const existing = await trx('netsuite_records').where('netsuite_id', record.netsuite_id).first();
          if (existing) {
            await trx('netsuite_records').where('netsuite_id', record.netsuite_id).update(record);
          } else {
            await trx('netsuite_records').insert(record);
          }
        }
      });
    } else {
      await db.transaction(async trx => {
        await trx('netsuite_records')
          .insert(formattedRecords)
          .onConflict('netsuite_id')
          .merge();
      });
    }

    return formattedRecords.length;
  }
}

module.exports = new NetsuiteService();
