/**
 * rsvps — guest responses submitted from the public invitation page.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('rsvps', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('guest_name').notNullable();
    t.boolean('attending').notNullable().defaultTo(true);
    t.integer('guest_count').notNullable().defaultTo(1);
    t.text('message').nullable();
    t.timestamp('submitted_at').notNullable().defaultTo(knex.fn.now());

    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('rsvps');
};
