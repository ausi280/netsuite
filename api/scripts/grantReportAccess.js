// Grants/updates one user's row in report_user_permissions. Run manually whenever someone
// needs their reporting-app access created or changed - there's no admin UI for this yet
// (deliberately, per the "I'll manage it directly for now" decision).
//
// Every user gets auto-provisioned (deny-by-default) the first time they successfully log in to
// the app, so once someone has logged in at least once you can just target them by --email=
// instead of hunting down their Entra Object ID. --oid= still works (required for someone who
// hasn't logged in yet, if you already have their Object ID from the Entra portal).
//
// Usage:
//   node scripts/grantReportAccess.js --list                                          (show every registered user + their current access)
//   node scripts/grantReportAccess.js --email=user@cryoholdco.com --admin
//   node scripts/grantReportAccess.js --email=user@cryoholdco.com --entities=contracts,partidas --subsidiaries=20,24,25
//   node scripts/grantReportAccess.js --oid=<entra-object-id> --email=user@cryoholdco.com --name="Full Name" --admin   (pre-provision before they've ever logged in)
//   node scripts/grantReportAccess.js --email=user@cryoholdco.com --revoke             (deletes the row entirely - back to deny-by-default)
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

function buildDb(env) {
  const dbConfig = config.DB[env];
  if (!dbConfig) {
    console.error(`Unknown --env=${env} (expected "development" or "production").`);
    process.exit(1);
  }
  return knex({
    client: dbConfig.CLIENT,
    connection: {
      host: dbConfig.HOST,
      port: dbConfig.PORT,
      database: dbConfig.DATABASE,
      user: dbConfig.USER,
      password: dbConfig.PASSWORD,
    },
  });
}

async function main() {
  const args = parseArgs();
  const env = args.env || 'production';
  const db = buildDb(env);

  try {
    if (args.list) {
      const rows = await db('report_user_permissions').select('*').orderBy('email');
      if (rows.length === 0) {
        console.log(`No users registered yet (${env}) - they get added automatically on first login.`);
        return;
      }
      for (const row of rows) {
        const entities = JSON.parse(row.allowed_entities || '[]');
        const subsidiaries = JSON.parse(row.allowed_subsidiaries || '[]');
        console.log(`${row.email || '(no email)'} — ${row.display_name || '(no name)'}`);
        console.log(`  oid: ${row.oid}`);
        console.log(`  admin: ${Boolean(row.is_admin)}`);
        console.log(`  entities: ${row.is_admin ? '(all - admin)' : entities.join(', ') || '(none)'}`);
        console.log(`  subsidiaries: ${row.is_admin ? '(all - admin)' : subsidiaries.join(', ') || '(none)'}`);
      }
      return;
    }

    let oid = args.oid;
    if (!oid && args.email) {
      const found = await db('report_user_permissions').where({ email: args.email }).first();
      if (!found) {
        console.error(
          `No user with email ${args.email} has logged in yet, so there's no row to target. ` +
            `Either wait for them to log in once, or pass --oid=<entra-object-id> to pre-provision them.`,
        );
        process.exit(1);
      }
      oid = found.oid;
    }

    if (!oid) {
      console.error('Provide --email=<email> (for someone who has already logged in) or --oid=<entra-object-id>.');
      process.exit(1);
    }

    if (args.revoke) {
      const deleted = await db('report_user_permissions').where({ oid }).delete();
      console.log(deleted > 0 ? `Revoked access for oid ${oid} (${env}).` : `No existing row for oid ${oid} (${env}) - nothing to revoke.`);
      return;
    }

    const isAdmin = Boolean(args.admin);
    const entities = args.entities ? args.entities.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const subsidiaries = args.subsidiaries ? args.subsidiaries.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const existing = await db('report_user_permissions').where({ oid }).first();
    const row = {
      oid,
      email: args.email ?? existing?.email ?? null,
      display_name: args.name ?? existing?.display_name ?? null,
      is_admin: isAdmin,
      allowed_entities: JSON.stringify(entities),
      allowed_subsidiaries: JSON.stringify(subsidiaries),
      updated_at: new Date(),
    };

    if (existing) {
      await db('report_user_permissions').where({ oid }).update(row);
    } else {
      await db('report_user_permissions').insert(row);
    }

    console.log(`Saved permissions for ${row.email || oid} (${env}):`);
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
