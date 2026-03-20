const axios = require('axios');
const env = require('../../config').env;
const db = require('../../database');

class NetsuiteService {

  constructor() {
    this.service = env.SERVICES.NETSUITE; // Assuming you will add NETSUITE to your config
  }

  async #fetchAllRecords() {
    let allItems = [];
    let hasMore = true;
    let url = 'https://9358923.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql'; // URL from the prompt

    const body = {
      "q": "SELECT * FROM customrecord1184"
    };

    while (hasMore) {
      try {
        // TODO: Add authentication if required.
        // const headers = { 'Authorization': 'Bearer YOUR_TOKEN' };
        // const response = await axios.post(url, body, { headers });

        const response = await axios.post(url, body);

        if (response.data && response.data.items) {
          allItems = allItems.concat(response.data.items);
        }

        hasMore = response.data.hasMore;

        if (hasMore) {
          const nextLink = response.data.links.find(link => link.rel === 'next');
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
        // Stop fetching if there's an error
        hasMore = false;
        throw new Error('Failed to fetch data from NetSuite.');
      }
    }

    return allItems;
  }

  async syncAndSaveData() {
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

    await db.transaction(async trx => {
      await trx('netsuite_records')
        .insert(formattedRecords)
        .onConflict('netsuite_id')
        .merge();
    });

    return formattedRecords.length;
  }
}

module.exports = new NetsuiteService();
