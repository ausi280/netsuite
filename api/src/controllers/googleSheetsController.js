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
            const emailIdx = headers.indexOf('correo_electrónico');
            let statusIdx = headers.indexOf('Sync Status');

            if (emailIdx === -1) {
                console.warn(`[SHEET SYNC] Skipping sheet "${sheetName}": Missing "Email" column.`);
                continue;
            }

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

            let sheetProcessedCount = 0;

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                const email = row[emailIdx];
                const status = row[statusIdx];

                if (status === 'PROCESSED' || !email) continue;
           
                const nombre = row[headers.indexOf('nombre_completo')] || null;
                const apellido = row[headers.indexOf('Last Name')] || null;
                const telefonoRaw = row[headers.indexOf('número_de_teléfono')] || null;
                const telefono = telefonoRaw ? telefonoRaw.replace(/^p:\s*/i, '') : null;
                const platform = row[headers.indexOf('platform')] || 'Google Sheets';
                const mensaje = row[headers.indexOf('fecha_probable_del_parto')] || ' ' + row[headers.indexOf('semanas_de_embarazo')] || ' ';

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
                        @Estado = 'NA';
                `, [nombre, apellido, telefono, email, platform, mensaje]);

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