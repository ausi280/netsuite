const express = require('express');
const router = express.Router();
const knex = require('knex');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const leadNetsuiteService = require('../services/leadNetsuiteService');
const renewLeadNetsuiteService = require('../services/renewLeadNetsuiteService');

/**
 * Database Configuration
 * Reusing the configuration from your Meta Webhook setup
 */
const dbConfig = {
    client: 'mssql',
    connection: {
        host: 'cryoholdco.homeip.net',
        user: 'CryoWebDev',
        password: 'Francia98',
        database: 'Cryo',
        options: {
            encrypt: false, // Set to true if using Azure
            trustServerCertificate: true 
        }
    }
};

const db = knex(dbConfig);

// Google Sheets Configuration
const SPREADSHEET_ID = '1xX6DKxsZqLXyW058qQ0kKR8ZiX7ae--34I77_1JT9eQ'; // Replace with your actual Sheet ID
const CREDENTIALS = {
  client_email: "crmintegration@crmintegracion-494200.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDcsQIsRDFiykss\nS7CyTsDKdAeWBk5XFWZQpPfb1JoZ3SUGuqwimOveOHl0cMsGJMV/uTeF2fX5hbXg\nu1mgd/R4eNmyEI6q5de0gxTxHJ9x8qojwHyVIqVCNBbco+j74dMBpwjOkZR8Cw+b\nxUZeQxAbQBIUVAWnGHlCdcTYcYWTlAnEXW/wZ4gdPECfAvW+34bqcpnVfsmJOTOe\nDFyxqmq09PaoMQq7I9dgSFC9w5yjqmCcC4ZpuTtHOC1N1PeodZ4VsHKIMB2XbVYA\np84ilM99x0ONUgU7G8UB6NztfKJyYHvKFKFGpLtXrRXIIsXo07Qqq8kKtPu23pDJ\n7EjYgj4PAgMBAAECggEAHas0QhQ22XOdsIpKamY4996qaGpXnNB1LVFIOwb1YpW+\n1Q1Cd/I7/2dzOIqzWJOX84hIZRe8wDtQDLLTJUYLGSkSByS/sUzt90gKCDITY2O+\nqMjHVttOATz0d9wXRcmBrv6wKekbX6OzCPt37tMwNqGh7JaxHdol7x/bA0gbr4+e\n2ANkFRx3spGU0WdQ00WsLCCKzrNlWKbc4rCJvAT3vZg+j858OGzzcjH+ODOkHXBl\nt3A7rtrz3FfIPuIqGyGaZH64LwoS8LDInr9kMUPj2sMLxuv5XBc8/US6ue1DPr6s\n8sK4Nu5P3LS16/Xn80/No9b3MlfuBHoDuNkJ+2NoqQKBgQD5Bo0w+P3uKSrZTIBM\nlmrofZ8ZAhz5H7b0z/iA9LSRkT7vCVf1qIojHvLSbYA7XIYMnmYfemLVk6ulSzxt\njmZLl9qTWxnh2HV/YTm5ORemutdzokFWY4OFxMO+/TZq0LTJr0ePA25XDx8kdUc2\n7djU5KgXhHXRysw2RAAeQg5y2QKBgQDi30740xrzomluykp1mF2fWKA4io+tkoP8\n1M5qiIl5s9SXpprI8qmhc5pfqwZAQM6qcBmfnv44RyLOviRYB4BZrhvvirLVJATr\nT1YNzaLXeOPL2e3hRHN5WePIvbs1D1EUBqy7gsH4KiUeWxmgDyM7kQUhdF+b7VH3\napKxTx9XJwKBgQCX6To6VLo7Ddv4wSVHEz9WYkOqstJP2tv2DeRPbne0kUEt+qow\nzsat1BRW77uY+sE/c2Vi8HrYRQQhinrrbkHS/Wi2GY35at2KfhoDduOJr1L9VE69\nT2mNMdIjcT4//N88ZXOmt3YZH71ktTJjPMbYYEB2UDS7bRYUSHk1/B/qSQKBgQC0\nKNbim2mcrY2CMFwetCcsoclh/Q6JrH7pqOheCxz4q0iYQPJLvv/buRyO+hYVsiEr\nkaeXbT+92yeV+8KKsTJIhQ2kFIVc4qSRZEgW4AR/jX1/5QiVSbFVXX+YaqqeQRKG\nj6JdqUF1W6psR7W6uCqnY8sqPOqrvTLJAjWJXiaqIwKBgCbgUUyXDPtSq6SowMy1\n7W5MCrS+wW1WElXAJwaQGyP/NsRaMudXWI0oIbi9TiI99/SN3REEElasBIZBUOuG\neW5VxXnO/khY073soeJIX7l0buEXqKfz5UKCdxQEQpXCcTulXTBndDZJQ4t4Rmjc\n9Sd1VoA/d0vBWOVyfAi8jdcw\n-----END PRIVATE KEY-----\n"
};

