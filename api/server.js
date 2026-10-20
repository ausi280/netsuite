console.log("Server process starting up...");
const config = require('./config');
const env = config.env || {};
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');


const allowedOrigins = [
    'https://testrenovaciones.cryo-cell.com.mx',
    'https://renovaciones.cryo-cell.com.mx',
    'https://reportes.cryoholdco.com',
    'https://sync.cryoholdco.com'
];

if (env.APP && env.APP.URL) {
    allowedOrigins.push(`${env.APP.URL}${env.APP.PORT ? `:${env.APP.PORT}` : ""}`);
}

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            // Reject without throwing - passing an Error here surfaces as an unhandled
            // exception (Express's default 500 page) for every request from a disallowed
            // origin, instead of a normal CORS-blocked response, which nukes the whole app
            // for any origin missing from allowedOrigins above (confirmed live: this exact
            // bug hid the real https://sync.cryoholdco.com domain being missing from the list).
            console.warn(`[CORS] Rejected origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
};
const app = express();

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
});

app.use(cors(corsOptions));
app.use(express.json());

try {
  const { buildReportingRouter } = require('./dist-ts/reporting/router');
  app.use('/api/reports', buildReportingRouter());
  console.log('Reporting API mounted at /api/reports');
} catch (error) {
  console.error('[Reporting API] failed to load, skipping:', error.message);
}

// Names only - env.SERVICES holds credentials (NetSuite consumer/token secrets, etc.) that must
// never reach the log stream.
console.log('Loaded services:', env.SERVICES ? Object.keys(env.SERVICES).join(', ') : 'None');

if (env.SERVICES) {
  for (const name in env.SERVICES) {
      
    const routesPath = path.join(__dirname, 'src', 'routes', `${name.toLowerCase()}Routes.js`);
    const webhooksPath = path.join(__dirname, 'src', 'webhooks', `${name.toLowerCase()}Webhooks.js`);

    try {
      if (fs.existsSync(routesPath)) {
        let route = require(routesPath);
        if (route && route.default) route = route.default;
        if (env.SERVICES[name]) app.use(env.SERVICES[name].SLUG || '/', route);
        const fullUrl = `${env.API.URL}${env.API.PORT ? `:${env.API.PORT}` : ""}${env.SERVICES[name].SLUG || '/'}`;
        console.log(`Loaded routes for ${name} at ${fullUrl}`);
      } else {
        console.log(`Expected route file not found at: ${routesPath}`);
      }

      if (fs.existsSync(webhooksPath)) {
        let webhook = require(webhooksPath);
        if (webhook && webhook.default) webhook = webhook.default;
        if (env.SERVICES[name]) app.use(env.SERVICES[name].SLUG || '/', webhook);
        console.log(`Loaded webhooks for ${name} at ${env.SERVICES[name].SLUG || '/'}`);
      }
    } catch (error) {
      console.error(`Failed to load service ${name}:`, error);
    }
    
  }
}


const frontendDist = path.join(__dirname, 'public');
if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api\/).*/, (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('API is up and running');
    });
}

app.use((req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
    // Generic body on purpose - no echoed URL (reflected into an HTML response) and no service list,
    // file paths or stack traces for scanners to harvest. Details stay in the server log above.
    res.status(404).json({ error: 'Not Found' });
});

const port = process.env.PORT || (env.API && env.API.PORT) || 3000;

const { scheduleNetsuiteSync } = require('./src/scheduler');
scheduleNetsuiteSync();

app.listen(port, () => {
    console.log(`Server Running on port ${port}`);
});