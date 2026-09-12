/**
 * Seed the 5 invitation templates. Idempotent: upserts on folder_key.
 */
const TEMPLATES = [
  {
    id: 1,
    name: 'Classic Elegant',
    folder_key: 'template-1',
    animation_style: 'fade-elegant',
    preview_url: '/templates/template-1/preview.svg',
    price: 4500.0,
  },
  {
    id: 2,
    name: 'Minimalist Modern',
    folder_key: 'template-2',
    animation_style: 'slide-minimal',
    preview_url: '/templates/template-2/preview.svg',
    price: 4500.0,
  },
  {
    id: 3,
    name: 'Floral Traditional',
    folder_key: 'template-3',
    animation_style: 'bloom-reveal',
    preview_url: '/templates/template-3/preview.svg',
    price: 5000.0,
  },
  {
    id: 4,
    name: 'Cinematic Dark',
    folder_key: 'template-4',
    animation_style: 'cinematic-parallax',
    preview_url: '/templates/template-4/preview.svg',
    price: 5500.0,
  },
  {
    id: 5,
    name: 'Sri Lankan Traditional',
    folder_key: 'template-5',
    animation_style: 'ornate-gold',
    preview_url: '/templates/template-5/preview.svg',
    price: 6000.0,
  },
];

exports.seed = async function seed(knex) {
  for (const tpl of TEMPLATES) {
    const existing = await knex('templates').where({ folder_key: tpl.folder_key }).first();
    if (existing) {
      // Insert-only: never overwrite an existing template. Admins can edit the
      // name/price in the panel, and those edits must survive re-deploys (which
      // run `knex seed:run`). Only backfill the structural preview/animation
      // fields if they are blank.
      const patch = {};
      if (!existing.preview_url) patch.preview_url = tpl.preview_url;
      if (!existing.animation_style) patch.animation_style = tpl.animation_style;
      if (Object.keys(patch).length) {
        await knex('templates').where({ folder_key: tpl.folder_key }).update(patch);
      }
    } else {
      await knex('templates').insert(tpl);
    }
  }

  // Keep the id sequence ahead of any explicit ids we inserted.
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('templates','id'), (SELECT MAX(id) FROM templates))"
  );
};
