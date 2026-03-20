console.log("Server process starting up...");
const config = require('./config');
const env = config.env || {};
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');


const allowedOrigins = [
    'https://testrenovaciones.cryo-cell.com.mx',
    'https://renovaciones.cryo-cell.com.mx'
];

if (env.APP && env.APP.URL) {
    allowedOrigins.push(`${env.APP.URL}${env.APP.PORT ? `:${env.APP.PORT}` : ""}`);
}

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
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

console.log('Loaded Services Configuration:', JSON.stringify(env.SERVICES, null, 2));

const loadedRoutes = [];
if (env.SERVICES) {
  for (const name in env.SERVICES) {
      
    const routesPath = path.join(__dirname, 'src', 'routes', `${name.toLowerCase()}Routes.js`);
    const webhooksPath = path.join(__dirname, 'src', 'webhooks', `${name.toLowerCase()}Webhooks.js`);

    try {
      if (fs.existsSync(routesPath)) {
        let route = require(routesPath);
        if (route && route.default) route = route.default;
        if (env.SERVICES[name]) app.use(env.SERVICES[name].SLUG || '/', route);
        loadedRoutes.push(`${name} -> ${env.SERVICES[name].SLUG || '/'} (${routesPath})`);
        console.log(`Loaded routes for ${name} at ${env.SERVICES[name].SLUG || '/'}`);
      } else {
        loadedRoutes.push(`${name} -> FAILED (File not found: ${routesPath})`);
        console.log(`Expected route file not found at: ${routesPath}`);
      }

      if (fs.existsSync(webhooksPath)) {
        let webhook = require(webhooksPath);
        if (webhook && webhook.default) webhook = webhook.default;
        if (env.SERVICES[name]) app.use(env.SERVICES[name].SLUG || '/', webhook);
        console.log(`Loaded webhooks for ${name} at ${env.SERVICES[name].SLUG || '/'}`);
      }
    } catch (error) {
      loadedRoutes.push(`${name} -> ERROR: ${error.message}\nSTACK: ${error.stack}`);
      console.error(`Failed to load service ${name}:`, error);
    }
    
  }
}


app.get('/', (req, res) => {
    res.send('API is up and running');
});

app.use((req, res) => {
    console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
    const servicesList = env.SERVICES ? Object.keys(env.SERVICES).join(', ') : 'None';
    res.status(404).send(`Route not found: ${req.originalUrl}.\n\nConfigured Services: ${servicesList}\n\nDebug Info:\n${loadedRoutes.join('\n')}`);
});

const port = process.env.PORT || (env.API && env.API.PORT) || 3000;

const { scheduleNetsuiteSync } = require('./src/scheduler');
scheduleNetsuiteSync();

app.listen(port, () => {
    console.log(`Server Running on port ${port}`);
});