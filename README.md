# NetSuite Sync Platform

A single Node.js/Express API (`api/`) that:

- Integrates with **NetSuite** via OAuth 1.0a (Token-Based Authentication) and SuiteQL.
- Talks to **SQL Server** via Knex.
- Serves a handful of unrelated integrations that happen to live in the same deployable: Google Sheets lead sync, Meta Lead Ads webhooks, and a payment gateway (`cryoholdco-payment`).
- Contains two NetSuite code paths side by side:
  - **Legacy** (`api/src/services/netsuiteService.js`) — plain JS, full-table syncs, no retries.
  - **New** (`api/src-ts/`) — TypeScript, modular, incremental (`lastmodifieddate` watermarks), retried/rate-limited, structured logging. This is the one to extend going forward.

Deployed to Azure App Service (Web App `sync`) from the `api/` subpath.

---

## 1. Repository structure

```
netsuite/
├── .gitignore              # ignores root-level node_modules (see §8 tech debt)
├── .deployment              # Azure Oryx build marker
├── .vscode/                 # Azure App Service deploy config
└── api/                     # the actual app — Azure deploy root
    ├── server.js             # Express entrypoint; dynamically mounts routes per SERVICES config
    ├── knexfile.js           # knex CLI config (migrations/seeds), reads config/env.json
    ├── tsconfig.json         # compiles src-ts/ -> dist-ts/
    ├── package.json
    ├── config/
    │   ├── index.js           # merges every *.json in this folder; exports { env, tenants }
    │   ├── env.json           # REAL secrets — gitignored, never commit
    │   ├── env.example.json   # template — keep this in sync when you add config keys
    │   └── tenants.json       # multi-brand config (cc/bc/bs/fc/rt), currently unused by NetSuite code
    ├── database/
    │   ├── index.js            # picks a driver by DB.<env>.CLIENT/DRIVER, exports the raw Knex singleton
    │   ├── drivers/             # sqlserver.js (mssql, pool 0-10), mysql.js, postgres.js
    │   └── migrations/          # plain JS knex migrations (see §5)
    ├── scripts/
    │   ├── setup.js             # npm install + knex migrate/seed
    │   └── manualSync.js        # legacy CLI: triggers netsuiteService.syncAndSaveData() once
    ├── src/                     # LEGACY, plain JS (CommonJS)
    │   ├── scheduler.js          # node-cron registration point (also boots the new TS jobs, see §7)
    │   ├── controllers/           # erpController, googleSheetsController, metaWebhooks, testController
    │   ├── routes/                 # thin route->controller wiring, one file per SERVICES entry
    │   └── services/netsuiteService.js  # OAuth 1.0a signing + SuiteQL + full-table sync (contracts, employees)
    └── src-ts/                  # NEW NetSuite sync engine, TypeScript, compiles to dist-ts/
        ├── config/                # typed config reader over config/env.json + SYNC defaults
        ├── logger/                # pino root logger + per-module/per-run child loggers
        ├── http/                  # OAuth signer, SuiteQL client, retry/backoff, rate limiter
        ├── suiteql/               # small fluent SuiteQL query builder
        ├── db/connection.ts        # re-exports the SAME Knex singleton as database/index.js
        ├── repositories/           # one per table, all using the same mssql-safe upsert helper
        ├── mappers/                # pure functions: raw SuiteQL row -> typed DB row
        ├── services/               # BaseSyncService (shared algorithm) + one subclass per entity
        ├── orchestrator/            # runs/limits concurrency across entities
        ├── scheduler/registerJobs.ts # per-entity cron registration, called from src/scheduler.js
        ├── cli/runSync.ts           # `npm run sync:ts -- <entity> [--dry-run]`
        └── bootstrap.ts             # composition root, wires everything together (memoized)
```

---

## 2. Prerequisites

- Node.js 18+ (developed against 22.x)
- Network access to the SQL Server instance(s) in `config/env.json` (`DB.development` / `DB.production`)
- A NetSuite account with TBA (Token-Based Authentication) set up: consumer key/secret, access token/secret, account/realm ID
- npm (no yarn/pnpm lockfiles in this repo — keep it that way)

## 3. First-time setup

```bash
cd api
cp config/env.example.json config/env.json   # then fill in real values — this file is gitignored
npm install
npm run build:ts                              # compiles api/src-ts -> api/dist-ts
npx knex migrate:latest --knexfile ./knexfile.js   # see §5 for a known gotcha on this dev DB
```

## 4. Running the app