/**
 * Helper to convert column index to Excel-like letter (0 -> A, 26 -> AA)
 */
const getColumnLetter = (index) => {
    let letter = '';
    while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
    }
    return letter;
};

// New helper function to fetch "Motivo No Venta" from the database
const getMotivoNoVenta = async (phoneNumber) => {
    if (!phoneNumber) {
        return null;
    }
    try {
        // 1. Find Id_Prospecto from ProspectoTelefono
        const prospectoTelefonoResult = await db.raw(
            `SELECT Id_Prospecto FROM ProspectoTelefono WHERE Telefono = ?`,
            [phoneNumber]
        );
        if (!prospectoTelefonoResult || prospectoTelefonoResult.length === 0) {
            return null;
        }
        const idProspecto = prospectoTelefonoResult[0].Id_Prospecto;

        // 2. Find ID_NoVenta from Prospecto
        const prospectoResult = await db.raw(
            `SELECT ID_NoVenta FROM Prospecto WHERE Id_Prospecto = ?`,
            [idProspecto]
        );
        if (!prospectoResult || prospectoResult.length === 0 || prospectoResult[0].ID_NoVenta === null) {
            return null;
        }
        const idNoVenta = prospectoResult[0].ID_NoVenta;

        // 3. Find Nombre from NoVenta
        const noVentaResult = await db.raw(
            `SELECT Nombre FROM NoVenta WHERE ID_NoVenta = ?`,
            [idNoVenta]
        );
        if (!noVentaResult || noVentaResult.length === 0) {
            return null;
        }
        return noVentaResult[0].Nombre;

    } catch (error) {
        console.error(`[DB Lookup] Error fetching Motivo No Venta for phone ${phoneNumber}:`, error);
        return null;
    }
};

// Helper function to fetch "Contrato" status (Si/No) from the database
const getContratoStatus = async (phoneNumber) => {
    if (!phoneNumber) {
        return null;
    }
    try {
        // 1. Find Id_Prospecto from ProspectoTelefono
        const ptRes = await db.raw(
            `SELECT Id_Prospecto FROM ProspectoTelefono WHERE Telefono = ?`,
            [phoneNumber]
        );
        if (!ptRes || ptRes.length === 0) {
            return null;
        }
        const idProspecto = ptRes[0].Id_Prospecto;

        // 2. Find Activo and id_contrato from Prospecto
        const pRes = await db.raw(
            `SELECT Activo, id_contrato FROM Prospecto WHERE Id_Prospecto = ?`,
            [idProspecto]
        );
        
        if (!pRes || pRes.length === 0) {
            return "No";
        }

        const { Activo, id_contrato } = pRes[0];

        // Validation: If Active, skip update
        if (Activo) {
            return null;
        }

        const hasContrato = id_contrato != null ? "Si" : "No";
        return hasContrato;

    } catch (error) {
        console.error(`[DB Lookup] Error fetching Contrato status for phone ${phoneNumber}:`, error);
        return null;
    }
};

/**
 * Core logic to synchronize leads from Google Sheets to the Database
 */
