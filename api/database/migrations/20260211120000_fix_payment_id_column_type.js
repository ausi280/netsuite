exports.up = async function (knex) {
  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // 1. Check current type to ensure idempotency
    const columnCheck = await knex.raw(`
      SELECT TYPE_NAME(system_type_id) as type_name 
      FROM sys.columns 
      WHERE object_id = OBJECT_ID('app_payments') AND name = 'payment_id'
    `);

    if (columnCheck.length > 0 && columnCheck[0].type_name === 'nvarchar') {
      return;
    }

    // 2. Drop Default Constraints (they block type changes)
    const defaults = await knex.raw(`
      SELECT d.name
      FROM sys.default_constraints d
      JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
      WHERE d.parent_object_id = OBJECT_ID('app_payments') AND c.name = 'payment_id'
    `);
    for (const def of defaults) {
      await knex.raw(`ALTER TABLE [app_payments] DROP CONSTRAINT [${def.name}]`);
    }

    // 3. Identify and drop Indexes and Unique/PK Constraints
    // Unique constraints in MSSQL must be dropped via DROP CONSTRAINT, not DROP INDEX
    const indexes = await knex.raw(`
      SELECT i.name, i.is_unique_constraint, i.is_primary_key
      FROM sys.indexes i
      JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
      JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
      WHERE i.object_id = OBJECT_ID('app_payments') AND c.name = 'payment_id'
    `);

    for (const idx of indexes) {
      if (idx.is_unique_constraint || idx.is_primary_key) {
        await knex.raw(`ALTER TABLE [app_payments] DROP CONSTRAINT [${idx.name}]`);
      } else {
        await knex.raw(`DROP INDEX [${idx.name}] ON [app_payments]`);
      }
    }
  }

  await knex.schema.alterTable('app_payments', (table) => {
    table.string('payment_id', 255).notNullable().alter();
  });

  // 4. Re-create the unique index for the new string column
  if (dialect === 'mssql') {
    await knex.schema.alterTable('app_payments', (table) => {
      table.unique('payment_id', 'app_payments_payment_id_unique');
      table.index('payment_id', 'app_payments_payment_id_index');
    });
  }
};

exports.down = async function (knex) {
  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // Identify constraints before reverting to integer
    const constraints = await knex.raw(`
      SELECT name FROM sys.indexes 
      WHERE object_id = OBJECT_ID('app_payments') 
      AND name IN ('app_payments_payment_id_unique', 'app_payments_payment_id_index')
    `);
    for (const cons of constraints) {
       try { await knex.raw(`DROP INDEX [${cons.name}] ON [app_payments]`); } catch(e) {}
       try { await knex.raw(`ALTER TABLE [app_payments] DROP CONSTRAINT [${cons.name}]`); } catch(e) {}
    }
  }

  await knex.schema.alterTable('app_payments', (table) => {
    table.integer('payment_id').alter();
  });

  if (dialect === 'mssql') {
    await knex.schema.alterTable('app_payments', (table) => {
      table.unique('payment_id', 'app_payments_payment_id_unique');
    });
  }
};