| Command | Effect |
|---|---|
| `npm run dev` | `NODE_ENV=development`, nodemon, auto-restarts on JS changes |
| `npm start` | `NODE_ENV=production` — uses `DB.production`, be careful running this locally |
| `npm run dev:ts` | `tsc --watch` — run in a second terminal while editing `src-ts/`, so `dist-ts/` stays current |
| `npm run build` / `build:ts` | one-shot `tsc` compile; Azure's Oryx build runs this automatically on deploy (`SCM_DO_BUILD_DURING_DEPLOYMENT=true` in `.deployment`) |
| `npm run sync:ts -- <entity> [--dry-run]` | manually run one NetSuite sync entity (see §7) |

The server listens on `API.PORT` from `config/env.json` (currently `3000` in dev). On boot it logs which routes it mounted, based on the `SERVICES` block in `env.json`:

| Service key | Default slug | Controller |
|---|---|---|
| `TEST` | `/test` | `testController` (`GET /test/db` — DB connectivity check) |
| `GOOGLESHEETS` | `/google-sheets` | `googleSheetsController` (lead sync from Google Sheets to SQL Server) |
| `ERP` | `/erp` | `erpController` — `POST /erp/sync-netsuite`, `GET /erp/employees`, `POST /erp/suiteql` (legacy, ad-hoc SuiteQL passthrough) |
| `META` | `/webhooks/meta` | `metaWebhooks` (Meta Lead Ads webhook receiver) |

## 5. Database & migrations

