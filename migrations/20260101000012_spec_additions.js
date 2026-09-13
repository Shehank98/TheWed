/**
 * Spec pass (additive): dress code per event, children count on RSVPs, and an
 * optional "Our Story" milestone timeline.
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('invitation_events', (t) => {
    t.string('dress_code').nullable();
  });

  await knex.schema.alterTable('rsvps', (t) => {
    t.integer('children_count').notNullable().defaultTo(0);
  });

  await knex.schema.createTable('story_milestones', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('title').notNullable().defaultTo('');
    t.string('milestone_date').nullable(); // free text e.g. "Summer 2019"
    t.text('body').nullable();
    t.text('image_url').nullable();
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('story_milestones');
  await knex.schema.alterTable('rsvps', (t) => {
    t.dropColumn('children_count');
  });
  await knex.schema.alterTable('invitation_events', (t) => {
    t.dropColumn('dress_code');
  });
};
