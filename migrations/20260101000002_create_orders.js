/**
 * orders — a purchase of a template. Payment is by manual bank transfer,
 * marked paid by an admin.
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('orders', (t) => {
    t.increments('id').primary();
    t.integer('template_id').notNullable().references('id').inTable('templates').onDelete('RESTRICT');
    t.string('customer_name').notNullable();
    t.string('email').notNullable();
    t.string('phone').notNullable().defaultTo('');
    t.string('reference_code').notNullable().unique();
    t.decimal('amount', 10, 2).notNullable().defaultTo(0);
    t.enu('status', ['pending_payment', 'paid'], {
      useNative: true,
      enumName: 'order_status',
    })
      .notNullable()
      .defaultTo('pending_payment');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('paid_at').nullable();

    t.index('status');
    t.index('email');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('orders');
  await knex.raw('DROP TYPE IF EXISTS order_status');
};
