const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');

const config = require('./config');
const db = require('./db');
const { runArchiveJob } = require('./jobs/archive');

const ordersRouter = require('./routes/orders');
const adminRouter = require('./routes/admin');
const invitationsRouter = require('./routes/invitations');
const rsvpRouter = require('./routes/rsvp');
const templatesRouter = require('./routes/templates');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- API --------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await db.raw('select 1');
    res.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, db: false, error: err.message });
  }
});

app.use('/api/templates', templatesRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/rsvp', rsvpRouter);

// --- HTML pages (dynamic routes render static shells; JS reads the URL) -----
// Registered before static so they serve directly (no directory redirects).
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/order/:reference_code', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'order.html')));
app.get('/edit/:token', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'editor.html')));
app.get('/i/:slug', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'invitation.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin', 'index.html')));

// --- Static assets (template folders, css, js, images) ----------------------
// Serves /templates/template-1/..., /css/..., /js/..., etc.
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// --- 404 for API, friendly page otherwise -----------------------------------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC_DIR, 'unavailable.html')));

// --- Error handler ----------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (err.message && /Only image uploads/.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image is too large (max 10 MB)' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

// --- Daily auto-archive job (Phase 7) ---------------------------------------
// Runs at 02:00 server time every day. Railway users may prefer an external
// cron hitting `npm run archive` instead; both are safe (idempotent).
if (process.env.DISABLE_CRON !== 'true') {
  cron.schedule('0 2 * * *', () => {
    runArchiveJob().catch((e) => console.error('[archive] job error:', e.message));
  });
}

const server = app.listen(config.port, () => {
  console.log(`TheWed server listening on ${config.baseUrl} (port ${config.port})`);
});

function shutdown() {
  console.log('Shutting down...');
  server.close(() => {
    db.destroy().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
