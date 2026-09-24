// Real NetSuite field for "Pagado Hasta" (confirmed by the user) - lives on netsuite_services,
// NOT netsuite_partidas (where the original derived calculation looked), which is why the earlier
// search for it came up empty. It's a bare paid-through YEAR (e.g. "2027"), not a full date -
// confirmed live: ~98% of the 296k service rows have it populated. The sync already pulls it via
// SELECT * - this just gives it a real column and backfills existing rows from raw_data, same as
// the precioanualtotal migration on this same table.
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.string('custrecord_cryo_pagadohasta').nullable();
  });

  await knex.raw(`
    UPDATE netsuite_services
    SET custrecord_cryo_pagadohasta = JSON_VALUE(raw_data, '$.custrecord_cryo_pagadohasta')
    WHERE raw_data IS NOT NULL
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_services', (table) => {
    table.dropColumn('custrecord_cryo_pagadohasta');
  });
};
