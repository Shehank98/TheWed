/**
 * settings — key/value store for editable app configuration (e.g. bank details).
 * Values are JSONB. Defaults still come from env; a row here overrides them.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('settings', (t) => {
    t.string('key').primary();
    t.jsonb('value').notNullable().defaultTo('{}');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('settings');
};
