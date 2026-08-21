// Grants/updates one user's row in report_user_permissions. Run manually whenever someone
// needs their reporting-app access created or changed - there's no admin UI for this yet
// (deliberately, per the "I'll manage it directly for now" decision).
//
// Usage:
//   node scripts/grantReportAccess.js --oid=<entra-object-id> --email=user@cryoholdco.com --name="Full Name" --admin
//   node scripts/grantReportAccess.js --oid=<entra-object-id> --email=user@cryoholdco.com --entities=contracts,partidas --subsidiaries=20,24,25
//   node scripts/grantReportAccess.js --oid=<entra-object-id> --revoke   (deletes the row entirely - back to deny-by-default)
//
// --env=development targets the dev DB; defaults to production, since that's what the live
// deployed app actually reads from.

const knex = require('knex');
const config = require('../config').env;

function parseArgs() {
  const args = {};
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) continue;
    args[match[1]] = match[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const env = args.env || 'production';

  if (!args.oid) {
    console.error('Missing --oid=<entra-object-id> (find it in Entra ID portal -> Users -> the user -> Object ID).');
    process.exit(1);
  }

  const dbConfig = config.DB[env];
  if (!dbConfig) {
    console.error(`Unknown --env=${env} (expected "development" or "production").`);
    process.exit(1);
  }

  const db = knex({
    client: dbConfig.CLIENT,
    connection: {
      host: dbConfig.HOST,
      port: dbConfig.PORT,
      database: dbConfig.DATABASE,
      user: dbConfig.USER,
      password: dbConfig.PASSWORD,
    },
  });

  try {
    if (args.revoke) {
      const deleted = await db('report_user_permissions').where({ oid: args.oid }).delete();
      console.log(deleted > 0 ? `Revoked access for oid ${args.oid} (${env}).` : `No existing row for oid ${args.oid} (${env}) - nothing to revoke.`);
      return;
    }

    const isAdmin = Boolean(args.admin);
    const entities = args.entities ? args.entities.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const subsidiaries = args.subsidiaries ? args.subsidiaries.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const existing = await db('report_user_permissions').where({ oid: args.oid }).first();
    const row = {
      oid: args.oid,
      email: args.email ?? existing?.email ?? null,
      display_name: args.name ?? existing?.display_name ?? null,
      is_admin: isAdmin,
      allowed_entities: JSON.stringify(entities),
      allowed_subsidiaries: JSON.stringify(subsidiaries),
      updated_at: new Date(),
    };

    if (existing) {
      await db('report_user_permissions').where({ oid: args.oid }).update(row);
    } else {
      await db('report_user_permissions').insert(row);
    }

    console.log(`Saved permissions for oid ${args.oid} (${env}):`);
    console.log(`  admin: ${isAdmin}`);
    console.log(`  entities: ${isAdmin ? '(all - admin bypasses this list)' : entities.join(', ') || '(none)'}`);
    console.log(`  subsidiaries: ${isAdmin ? '(all - admin bypasses this list)' : subsidiaries.join(', ') || '(none)'}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exit(1);
});
