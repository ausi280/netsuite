exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // Robust existence check for SQL Server to prevent "object already exists" errors
    const check = await knex.raw("SELECT OBJECT_ID('core_companies') AS id");
    if (check && check[0] && check[0].id) return;
  } else {
    if (await knex.schema.hasTable('core_companies')) return;
  }

  await knex.schema.createTable('core_companies', table => {

    table.increments('id').primary();
    table.string('name', 100).notNullable();
    table.boolean('active').notNullable().defaultTo(true);

    table.timestamps(true, true);
  });

  if (dialect === 'mssql') {
    // SQL Server: Execute all commands together in raw SQL
    await knex.raw(`
      SET IDENTITY_INSERT [core_companies] ON;
      INSERT INTO [core_companies] ([id], [name], [active], [created_at], [updated_at]) VALUES
        (1, 'CryoCell de México', 1, GETUTCDATE(), GETUTCDATE()),
        (2, 'Células de Cordón Umbilical', 1, GETUTCDATE(), GETUTCDATE()),
        (3, 'Operadora BSCU', 1, GETUTCDATE(), GETUTCDATE()),
        (4, 'STEM', 1, GETUTCDATE(), GETUTCDATE()),
        (5, 'Redcord', 1, GETUTCDATE(), GETUTCDATE()),
        (6, 'Criocord', 1, GETUTCDATE(), GETUTCDATE()),
        (7, 'Biocells', 1, GETUTCDATE(), GETUTCDATE()),
        (8, 'Lazo de Vida', 1, GETUTCDATE(), GETUTCDATE()),
        (9, 'Cordvida', 1, GETUTCDATE(), GETUTCDATE()),
        (10, 'Cordcell', 1, GETUTCDATE(), GETUTCDATE()),
        (11, 'Fcells', 1, GETUTCDATE(), GETUTCDATE()),
        (12, 'Renew Therapies', 1, GETUTCDATE(), GETUTCDATE());
      SET IDENTITY_INSERT [core_companies] OFF;
    `);
  } else {
    // MySQL, PostgreSQL, etc.
    await knex('core_companies').insert([
      { id: 1, name: 'CryoCell de México', active: true },
      { id: 2, name: 'Células de Cordón Umbilical', active: true },
      { id: 3, name: 'Operadora BSCU', active: true },
      { id: 4, name: 'STEM', active: true },
      { id: 5, name: 'Redcord', active: true },
      { id: 6, name: 'Criocord', active: true },
      { id: 7, name: 'Biocells', active: true },
      { id: 8, name: 'Lazo de Vida', active: true },
      { id: 9, name: 'Cordvida', active: true },
      { id: 10, name: 'Cordcell', active: true },
      { id: 11, name: 'Fcells', active: true },
      { id: 12, name: 'Renew Therapies', active: true }
    ]);
  }

};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('core_companies');
};