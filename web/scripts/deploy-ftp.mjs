// Builds the frontend and uploads it to reportes.cryoholdco.com over FTP/FTPS.
//
// This app is deployed standalone (static files on a plain FTP host), separate from the
// Azure-hosted API - see VITE_API_BASE_URL in .env.production for how the two find each other.
//
// Credentials come from environment variables, not this file: either export
// FTP_HOST/FTP_USER/FTP_PASSWORD (and optionally FTP_PORT/FTP_SECURE/FTP_REMOTE_DIR) in your
// shell, or copy .env.ftp.example to .env.ftp (gitignored) and fill it in - this script loads
// that file if present, without overriding any of the same variables already set in the shell.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from 'basic-ftp';

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildDir = path.resolve(webRoot, '..', 'api', 'public');

function loadDotEnvFtp() {
  const envFtpPath = path.join(webRoot, '.env.ftp');
  if (!existsSync(envFtpPath)) return;

  for (const line of readFileSync(envFtpPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required ${name}. Set it in your shell or in web/.env.ftp (see .env.ftp.example).`);
    process.exit(1);
  }
  return value;
}

function runBuild() {
  console.log('Building frontend (npm run build)...');
  const result = spawnSync('npm', ['run', 'build'], { cwd: webRoot, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('Build failed, aborting deploy.');
    process.exit(result.status ?? 1);
  }
}

async function deploy() {
  loadDotEnvFtp();

  const host = requireEnv('FTP_HOST');
  const user = requireEnv('FTP_USER');
  const password = requireEnv('FTP_PASSWORD');
  const port = Number(process.env.FTP_PORT || 21);
  const secure = (process.env.FTP_SECURE ?? 'true').toLowerCase() !== 'false';
  const remoteDir = process.env.FTP_REMOTE_DIR || '/';
  // Shared hosting FTPS certs often don't match the customer's own domain name (they're
  // issued for the host's own server hostname) - the connection is still encrypted, this
  // only skips the hostname/CA check. Default stays strict; set FTP_TLS_INSECURE=true only
  // when you've confirmed (e.g. via the deploy script's own connection log) that the server
  // is the right one and the mismatch is just a cert/hostname naming issue.
  const tlsInsecure = (process.env.FTP_TLS_INSECURE ?? 'false').toLowerCase() === 'true';

  runBuild();

  if (!existsSync(path.join(buildDir, 'index.html'))) {
    console.error(`Build output not found at ${buildDir} (expected index.html) - check vite.config.ts's build.outDir.`);
    process.exit(1);
  }

  const client = new Client();
  client.ftp.verbose = false;
  client.trackProgress((info) => {
    if (info.type === 'upload') {
      console.log(`  uploading ${info.name} (${Math.round(info.bytes / 1024)} KB)`);
    }
  });

  try {
    console.log(`Connecting to ${host}:${port} (${secure ? 'FTPS' : 'plain FTP'}${tlsInsecure ? ', cert hostname check disabled' : ''})...`);
    await client.access({
      host,
      user,
      password,
      port,
      secure,
      secureOptions: tlsInsecure ? { rejectUnauthorized: false } : undefined,
    });

    console.log(`Clearing remote directory ${remoteDir}...`);
    await client.ensureDir(remoteDir);
    await client.clearWorkingDir();

    console.log(`Uploading ${buildDir} -> ${remoteDir}...`);
    await client.uploadFromDir(buildDir);

    console.log('Deploy complete: https://reportes.cryoholdco.com');
  } catch (error) {
    console.error('Deploy failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.trackProgress();
    client.close();
  }
}

deploy();
