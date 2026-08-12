exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  if (dialect === 'mssql') {
    // Robust existence check for SQL Server to prevent "object already exists" errors
    const check = await knex.raw("SELECT OBJECT_ID('app_pricing') AS id");
    if (check && check[0] && check[0].id) return;
  } else {
    if (await knex.schema.hasTable('app_pricing')) return;
  }

  await knex.schema.createTable('app_pricing', table => {

    table.increments('id').primary();
    table.integer('country_id').unsigned().notNullable().references('id').inTable('core_countries');
    table.integer('company_id').unsigned().notNullable().references('id').inTable('core_companies');
    table.integer('years').notNullable();
    table.decimal('price', 10, 2).notNullable();
    table.decimal('discount', 5, 2).nullable();
    table.boolean('active').notNullable().defaultTo(true);

    table.timestamps(true, true);
    table.unique(['country_id','company_id','years'], 'pricing');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('app_pricing');
};
