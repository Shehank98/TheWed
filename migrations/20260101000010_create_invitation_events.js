/**
 * invitation_events — a repeatable list of events per invitation (Poruwa,
 * Church, Reception, Homecoming, Custom). Additive: existing invitations with
 * no rows here fall back to the single wedding_date / venue fields.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('invitation_events', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('event_name').notNullable().defaultTo('');
    t.string('event_type').notNullable().defaultTo('Custom'); // Poruwa|Church|Reception|Homecoming|Custom
    t.date('event_date').nullable();
    t.string('event_time').nullable();
    t.string('venue_name').nullable();
    t.text('venue_address').nullable();
    t.text('map_link').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('invitation_events');
};
