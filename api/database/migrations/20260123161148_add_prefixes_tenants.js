exports.up = async function (knex) {

  const dialect = knex.client.config.client;

  // Logic for core_companies
  let companiesPrefixExists = false;
  if (dialect === 'mssql') {
    const check = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('core_companies') AND name = 'prefix'");
    companiesPrefixExists = check && check.length > 0;
  } else {
    companiesPrefixExists = await knex.schema.hasColumn('core_companies', 'prefix');
  }

  if (!companiesPrefixExists) {
    await knex.schema.alterTable('core_companies', (table) => {
      table.string('prefix', 2).nullable();
    });

    const companies = [
      { id: 1, prefix: 'CC' }, { id: 2, prefix: 'BC' }, { id: 3, prefix: 'BS' },
      { id: 4, prefix: 'ST' }, { id: 5, prefix: 'RC' }, { id: 6, prefix: 'CD' },
      { id: 7, prefix: 'BI' }, { id: 8, prefix: 'LV' }, { id: 9, prefix: 'CV' },
      { id: 10, prefix: 'CO' }, { id: 11, prefix: 'FC' }, { id: 12, prefix: 'RT' }
    ];

    for (const company of companies)
      await knex('core_companies').where({ id: company.id }).update({ prefix: company.prefix });

    if (dialect === 'mssql') {
      await knex.raw(`ALTER TABLE [core_companies] ALTER COLUMN [prefix] nvarchar(2) NOT NULL`);
    } else {
      await knex.schema.alterTable('core_companies', (table) => {
        table.string('prefix', 2).notNullable().alter();
      });
    }
  }

  // Logic for core_countries
  let countriesPrefixExists = false;
  if (dialect === 'mssql') {
    const check = await knex.raw("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('core_countries') AND name = 'prefix'");
    countriesPrefixExists = check && check.length > 0;
  } else {
    countriesPrefixExists = await knex.schema.hasColumn('core_countries', 'prefix');
  }

  if (!countriesPrefixExists) {
    await knex.schema.alterTable('core_countries', (table) => {
      table.string('prefix', 2).nullable();
    });

    const countries = [
      { id: 1, prefix: 'MX' },
      { id: 2, prefix: 'CO' },
      { id: 3, prefix: 'AR' },
      { id: 4, prefix: 'PE' },
      { id: 5, prefix: 'BR' }
    ];

    for (const country of countries)
      await knex('core_countries').where({ id: country.id }).update({ prefix: country.prefix });

    if (dialect === 'mssql') {
      await knex.raw(`ALTER TABLE [core_countries] ALTER COLUMN [prefix] nvarchar(2) NOT NULL`);
    } else {
      await knex.schema.alterTable('core_countries', (table) => {
        table.string('prefix', 2).notNullable().alter();
      });
    }
  }
};

exports.down = async function(knex) {
  await knex.schema.alterTable('core_companies', (table) => {
    table.dropColumn('prefix');
  });

  await knex.schema.alterTable('core_countries', (table) => {
    table.dropColumn('prefix');
  });
};
