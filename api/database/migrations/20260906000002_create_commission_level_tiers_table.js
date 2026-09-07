// Each row is one threshold: "for sales >= min_amount (and below the next tier's min_amount for
// this same nivel), pay percentage%". No explicit max/upper-bound column - the next row's
// min_amount (or +infinity for the highest tier) already defines it, so there's no redundant
// pair of numbers that can drift out of sync/leave gaps as tiers are edited.
exports.up = function(knex) {
  return knex.schema.createTable('commission_level_tiers', function(table) {
    table.increments('id').primary();
    table.string('nivel').notNullable();
    table.decimal('min_amount', 18, 2).notNullable();
    table.decimal('percentage', 5, 2).notNullable();
    table.unique(['nivel', 'min_amount']);
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('commission_level_tiers');
};