Migrations live in `api/database/migrations/`, plain JS (the knex CLI doesn't compile TypeScript), run via:

```bash
npx knex migrate:latest --knexfile ./knexfile.js
```

**Known gotcha on the shared dev SQL Server**: the `knex_migrations` table on this database also has rows from a *different* application (payment-gateway tables: `core_countries`, `core_companies`, `app_pricing`, `app_payments`, …) whose migration files don't exist in this repo. `knex migrate:latest`/`migrate:list` refuse to run at all when this happens (`"The migration directory is corrupt, the following files are missing: ..."`), because knex validates the *entire* history before doing anything.

If you hit this:
1. It's not caused by anything in this repo's migrations — don't delete/recreate `netsuite_records` or the NetSuite tables to "fix" it.
2. Either reconcile `knex_migrations` (find the other repo's migration files and drop them alongside these, or manually clean up the stale rows if you're sure they're safe to remove), **or**
3. As a one-off unblock, apply the specific new migration(s) directly via the knex schema builder instead of the CLI — `require('./database')` to get the real Knex singleton, `require('./database/migrations/<file>').up(db)`, then manually insert a matching row into `knex_migrations` (`name`, `batch = current max + 1`, `migration_time`) so future CLI runs (once reconciled) don't try to redo it. This is what was done to get the tables in §6 onto the dev DB the first time.

## 6. The NetSuite sync engine (`api/src-ts/`)

### Entities covered

| Entity | NetSuite source | Table | Incremental? |
|---|---|---|---|
| `customer` | `customer` (SuiteQL) | `netsuite_customers` | yes, on `lastmodifieddate` |
| `contract` | `customrecord1184` | `netsuite_records` (**shared** with legacy `syncAndSaveData()`) | yes, on `lastmodified` |
| `invoice` | `transaction` where `type='CustInvc'` | `netsuite_invoices` | yes, on `lastmodifieddate` |
| `payment` | `transaction` where `type='CustPymt'` | `netsuite_payments` | yes, on `lastmodifieddate` |
| `employee` | `employee` (SuiteQL) | `netsuite_employees` | yes, on `lastmodifieddate` |
| `receivable` | open-balance `CustInvc` | `netsuite_receivables` | **no** — full refresh + stale-row pruning every run (see below) |

Every entity also writes its raw NetSuite JSON to `netsuite_raw_records` (keyed by `entity` + `netsuite_id`) **before** the typed upsert, so a mapper bug never loses data — you can always re-derive the typed row from the raw JSON.

### How a normal (incremental) sync run works

1. Read `netsuite_sync_state` for the entity's `last_watermark`.
2. Atomically claim the run (`UPDATE ... WHERE last_run_status <> 'running'`) — a second concurrent run for the same entity is skipped, not queued.
3. Subtract `OVERLAP_BUFFER_MINUTES` (default 15) from the watermark to absorb clock skew / NetSuite write-visibility lag.
4. Query SuiteQL with `WHERE lastmodifieddate >= ... ORDER BY lastmodifieddate ASC`, paginated.
5. Per page, inside one DB transaction: write raw JSON, then map + upsert the typed row.
6. If a page fails, pagination **stops** there (doesn't skip ahead) — the watermark only advances to the last page that fully committed.
7. On completion, `last_watermark` is set to the max timestamp actually seen (never "now").

`receivable` is the one exception: it always does a full open-balance query (no watermark), then deletes rows in `netsuite_receivables` that this run didn't touch — because a closed invoice needs to disappear, not just stop being updated.

### Resilience

- **Retries**: `p-retry`, exponential backoff + jitter, 5 attempts by default. 429 / `SSS_REQUEST_LIMIT_EXCEEDED` / 5xx / timeouts are retried (honoring `Retry-After` if NetSuite sends one); 401/bad-query errors fail fast.
- **Rate limiting**: one shared `bottleneck` limiter for all NetSuite HTTP calls, plus a separate limiter capping how many entities sync concurrently (`MAX_CONCURRENT_ENTITIES`, default 2).
- **Scheduler overlap protection**: belt-and-suspenders — an in-process `Set` in `registerJobs.ts` *and* the DB-level run lock in `SyncStateRepository`.

### Logging

`pino`, structured JSON to stdout (interleaves fine with the legacy code's plain `console.log`). Every sync run gets a `crypto.randomUUID()` `runId` — every log line for that run (HTTP, repository, mapper warnings) carries it, so you can grep one run end-to-end.

## 7. Running / scheduling the sync engine

**Manual, one-off runs** (recommended before ever enabling a cron):

```bash
npm run sync:ts -- employee
npm run sync:ts -- customer
npm run sync:ts -- contract --dry-run   # fetches + maps, does NOT write — use before trusting the shared netsuite_records table
npm run sync:ts -- invoice
npm run sync:ts -- payment
npm run sync:ts -- receivable
npm run sync:ts -- all                  # runs every entity once
```

**Scheduling**: each entity has its own cron entry under `SERVICES.ERP.SYNC.<ENTITY>` in `config/env.json`:

```json
"SYNC": {
  "CUSTOMER":   { "ENABLED": false, "CRON": "10 1 * * *" },
  "CONTRACT":   { "ENABLED": false, "CRON": "20 1 * * *" },
  "INVOICE":    { "ENABLED": false, "CRON": "30 1 * * *" },
  "PAYMENT":    { "ENABLED": false, "CRON": "40 1 * * *" },
  "EMPLOYEE":   { "ENABLED": false, "CRON": "50 1 * * *" },
  "RECEIVABLE": { "ENABLED": false, "CRON": "0 2 * * *" }
}
```

All `ENABLED: false` by default — flip one to `true` only after a manual CLI run of that entity looks correct. Crons run in `America/Mexico_City`, staggered so entities don't all hit NetSuite at once (on top of the rate limiter). Other tunables (`OVERLAP_BUFFER_MINUTES`, `MAX_CONCURRENT_ENTITIES`, `PAGE_SIZE`, `HTTP_TIMEOUT_MS`, `RETRY.*`, `RATE_LIMIT.*`, `LOG_LEVEL`) live in the same `SYNC` block; anything omitted falls back to the defaults in `src-ts/config/index.ts`.

`src/scheduler.js` currently only registers the TS sync jobs — the old Google Sheets and nightly-NetSuite cron jobs are commented out there. Re-enable them there directly if needed; they're unrelated to the TS module.

## 8. How to add a new extraction (entity)

Follow this order — each step is independently testable before moving to the next.

1. **Migration** — add `api/database/migrations/<timestamp>_create_netsuite_<entity>_table.js` (plain JS, mirror the existing ones: `netsuite_id` unique, indexed `lastmodifieddate`, `raw_data` json, `timestamps(true, true)`, plus whatever entity-specific columns you need). Apply it (see §5 for the shared-DB gotcha).
2. **Row type + Repository** — `api/src-ts/repositories/<entity>Repository.ts`: export a `<Entity>Row` interface matching the migration's columns, and a class with `upsertMany(trx, rows)` that calls the shared `upsertRows(db, trx, table, rows, 'netsuite_id')` helper from `repositories/upsertHelper.ts`. Don't hand-roll the mssql-vs-onConflict branch — that helper exists so you never have to.
3. **Mapper** — `api/src-ts/mappers/<entity>Mapper.ts`: a pure function `raw: Record<string, any> -> <Entity>Row`. Use the helpers in `mappers/utils.ts` (`toDate`, `toNumber`, `toBool`, `toStringOrNull`) for consistent null/type handling.
4. **Service** — `api/src-ts/services/<entity>SyncService.ts`, extending `BaseSyncService<RawNetSuiteRecord, <Entity>Row>`:
   - `entityName` — must match a value in `SyncEntityName` (`src-ts/config/types.ts`) — add it there first.
   - `buildQuery(watermark)` — use `SuiteQlQueryBuilder.from(table).select(...).whereWatermark('lastmodifieddate', watermark).orderBy('lastmodifieddate', 'ASC').build()`.
   - `mapRow(raw)` — call your mapper.
   - Only override `extractTimestamp(raw)` if the entity's last-modified field isn't literally called `lastmodifieddate` (custom records often use `lastmodified` instead — see `contractSyncService.ts` for the pattern).
   - If the entity is a **derived/point-in-time fact** rather than an appendable history (like `receivable`), don't extend `BaseSyncService` — implement `EntitySyncService` directly and model it on `receivableSyncService.ts` (full query every run + prune untouched rows after).
5. **Register it** in `api/src-ts/bootstrap.ts`: instantiate the repository and service, add it to the `services` array.
6. **Config** — add the entity to:
   - `ErpSyncConfig` in `src-ts/config/types.ts` (an `EntitySyncConfig` field)
   - `buildSyncConfig()` in `src-ts/config/index.ts` (default `CRON`, `ENABLED: false`)
   - `ENTITY_CONFIG_KEY` map in `src-ts/scheduler/registerJobs.ts`
   - `SERVICES.ERP.SYNC` in `config/env.example.json` (documentation) — and in your real `config/env.json` if you want to actually enable it
   - `VALID_ENTITIES` array in `src-ts/cli/runSync.ts`
7. **Build & test**: `npm run build:ts`, then `npm run sync:ts -- <entity> --dry-run` first if the table is new-but-risky (e.g. shared with legacy code) or just `npm run sync:ts -- <entity>` for a brand-new, low-risk table. Check `netsuite_sync_state`, `netsuite_raw_records`, and the typed table afterward.
8. Only then flip `ENABLED: true` for that entity in `config/env.json`.

## 9. Known issues / things to address next

These aren't blockers, but are worth knowing about:

- **Hardcoded DB credentials in source**: `api/src/controllers/googleSheetsController.js` and `api/src/controllers/metaWebhooks.js` each build their own separate, unpooled Knex connection with plaintext host/user/password literals in the file (different DB than the main app: `Cryo`/`CryoCell`). `googleSheetsController.js` also has a Google service-account private key inline. These should move into `config/env.json` and reuse the shared `api/database` connection — flagged, not yet fixed.
- **Shared dev database migration history**: this dev SQL Server's `knex_migrations` table is shared with another app's migrations that don't exist in this repo (see §5). Worth either splitting the databases or getting the other repo's migrations into this history so `knex migrate:latest` works normally again.
- **Secrets on disk in plaintext**: `config/env.json` is a plaintext, gitignored JSON file. Fine for now, but if this ever needs stronger guarantees, look at Azure App Service Application Settings or Key Vault references instead of a file on disk.
- **No automated tests**: neither the legacy JS nor the new TS module have unit/integration tests. The mappers (pure functions) and `SuiteQlQueryBuilder` would be cheap, high-value places to start.
- **No CI**: no GitHub Actions/Azure Pipelines config found — `npm run build:ts` (type-check) would be a reasonable minimum gate before Azure's own deploy-time build.
- **No sync failure alerting**: failures currently only surface as log lines and `netsuite_sync_state.consecutive_failures`. There's no alert (email/Slack/Teams) if an entity fails repeatedly — worth adding if this becomes business-critical.
- **`netsuite_query_results` vs `netsuite_employees`**: the legacy ad-hoc SuiteQL path (`queryAndSaveSuiteQL`, `syncEmployees`) still writes generic JSON blobs to `netsuite_query_results`; the new module writes typed rows to `netsuite_employees`. Both are intentionally kept — just don't be surprised to see employee data in two places.
- **Stray root-level `package.json`/`package-lock.json`**: left over from an earlier misfired `npx knex` command run from the repo root instead of `api/`. `node_modules` there is now gitignored, but the two JSON files are still sitting at the repo root and can be deleted safely.
- **No lint config for `src-ts/`**: TypeScript `strict` mode is on, but there's no ESLint/Prettier config enforcing style — fine for one contributor, worth adding before more people touch this.
