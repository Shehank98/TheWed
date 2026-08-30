/**
 * invitations — 1:1 with a paid order. Built by the couple via a magic link,
 * published to a public slug, and auto-archived after wedding_date + 90 days.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('invitations', (t) => {
    t.increments('id').primary();
    t.integer('order_id').notNullable().unique().references('id').inTable('orders').onDelete('CASCADE');
    t.integer('template_id').notNullable().references('id').inTable('templates').onDelete('RESTRICT');
    t.string('slug').unique().nullable(); // null until published

    t.string('groom_name').nullable();
    t.string('bride_name').nullable();
    t.date('wedding_date').nullable();
    t.string('wedding_time').nullable();
    t.string('venue_name').nullable();
    t.text('venue_address').nullable();
    t.text('story_text').nullable();
    t.jsonb('custom_fields').notNullable().defaultTo('{}');

    t.enu('status', ['draft', 'published', 'archived'], {
      useNative: true,
      enumName: 'invitation_status',
    })
      .notNullable()
      .defaultTo('draft');

    t.string('magic_link_token').notNullable().unique();
    t.timestamp('archive_at').nullable();

    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.index('status');
    t.index('archive_at');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('invitations');
  await knex.raw('DROP TYPE IF EXISTS invitation_status');
};
