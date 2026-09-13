/**
 * Phase 2: guest-level assignment + private events.
 * - is_private flag on invitation_events (default false = public)
 * - guests: named guests with a phone, a unique token (?g=), and a plus-one limit
 * - guest_event_access: which private events each guest may see
 * Additive: nothing here changes existing rows' visibility (default public).
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('invitation_events', (t) => {
    t.boolean('is_private').notNullable().defaultTo(false);
  });

  await knex.schema.createTable('guests', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('guest_name').notNullable();
    t.string('phone').nullable();
    t.string('unique_token').notNullable().unique();
    t.integer('plus_one_limit').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index('invitation_id');
  });

  await knex.schema.createTable('guest_event_access', (t) => {
    t.increments('id').primary();
    t.integer('guest_id').notNullable().references('id').inTable('guests').onDelete('CASCADE');
    t.integer('event_id').notNullable().references('id').inTable('invitation_events').onDelete('CASCADE');
    t.unique(['guest_id', 'event_id']);
    t.index('guest_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('guest_event_access');
  await knex.schema.dropTableIfExists('guests');
  await knex.schema.alterTable('invitation_events', (t) => {
    t.dropColumn('is_private');
  });
};