const syncGoogleLeads = async () => {
    // 1. Authenticate with Google
        const auth = new google.auth.GoogleAuth({
            credentials: CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const sheets = google.sheets({ version: 'v4', auth });

        // 2. Get metadata to find all sheets in the spreadsheet
        const spreadsheetMetadata = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
        });
        const sheetList = spreadsheetMetadata.data.sheets || [];
        
        let totalProcessedCount = 0;
        const results = [];

        // 3. Iterate through each sheet
        for (const sheet of sheetList) {
            const sheetName = sheet.properties.title;
            
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: `${sheetName}!A:Z`, 
            });

            const rows = response.data.values;
            if (!rows || rows.length <= 1) continue;

            const headers = rows[0];
            const emailIdx = headers.indexOf('email');
            let statusIdx = headers.indexOf('Sync Status');
            let motivoNoVentaIdx = headers.indexOf('Motivo No Venta'); // New column index
            let contratoIdx = headers.indexOf('Contrato'); // New column index

            /*if (emailIdx === -1) {
                console.warn(`[SHEET SYNC] Skipping sheet "${sheetName}": Missing "Email" column.`);
                continue;
            }*/

            // If status column doesn't exist, create it at the end
            if (statusIdx === -1) {
                statusIdx = headers.length;
                const colLetter = getColumnLetter(statusIdx);
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${colLetter}1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [['Sync Status']] },
                });
                console.log(`[SHEET SYNC] Created "Sync Status" column in sheet: ${sheetName}`);
            }

            // If "Motivo No Venta" column doesn't exist, create it
            if (motivoNoVentaIdx === -1) {
                motivoNoVentaIdx = headers.length; // Place it after existing headers
                const colLetter = getColumnLetter(motivoNoVentaIdx);
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${colLetter}1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [['Motivo No Venta']] },
                });
                console.log(`[SHEET SYNC] Created "Motivo No Venta" column in sheet: ${sheetName}`);
                // Update headers array to reflect new column
                headers.push('Motivo No Venta');
            }

            // If "Contrato" column doesn't exist, create it
            if (contratoIdx === -1) {
                contratoIdx = headers.length; // Place it after existing headers
                const colLetter = getColumnLetter(contratoIdx);
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${sheetName}!${colLetter}1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [['Contrato']] },
                });
                console.log(`[SHEET SYNC] Created "Contrato" column in sheet: ${sheetName}`);
                // Update headers array to reflect new column
                headers.push('Contrato');
            }

            let sheetProcessedCount = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const email = row[emailIdx] || null;
                const status = row[statusIdx];
                const currentMotivoNoVenta = row[motivoNoVentaIdx]; // Get current value
                const currentContrato = row[contratoIdx]; // Get current value
                const telefonoRaw = row[headers.indexOf('phone_number')] || null;
                const telefono = telefonoRaw ? telefonoRaw.replace(/^p:\s*/i, '').replace(/^\+52/, '') : null;

                // 1. Process Lead Insertion if not already processed and has an email
                if (status !== 'PROCESSED') {
                    const nombre = row[headers.indexOf('full_name')] || null;
                    const apellido = row[headers.indexOf('Last Name')] || null;
                    const platform = row[headers.indexOf('platform')] || 'Google Sheets';
                    const mensaje = row[headers.indexOf('city')] + ' ' + row[headers.indexOf('fecha_probable_del_parto')] || ' ' + row[headers.indexOf('semanas_de_embarazo')] || ' Hospital: ' + row[headers.indexOf('hospital_probable_de_parto')] || ' ';
                    const ciudad = row[headers.indexOf('city')] || null;

                    await db.raw(`
                        EXEC [dbo].[SW_InsertarProspecto]
                            @Empresa = 1,
                            @Nombre = ?,
                            @Apellido = ?,
                            @Telefono = ?,
                            @Correo = ?,
                            @Asunto = ?,
                            @Mensaje = ?,
                            @Premio = 0,
                            @Ciudad = ?,
                            @Estado = 'NA';
                    `, [nombre, apellido, telefono, email, platform, mensaje, ciudad]);

                    console.log(`[SHEET SYNC] Inserted lead: ${email} from ${sheetName}`);

                    if(false){
                        // Dual-write into NetSuite (Customer/Lead record, subsidiary 5,
                        // form 874). Best-effort: a NetSuite failure must not stop the
                        // existing SQL Server insert / sheet status update below.
                        try {
                            const nsResult = await leadNetsuiteService.upsertLeadInNetsuite({
                                firstName: nombre,
                                lastName: apellido,
                                email,
                                phone: telefono,
                                weeksPregnant: row[headers.indexOf('semanas_de_embarazo')],
                                dueDate: row[headers.indexOf('fecha_probable_del_parto')],
                            });
                            console.log(`[SHEET SYNC] NetSuite lead ${nsResult.created ? 'created' : 'updated'} (id ${nsResult.id}) for ${email}`);
                        } catch (nsError) {
                            console.error(`[SHEET SYNC] NetSuite sync failed for ${email}:`, nsError.message);
                        }
                    }

                    const columnLetter = getColumnLetter(statusIdx);
                    const rangeToUpdate = `${sheetName}!${columnLetter}${i + 1}`;

                    await sheets.spreadsheets.values.update({
                        spreadsheetId: SPREADSHEET_ID,
                        range: rangeToUpdate,
                        valueInputOption: 'USER_ENTERED',
                        resource: { values: [['PROCESSED']] },
                    });

                    sheetProcessedCount++;
                    totalProcessedCount++;
                }

                // Populate "Motivo No Venta" if empty
                if (!currentMotivoNoVenta) {
                    const motivoNoVenta = await getMotivoNoVenta(telefono);
                    if (motivoNoVenta) {
                        const motivoNoVentaColumnLetter = getColumnLetter(motivoNoVentaIdx);
                        const motivoNoVentaRangeToUpdate = `${sheetName}!${motivoNoVentaColumnLetter}${i + 1}`;
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: motivoNoVentaRangeToUpdate,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [[motivoNoVenta]] },
                        });
                        console.log(`[SHEET SYNC] Updated "Motivo No Venta" for row ${i + 1} in ${sheetName}: ${motivoNoVenta}`);
                    }
                }

                // Populate "Contrato" if empty
                if (!currentContrato) {
                    const contratoStatus = await getContratoStatus(telefono);
                    if (contratoStatus) {
                        const contratoColumnLetter = getColumnLetter(contratoIdx);
                        const contratoRangeToUpdate = `${sheetName}!${contratoColumnLetter}${i + 1}`;
                        await sheets.spreadsheets.values.update({
                            spreadsheetId: SPREADSHEET_ID,
                            range: contratoRangeToUpdate,
                            valueInputOption: 'USER_ENTERED',
                            resource: { values: [[contratoStatus]] },
                        });
                        console.log(`[SHEET SYNC] Updated "Contrato" for row ${i + 1} in ${sheetName}: ${contratoStatus}`);
                    }
                }
            }
            results.push({ sheet: sheetName, processed: sheetProcessedCount });
        }

    return { totalProcessedCount, results };
};

