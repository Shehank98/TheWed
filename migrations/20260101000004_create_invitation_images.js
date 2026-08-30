/**
 * invitation_images — images stored on Google Drive, referenced by an invitation.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('invitation_images', (t) => {
    t.increments('id').primary();
    t.integer('invitation_id').notNullable().references('id').inTable('invitations').onDelete('CASCADE');
    t.string('drive_file_id').notNullable();
    t.text('drive_url').notNullable();
    t.enu('image_type', ['hero', 'gallery', 'couple'], {
      useNative: true,
      enumName: 'invitation_image_type',
    }).notNullable();
    t.integer('position').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index('invitation_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('invitation_images');
  await knex.raw('DROP TYPE IF EXISTS invitation_image_type');
};
