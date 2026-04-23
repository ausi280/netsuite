const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config');
const knex = require('knex');

/**
 * Database Configuration
 * Moved outside the handler to prevent connection leaks
 */
const dbConfig = {
    client: 'mssql',
    connection: {
        host: 'cryoholdco.homeip.net',
        user: 'CryoWebDev',
        password: 'Francia98',
        database: 'CryoCell',
        options: {
            // encrypt: true, 
            // trustServerCertificate: true 
        }
    }
};

const db = knex(dbConfig);

/**
 * Webhook for Meta Lead Ads
 */

// 1. Webhook Verification (GET)
// Meta calls this once when you set up the webhook in the App Dashboard.
router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // This should match the "Verify Token" you set in the Meta App Dashboard
    const verifyToken = config.env.META_VERIFY_TOKEN || 'my_default_secure_token';

    if (mode && token) {
        if (mode === 'subscribe' && token === verifyToken) {
            console.log('[META WEBHOOK] Verification successful.');
            return res.status(200).send(challenge);
        } else {
            console.warn('[META WEBHOOK] Verification failed: Token mismatch.');
            return res.sendStatus(403);
        }
    }
    res.sendStatus(400);
});

// 2. Lead Notification (POST)
// Meta sends a notification here whenever a form is submitted.
router.post('/', async (req, res) => {
    const body = req.body;
    console.log('[META WEBHOOK] New lead notification received:', JSON.stringify(body, null, 2));

    // Ensure this is a page subscription
    if (body && body.object === 'page') {
        for (const entry of (body.entry || [])) {
            for (const change of (entry.changes || [])) {
                if (change.field === 'leadgen') {
                    const leadgenId = change.value.leadgen_id;
                    console.log(`[META WEBHOOK] Processing leadgen_id: ${leadgenId}`);

                    // Skip processing if it's a dummy test ID from the Meta Dashboard
                    if (leadgenId === '0' || leadgenId === '444444444444') {
                        console.log('[META WEBHOOK] Test lead detected. Skipping Graph API call.');
                        continue;
                    }

                    try {
                        // Meta only sends the ID. We must fetch the actual data.
                        const leadDetails = await fetchLeadFromGraphApi(leadgenId);
                        console.log('[META WEBHOOK] Lead details retrieved:', JSON.stringify(leadDetails));

                        // Extract data from leadDetails.field_data
                        const fieldDataMap = {};
                        if (leadDetails.field_data) {
                            leadDetails.field_data.forEach(field => {
                                fieldDataMap[field.name] = field.values && field.values.length > 0 ? field.values[0] : null;
                            });
                        }

                        // Map to stored procedure parameters
                        // IMPORTANT: Adjust these mappings based on the actual field names in your Meta Lead Forms.
                        // If a field is not present in your form, it will be passed as null.
                        const empresa = 1;
                        const nombre = fieldDataMap['first_name'] || fieldDataMap['full_name']?.split(' ')[0] || null;
                        const apellido = fieldDataMap['last_name'] || fieldDataMap['full_name']?.split(' ').slice(1).join(' ') || null;
                        const telefono = fieldDataMap['phone_number'] || null;
                        const correo = fieldDataMap['email'] || null;
                        const estado = fieldDataMap['state'] || null;
                        const mensaje = fieldDataMap['message'] || null;
                        const asunto = 'meta_lead';
                        const vendedorCorreo = fieldDataMap['sales_rep_email'] || null;
                        const ciudad = fieldDataMap['city'] || null;
                        const categoriaAsunto = fieldDataMap['subject_category'] || null;
                        const codigoPostal = fieldDataMap['zip_code'] || null;

                        // Default or placeholder values for integer parameters (adjust as needed)
                        // These typically come from your internal system or specific Meta custom fields.
                        const idAsistente = null; 
                        const idMedico = null;    
                        const idUsuario = null;   
                        const idTitular = null;   
                        const premio = 0;

                        // Execute the stored procedure
                        await db.raw(`
                            EXEC [dbo].[SW_InsertarProspecto]
                                @Empresa = ?,
                                @Nombre = ?,
                                @Apellido = ?,
                                @Telefono = ?,
                                @Correo = ?,
                                @Estado = ?,
                                @Mensaje = ?,
                                @Asunto = ?,
                                @VendedorCorreo = ?,
                                @Ciudad = ?,
                                @CategoriaAsunto = ?,
                                @CodigoPostal = ?,
                                @ID_Asistente = ?,
                                @ID_Medico = ?,
                                @ID_Usuario = ?,
                                @ID_Titular = ?,
                                @Premio = ?;
                        `, [
                            empresa, nombre, apellido, telefono, correo, estado, mensaje,
                            asunto, vendedorCorreo, ciudad, categoriaAsunto, codigoPostal,
                            idAsistente, idMedico, idUsuario, idTitular, premio
                        ]);

                        console.log(`[META WEBHOOK] Stored procedure SW_InsertarProspecto executed for lead ${leadgenId}.`);
                        
                    } catch (error) {
                        console.error('[META WEBHOOK] Error processing lead:', error.response?.data || error.message);
                    }
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }

    // Always return 200 to Meta to prevent retries/disabling the webhook
    res.status(200).send('NOT_PAGE_OBJECT');
});

/**
 * Helper to fetch lead data using the Meta Graph API
 */
async function fetchLeadFromGraphApi(leadId) {
    const accessToken = config.env.META_PAGE_ACCESS_TOKEN;
    const url = `https://graph.facebook.com/v20.0/${leadId}`;
    
    const response = await axios.get(url, {
        params: { access_token: accessToken }
    });
    return response.data;
}

module.exports = router;