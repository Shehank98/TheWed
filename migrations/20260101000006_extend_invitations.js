/**
 * Feature extension: schedule/map/music/language on invitations, and a meal
 * preference on rsvps. (guest_wishes and guest_list tables come in later
 * migrations.)
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('invitations', (t) => {
    t.jsonb('schedule').notNullable().defaultTo('[]'); // [{name, time, venue}]
    t.text('map_link').nullable(); // Google Maps link or embed code
    t.text('music_url').nullable(); // optional background MP3 URL
    t.string('language_default').notNullable().defaultTo('en'); // en | si | ta
    t.boolean('meal_pref_enabled').notNullable().defaultTo(false);
  });

  await knex.schema.alterTable('rsvps', (t) => {
    t.string('meal_preference').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('invitations', (t) => {
    t.dropColumn('schedule');
    t.dropColumn('map_link');
    t.dropColumn('music_url');
    t.dropColumn('language_default');
    t.dropColumn('meal_pref_enabled');
  });
  await knex.schema.alterTable('rsvps', (t) => {
    t.dropColumn('meal_preference');
  });
};