// Meta lead-ads exports synced to NetSuite only (see renewLeadNetsuiteService.js) - newest leads
// are at the top of each sheet. Every sheet uses the same NetSuite lead form (741, subsidiary 10);
// only the marca differs. `minCreated` is a hard floor: rows Meta created before it are never
// synced, even without a status (FCELLS' sheet has ~375 older un-statused leads that must stay out).
const META_LEAD_SHEETS = {
    renew: {
        label: 'RENEW',
        spreadsheetId: '19rDmsUpfTlGCrEjvKI2Z5Ut0VSRU2-oy6uwcBHjqLLU',
        marcaId: renewLeadNetsuiteService.MARCA_IDS.RENEW,
        minCreated: null,
    },
    // "Fcells prospectos" sheet - connected 2026-10-22, synced from 2026-10-16 on per explicit instruction.
    fcells: {
        label: 'FCELLS',
        spreadsheetId: '1TMbdOz-SY9MZOo9nqw5zHRvKjoSvnPgWoaFRNHP66yo',
        marcaId: renewLeadNetsuiteService.MARCA_IDS.FCELLS,
        minCreated: new Date('2026-10-16T00:00:00-06:00'),
    },
};
const META_STATUS_HEADER = 'Sync Status';
const META_NETSUITE_ID_HEADER = 'NetSuite ID';

