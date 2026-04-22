const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config');
const db = require('../../database');

/**
 * Webhook for Meta Lead Ads
 * Path is determined by the SLUG in your services configuration.
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

    // Ensure this is a page subscription
    if (body.object === 'page') {
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                if (change.field === 'leadgen') {
                    const leadgenId = change.value.leadgen_id;
                    console.log(`[META WEBHOOK] New lead notification received: ${leadgenId}`);

                    try {
                        // Meta only sends the ID. We must fetch the actual data.
                        const leadDetails = await fetchLeadFromGraphApi(leadgenId);
                        console.log('[META WEBHOOK] Lead details retrieved:', JSON.stringify(leadDetails));

                        // Prepare data for the netsuite_query_results table
                        const row = {
                            query_key: 'meta_lead',
                            suite_id: String(leadgenId),
                            raw_data: JSON.stringify(leadDetails),
                            updated_at: new Date()
                        };

                        const dialect = db.client.config.client;

                        if (dialect === 'mssql') {
                            await db.transaction(async (trx) => {
                                const existing = await trx('netsuite_query_results')
                                    .where('query_key', row.query_key)
                                    .andWhere('suite_id', row.suite_id)
                                    .first();

                                if (existing) {
                                    await trx('netsuite_query_results').where('id', existing.id).update(row);
                                } else {
                                    await trx('netsuite_query_results').insert({ ...row, created_at: new Date() });
                                }
                            });
                        } else {
                            await db('netsuite_query_results')
                                .insert({ ...row, created_at: new Date() })
                                .onConflict(['query_key', 'suite_id'])
                                .merge(['raw_data', 'updated_at']);
                        }

                        console.log(`[META WEBHOOK] Lead ${leadgenId} saved to database.`);
                        
                    } catch (error) {
                        console.error('[META WEBHOOK] Error processing lead:', error.response?.data || error.message);
                    }
                }
            }
        }
        return res.status(200).send('EVENT_RECEIVED');
    }

    res.sendStatus(404);
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