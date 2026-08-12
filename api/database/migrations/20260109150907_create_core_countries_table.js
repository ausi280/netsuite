exports.up = async function (knex) {

  if (await knex.schema.hasTable('core_countries')) {
    return;
  }

  await knex.schema.createTable('core_countries', table => {

    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.boolean('active').notNullable().defaultTo(true);

    table.timestamps(true, true);
  });

  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // SQL Server: Execute all commands together in raw SQL
    await knex.raw(`
      SET IDENTITY_INSERT [core_countries] ON;
      INSERT INTO [core_countries] ([id], [name], [active], [created_at], [updated_at]) VALUES
        (1, 'México', 1, GETUTCDATE(), GETUTCDATE()),
        (2, 'Colombia', 1, GETUTCDATE(), GETUTCDATE()),
        (3, 'Argentina', 1, GETUTCDATE(), GETUTCDATE()),
        (4, 'Perú', 1, GETUTCDATE(), GETUTCDATE()),
        (5, 'Brasil', 1, GETUTCDATE(), GETUTCDATE());
      SET IDENTITY_INSERT [core_countries] OFF;
    `);
  } else {
    // MySQL, PostgreSQL, etc.
    await knex('core_countries').insert([
      { id: 1, name: 'México', active: true },
      { id: 2, name: 'Colombia', active: true },
      { id: 3, name: 'Argentina', active: true },
      { id: 4, name: 'Perú', active: true },
      { id: 5, name: 'Brasil', active: true }
    ]);
  }
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('core_countries');
};