/**
 * guest_wishes — the public guestbook / wishes wall. Wishes are visible by
 * default; the couple can hide (un-approve) any wish from their dashboard.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('guest_wishes', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('guest_name').notNullable();
    t.text('message').notNullable();
    t.boolean('approved').notNullable().defaultTo(true);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('guest_wishes');
};
