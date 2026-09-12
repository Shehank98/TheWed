/**
 * guest_list — named guests for per-guest personalized links (?to=Name).
 * The couple manages this list in their dashboard and exports it (with the
 * generated links) to Excel for sending out.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('guest_list', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('guest_name').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('guest_list');
};
