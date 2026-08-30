const db = require('../db');

/**
 * Set status=archived for any published invitation whose archive_at has passed.
 * Returns the number of invitations archived.
 */
async function runArchiveJob() {
  const archived = await db('invitations')
    .where('status', 'published')
    .whereNotNull('archive_at')
    .andWhere('archive_at', '<=', db.fn.now())
    .update({ status: 'archived', updated_at: db.fn.now() });

  if (archived > 0) {
    console.log(`[archive] Archived ${archived} invitation(s) past their archive_at.`);
  }
  return archived;
}

module.exports = { runArchiveJob };

// Allow running directly: `node src/jobs/archive.js` (used by Railway cron).
if (require.main === module) {
  runArchiveJob()
    .then((n) => {
      console.log(`[archive] Done. ${n} archived.`);
      return db.destroy();
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[archive] Failed:', err);
      process.exit(1);
    });
}
