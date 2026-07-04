const express = require('express');
const router = express.Router();
const knex = require('knex');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

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
    console.log(`[DB Lookup] Searching for "Motivo No Venta" for phone: ${phoneNumber}`);
    try {
        // 1. Find Id_Prospecto from ProspectoTelefono
        const prospectoTelefonoResult = await db.raw(
            `SELECT Id_Prospecto FROM ProspectoTelefono WHERE Telefono = ?`,
            [phoneNumber]
        );
        if (!prospectoTelefonoResult || prospectoTelefonoResult.length === 0) {
            console.log(`[DB Lookup] No Id_Prospecto found for phone: ${phoneNumber}`);
            return null;
        }
        const idProspecto = prospectoTelefonoResult[0].Id_Prospecto;
        console.log(`[DB Lookup] Found Id_Prospecto: ${idProspecto} for phone: ${phoneNumber}`);

        // 2. Find ID_NoVenta from Prospecto
        const prospectoResult = await db.raw(
            `SELECT ID_NoVenta FROM Prospecto WHERE Id_Prospecto = ?`,
            [idProspecto]
        );
        if (!prospectoResult || prospectoResult.length === 0 || prospectoResult[0].ID_NoVenta === null) {
            console.log(`[DB Lookup] No valid ID_NoVenta associated with Id_Prospecto: ${idProspecto}`);
            return null;
        }
        const idNoVenta = prospectoResult[0].ID_NoVenta;
        console.log(`[DB Lookup] Found ID_NoVenta: ${idNoVenta} for Id_Prospecto: ${idProspecto}`);

        // 3. Find Nombre from NoVenta
        const noVentaResult = await db.raw(
            `SELECT Nombre FROM NoVenta WHERE ID_NoVenta = ?`,
            [idNoVenta]
        );
        if (!noVentaResult || noVentaResult.length === 0) {
            console.log(`[DB Lookup] No record found in NoVenta table for ID: ${idNoVenta}`);
            return null;
        }
        console.log(`[DB Lookup] Successfully retrieved Motivo No Venta: ${noVentaResult[0].Nombre}`);
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
    console.log(`[DB Lookup] Checking "Contrato" status for phone: ${phoneNumber}`);
    try {
        // 1. Find Id_Prospecto from ProspectoTelefono
        const ptRes = await db.raw(
            `SELECT Id_Prospecto FROM ProspectoTelefono WHERE Telefono = ?`,
            [phoneNumber]
        );
        if (!ptRes || ptRes.length === 0) {
            console.log(`[DB Lookup] No Id_Prospecto found for phone: ${phoneNumber}`);
            return null;
        }
        const idProspecto = ptRes[0].Id_Prospecto;

        // 2. Find Activo and id_contrato from Prospecto
        const pRes = await db.raw(
            `SELECT Activo, id_contrato FROM Prospecto WHERE Id_Prospecto = ?`,
            [idProspecto]
        );
        
        if (!pRes || pRes.length === 0) {
            console.log(`[DB Lookup] No record found in Prospecto for ID: ${idProspecto}`);
            return "No";
        }

        const { Activo, id_contrato } = pRes[0];
        console.log(`[DB Lookup] Retrieved Activo: ${Activo}, id_contrato: ${id_contrato} for Id_Prospecto: ${idProspecto}`);

        // Validation: If Active, skip update
        if (Activo) {
            console.log(`[DB Lookup] Prospecto ${idProspecto} is Active (Activo=1). Skipping "Contrato" status update.`);
            return null;
        }

        const hasContrato = id_contrato != null ? "Si" : "No";
        console.log(`[DB Lookup] Successfully retrieved Contrato status: ${hasContrato}`);
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
                    const mensaje = row[headers.indexOf('fecha_probable_del_parto')] || ' ' + row[headers.indexOf('semanas_de_embarazo')] || ' ';
                    const ciudad = row[headers.indexOf('ciudad')] || null;

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
    syncGoogleLeads
};