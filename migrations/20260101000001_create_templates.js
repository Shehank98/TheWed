/**
 * templates — the 5 invitation designs couples can choose from.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('templates', (t) => {
    t.increments('id').primary();
    t.string('name').notNullable();
    t.string('folder_key').notNullable().unique(); // maps to /public/templates/<folder_key>
    t.string('animation_style').notNullable().defaultTo('');
    t.string('preview_url').notNullable().defaultTo('');
    t.decimal('price', 10, 2).notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('templates');
};