/** First matching header - Meta exports have used both the Spanish and English column names. */
const findHeader = (headers, ...names) => {
    for (const name of names) {
        const idx = headers.indexOf(name);
        if (idx !== -1) return idx;
    }
    return -1;
};

/**
 * One Meta lead sheet (a META_LEAD_SHEETS entry): every row of every tab without a status gets
 * created as a NetSuite lead with that sheet's marca, then marked PROCESSED with its NetSuite id.
 * A failed row is marked "ERROR: ..." and skipped by later runs unless `retryErrors` is set.
 * `limit` caps how many rows one run processes (for testing); `since` (a Date) skips rows whose
 * Meta created_time is earlier (on top of the sheet's own `minCreated`).
 */
const syncMetaLeadSheet = async (sheetConfig, { limit = Infinity, since = null, retryErrors = false } = {}) => {
    const { label, spreadsheetId, marcaId, minCreated } = sheetConfig;
    const floor = [since, minCreated].filter(Boolean).reduce((a, b) => (a > b ? a : b), null);

    const auth = new google.auth.GoogleAuth({
        credentials: CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const results = [];
    let totalProcessedCount = 0;

    for (const sheet of metadata.data.sheets || []) {
        const sheetName = sheet.properties.title;
        const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:ZZ` });
        const rows = response.data.values || [];
        if (rows.length < 2) continue;
        const headers = rows[0];

        // Status / NetSuite id columns are appended at the end the first time a tab is seen.
        const ensureColumn = async (name) => {
            let idx = headers.indexOf(name);
            if (idx === -1) {
                idx = headers.length;
                headers.push(name);
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!${getColumnLetter(idx)}1`,
                    valueInputOption: 'RAW',
                    resource: { values: [[name]] },
                });
            }
            return idx;
        };
        const statusIdx = await ensureColumn(META_STATUS_HEADER);
        const netsuiteIdIdx = await ensureColumn(META_NETSUITE_ID_HEADER);

        const col = {
            id: findHeader(headers, 'id'),
            createdTime: findHeader(headers, 'created_time'),
            campaignName: findHeader(headers, 'campaign_name'),
            platform: findHeader(headers, 'platform'),
            fullName: findHeader(headers, 'nombre_completo', 'full_name'),
            firstName: findHeader(headers, 'first_name'),
            lastName: findHeader(headers, 'last_name'),
            email: findHeader(headers, 'correo_electrónico', 'email'),
            phone: findHeader(headers, 'número_de_teléfono', 'phone_number'),
            interes: headers.findIndex((h) => String(h).startsWith('para_orientarle_mejor')),
            tratamientoPrevio: headers.findIndex((h) => String(h).includes('has_recibido_anteriormente')),
            disposicion: headers.findIndex((h) => String(h).includes('qué_tan_dispuesto')),
        };
        const cell = (row, idx) => (idx === -1 ? null : row[idx] || null);

        let sheetProcessedCount = 0;
        for (let i = 1; i < rows.length && totalProcessedCount < limit; i++) {
            const row = rows[i];
            const prevStatus = cell(row, statusIdx);
            // PROCESSED is always skipped; a previous ERROR only when retryErrors is off.
            if (prevStatus && !(retryErrors && String(prevStatus).startsWith('ERROR'))) continue;
            if (!cell(row, col.email) && !cell(row, col.phone)) continue;
            if (floor) {
                const created = new Date(cell(row, col.createdTime));
                if (Number.isNaN(created.getTime()) || created < floor) continue;
            }

            let status;
            let netsuiteId = '';
            try {
                const result = await renewLeadNetsuiteService.upsertRenewLeadInNetsuite({
                    marcaId,
                    metaLeadId: cell(row, col.id),
                    createdTime: cell(row, col.createdTime),
                    // FCELLS' form asks first/last name separately; Renew's asks one full name.
                    fullName: cell(row, col.fullName),
                    firstName: cell(row, col.firstName),
                    lastName: cell(row, col.lastName),
                    email: cell(row, col.email),
                    phone: cell(row, col.phone),
                    platform: cell(row, col.platform),
                    campaignName: cell(row, col.campaignName),
                    interes: cell(row, col.interes),
                    tratamientoPrevio: cell(row, col.tratamientoPrevio),
                    disposicion: cell(row, col.disposicion),
                });
                status = 'PROCESSED';
                netsuiteId = result.id || '';
                console.log(`[${label} SYNC] NetSuite lead ${result.created ? 'created' : 'updated'} (id ${result.id}) for row ${i + 1} in ${sheetName}`);
            } catch (error) {
                status = `ERROR: ${String(error.message).slice(0, 200)}`;
                console.error(`[${label} SYNC] Row ${i + 1} in ${sheetName} failed:`, error.message);
            }

            // Write status and NetSuite ID separately - they aren't adjacent on every sheet (FCELLS'
            // sheet already had its own Sync Status column before NetSuite ID was appended).
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                resource: {
                    valueInputOption: 'RAW',
                    data: [
                        { range: `${sheetName}!${getColumnLetter(statusIdx)}${i + 1}`, values: [[status]] },
                        { range: `${sheetName}!${getColumnLetter(netsuiteIdIdx)}${i + 1}`, values: [[netsuiteId]] },
                    ],
                },
            });

            sheetProcessedCount++;
            totalProcessedCount++;
        }
        results.push({ sheet: sheetName, processed: sheetProcessedCount });
    }

    return { totalProcessedCount, results };
};

