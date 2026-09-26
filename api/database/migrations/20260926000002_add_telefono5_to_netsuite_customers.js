// "Teléfono 5" - missed in the previous migration since, unlike every other field in the
// numbered series, its internal id doesn't follow the custentity_cryo_telefonoN pattern at all -
// it's `custentity3`, an auto-numbered id (confirmed live via NetSuite's metadata-catalog schema
// title, not by naming convention).
exports.up = async function (knex) {
  await knex.schema.alterTable('netsuite_customers', (table) => {
    table.string('custentity3').nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('netsuite_customers', (table) => {
    table.dropColumn('custentity3');
  });
};