const syncRenewLeads = (options) => syncMetaLeadSheet(META_LEAD_SHEETS.renew, options);
const syncFcellsLeads = (options) => syncMetaLeadSheet(META_LEAD_SHEETS.fcells, options);

/** Shared ?limit=N&since=YYYY-MM-DD&retryErrors=1 handler - `since` is read as midnight Mexico City time. */
const metaLeadSyncRoute = (sheetKey) => async (req, res) => {
    const sheetConfig = META_LEAD_SHEETS[sheetKey];
    try {
        const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : Infinity;
        const since = req.query.since ? new Date(`${req.query.since}T00:00:00-06:00`) : null;
        if (since && Number.isNaN(since.getTime())) {
            return res.status(400).json({ success: false, message: 'since must be YYYY-MM-DD.' });
        }
        const retryErrors = req.query.retryErrors === '1' || req.query.retryErrors === 'true';
        const { totalProcessedCount, results } = await syncMetaLeadSheet(sheetConfig, { limit, since, retryErrors });
        return res.status(200).json({ success: true, totalProcessed: totalProcessedCount, details: results });
    } catch (error) {
        console.error(`[${sheetConfig.label} SYNC] Error:`, error);
        return res.status(500).json({ success: false, message: `Internal server error processing ${sheetConfig.label} sheet.`, error: error.message });
    }
};

/** GET /api/google-sheets/sync-renew - Renew Therapies sheet -> NetSuite (marca RENEW), manually. */
router.get('/sync-renew', metaLeadSyncRoute('renew'));
/** GET /api/google-sheets/sync-fcells - "Fcells prospectos" sheet -> NetSuite (marca FCELLS), manually. */
router.get('/sync-fcells', metaLeadSyncRoute('fcells'));

/**
 * Endpoint to trigger the lead synchronization process manually
 * GET /api/google-sheets/sync
 */
router.get('/sync', async (req, res) => {
    try {
        const { totalProcessedCount, results } = await syncGoogleLeads();

        return res.status(200).json({ 
            success: true, 
            message: `Synchronization complete.`,
            totalProcessed: totalProcessedCount,
            details: results
        });
    } catch (error) {
        console.error('[SHEET SYNC] Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Internal server error processing sheets.',
            error: error.message 
        });
    }
});

module.exports = {
    router,
    syncRenewLeads,
    syncFcellsLeads,
    syncGoogleLeads
};