# TheWed — Digital Wedding Invitation SaaS

Couples pick one of 5 invitation templates, pay by bank transfer, an admin marks
the payment as done, and the couple receives an email with a magic link to build
their invitation (names, date, venue, photos, story). On publish, a unique slug
is generated and the invitation goes live with animations and an RSVP form.
Invitations auto-archive 90 days after the wedding date.

Plain HTML/CSS/JS frontend (no framework) · Node/Express backend · PostgreSQL
(Knex) · Google Drive for image storage · email via a Google Apps Script web app.

---

## Tech stack

| Concern         | Choice                                             |
| --------------- | -------------------------------------------------- |
| Server          | Node.js + Express                                  |
| Database        | PostgreSQL via Knex (migrations + seeds)           |
| Image storage   | Google Drive API (service account)                 |
| Email           | Google Apps Script web app (Gmail/MailApp)         |
| RSVP export     | ExcelJS (`.xlsx`)                                  |
| Scheduling      | node-cron (in-process) or Railway cron             |
| Frontend        | Static HTML/CSS/vanilla JS; GSAP via CDN (one template) |

---

## Quick start (local)

```bash
cp .env.example .env          # then fill in values (at minimum DATABASE_URL)
npm install
npm run setup                 # runs migrations + seeds the 5 templates
npm run dev                   # starts the server on http://localhost:3000
```

Then open:

- `http://localhost:3000/` — storefront (pick a template, place an order)
- `http://localhost:3000/admin` — admin panel (sign in with ADMIN_USERNAME / ADMIN_PASSWORD)

### Try the flow without email/Drive configured

Everything works without Google integrations set up:

1. Place an order on the storefront → you land on the bank-instructions page.
2. In **/admin → Orders**, click **Mark paid**. Since email isn't configured, the
   admin screen shows the **magic link** inline (it's also logged to the server console).
3. Open that magic link (`/edit/:token`) to build the invitation. (Image upload is
   disabled until Google Drive is configured; every other field works.)
4. Click **Publish** → you get a public URL `/i/:slug`.

---

## Environment variables

See [`.env.example`](./.env.example) for the full list. Highlights:

- **Database:** `DATABASE_URL` (+ `DATABASE_SSL=true` on Railway).
- **Admin:** `ADMIN_USERNAME`, `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH` bcrypt),
  `ADMIN_SESSION_SECRET`.
- **Email (Google Apps Script):** `GOOGLE_APPSCRIPT_EMAIL_URL`, `EMAIL_SHARED_SECRET`.
  Deploy [`docs/appscript-email.gs`](./docs/appscript-email.gs) as a Web App and paste
  its `/exec` URL. The backend POSTs `{ secret, to, subject, html, fromName }`.
- **Google Drive:** `GOOGLE_SERVICE_ACCOUNT_JSON` (or `GOOGLE_APPLICATION_CREDENTIALS`
  path) + `GOOGLE_DRIVE_PARENT_FOLDER_ID` (a folder shared with the service account).
- **Bank details:** `BANK_*` — shown to customers on the order page.

---

## Database schema

`templates`, `orders`, `invitations`, `invitation_images`, `rsvps` — created by the
migrations in [`migrations/`](./migrations). The `templates` table is seeded with the
5 designs. Enums are native Postgres types: `order_status(pending_payment, paid)`,
`invitation_status(draft, published, archived)`, `invitation_image_type(hero, gallery, couple)`.

Relationships: `orders.template_id → templates`, `invitations.order_id → orders`
(1:1, cascade), `invitations.template_id → templates`, `invitation_images.invitation_id
→ invitations` (cascade), `rsvps.invitation_id → invitations` (cascade).

---

## API contract

### Public
- `GET  /api/templates` — list templates.
- `POST /api/orders` — `{ template_id, customer_name, email, phone }` → reference code + bank details.
- `GET  /api/orders/:reference_code` — order status (+ bank details while pending).
- `GET  /api/invitations/public/:slug` — render data for a published invitation
  (404 draft/missing, 410 archived).
- `POST /api/rsvp/:slug` — `{ guest_name, attending, guest_count, message }`.

### Editor (keyed by magic_link_token)
- `GET    /api/invitations/token/:token` — invitation + order data.
- `PUT    /api/invitations/token/:token` — update draft fields.
- `POST   /api/invitations/token/:token/images` — multipart `image` + `image_type`.
- `DELETE /api/invitations/token/:token/images/:image_id`.
- `POST   /api/invitations/token/:token/publish` — validate, slugify, publish, set archive_at.
- `GET    /api/invitations/token/:token/rsvps` — list + summary.
- `GET    /api/invitations/token/:token/rsvps/export` — `.xlsx` download.

### Admin (session cookie or HTTP Basic)
- `POST /api/admin/login` / `POST /api/admin/logout` / `GET /api/admin/me`
- `GET  /api/admin/orders?status=` — list orders.
- `POST /api/admin/orders/:id/mark-paid` — mark paid, create invitation, email magic link.
- `GET  /api/admin/invitations?status=` — list invitations.
- `POST /api/admin/invitations/:id/resend-magic-link`
- `PATCH /api/admin/invitations/:id/archive-at` — `{ archive_at }`.
- `POST /api/admin/invitations/:id/status` — `{ status }`.

### Pages
`/` storefront · `/order/:reference_code` · `/edit/:token` editor · `/i/:slug` public
invitation · `/admin` admin panel · `/unavailable` friendly fallback.

---

## Templates

Five self-contained designs under [`public/templates/`](./public/templates):

1. **template-1** — Classic Elegant (fade reveals, serif, gold)
2. **template-2** — Minimalist Modern (split layout, mono labels, slide reveals)
3. **template-3** — Floral Traditional (blush/rose, falling petals, bloom reveals)
4. **template-4** — Cinematic Dark (GSAP parallax + scroll reveals, gold on black)
5. **template-5** — Sri Lankan Traditional (ornate gold frame, lotus, maroon, Poruwa/Nekath)

Each folder has `index.html`, `style.css`, `script.js`, and `preview.svg`. They share
one tiny runtime, [`public/templates/_shared/thewed.js`](./public/templates/_shared/thewed.js),
which handles the data contract (via `postMessage`), the countdown, scroll reveals, and
RSVP submission. Both the **live editor preview** and the **public page** render a template
inside an `<iframe>` and post it the same data object — so what the couple sees while
editing is exactly what guests see.

**Data contract posted to a template:**

```js
{
  template: { folderKey, name, animationStyle },
  invitation: { groomName, brideName, weddingDate, weddingTime, venueName,
                venueAddress, storyText, customFields, slug, status },
  images: { hero: {url}|null, couple: [{url}], gallery: [{url}] },
  mode: 'live' | 'preview'
}
```

Custom fields understood by templates: `hashtag`, `rsvp_phone`, `reception`, `nekath`
(template-5). Extra keys are stored in `custom_fields` JSONB and ignored by templates
that don't use them.

---

## Auto-archive (Phase 7)

An invitation's `archive_at` is set to `wedding_date + 90 days` on publish. A daily job
flips any past-due published invitation to `archived`:

- **In-process:** node-cron runs it at 02:00 daily (disable with `DISABLE_CRON=true`).
- **Railway cron / external:** schedule `npm run archive` (runs the job once and exits).

---

## Deployment (Railway)

1. Provision a PostgreSQL plugin; Railway sets `DATABASE_URL`. Set `DATABASE_SSL=true`.
2. Add the other env vars from `.env.example`.
3. `railway.json` runs `migrate → seed → start` on deploy.
4. (Optional) Add a Railway cron service running `npm run archive` daily, and set
   `DISABLE_CRON=true` on the web service to avoid running it twice.

---

## Feature set (v2 extension)

All 5 templates and the editor now include:

| # | Feature | Notes |
|---|---------|-------|
| 1 | Countdown | Live d/h/m/s; swaps to “Today’s the day!” on the wedding date. |
| 2 | Event schedule | Editable name/time/venue items, rendered as a timeline. |
| 3 | Venue map | Google Maps link or embed; “Get Directions” button. |
| 4 | Photo gallery | Shared lightbox (prev/next, keyboard, lazy-loaded). |
| 5 | Background music | Optional MP3; muted autoplay + floating mute/unmute button. |
| 6 | Guestbook | Public wishes wall + dashboard moderation (approve/hide/delete). |
| 7 | RSVP tracking | Guests enter their name and whether they can come; every reply shows in the couple dashboard and exports to Excel. |
| 8 | Personalized links | `?to=Name` → “Dear Name”; guest list mgmt + Excel export. |
| 12 | Intro animation | Each template opens with its own reveal (envelope, split curtain, floral bloom, cinematic letterbox, ornate doors) — tap to open. |
| 13 | Sample images | Storefront previews render with built-in sample photos so couples see a filled-in design. |
| 9 | Share + QR | WhatsApp share button; server-side QR (qrcode) of the invite URL. |
| 10 | Multi-language | Sinhala / Tamil / English label switcher; couple’s own text unchanged. |

### Schema additions

- `invitations`: `schedule` (JSONB `[{name,time,venue}]`), `map_link`, `music_url`,
  `language_default` (`en`/`si`/`ta`), `meal_pref_enabled` (bool).
- `rsvps`: `meal_preference`.
- New tables: `guest_wishes` (id, invitation_id, guest_name, message, approved, created_at)
  and `guest_list` (id, invitation_id, guest_name, created_at).

### New API endpoints

- `GET  /api/invitations/public/:slug/stats` — live confirmed-guest count.
- `GET  /api/invitations/public/:slug/wishes` — approved wishes.
- `POST /api/wishes/:slug` — submit a guestbook wish.
- `GET/PATCH/DELETE /api/invitations/token/:token/wishes[/:id]` — moderation.
- `GET/POST/DELETE /api/invitations/token/:token/guests[/:id]` + `/guests/export` — guest list.
- `GET  /api/invitations/token/:token/qr[?download=1]` — PNG QR of the public URL.

### Templates runtime

Shared behavior lives in [`public/templates/_shared/thewed.js`](./public/templates/_shared/thewed.js).
Templates supply styled containers with `data-*` hooks (`data-schedule`, `data-directions`,
`data-guestbook-section`, `data-confirmed-count`, `data-meal-field`, `data-guest-greeting`,
`data-share-whatsapp`, `data-today`) and `data-i18n` labels; the runtime fills them and
handles i18n, the lightbox, music, guestbook, RSVP counter, personalization and share.

### Editable bank details & template prices (admin panel)

Bank transfer details and template prices/names are editable at runtime from the
admin panel — no redeploy needed:

- **Bank Settings tab** → edit bank name, account name/number, branch, SWIFT.
  Saved to a `settings` table (key `bank`) and shown to customers on the order
  page. The `BANK_*` env vars are only the initial defaults.
- **Templates & Prices tab** → edit each template's display name and price.
  New orders use the updated price immediately. The templates seed is
  insert-only, so these edits survive re-deploys (`knex seed:run`).

Admin endpoints: `GET/PUT /api/admin/settings/bank`, `GET /api/admin/templates`,
`PUT /api/admin/templates/:id` (`name`, `price`, `animation_style`, `preview_url`).

### The public/edit link and your domain

Links are built from `APP_BASE_URL`. Locally that’s `http://localhost:3000`; in production
set it to your domain (e.g. `https://www.zenvite.online`) and every link updates —
magic links become `https://www.zenvite.online/edit/<token>` and public invites become
`https://www.zenvite.online/i/<groom>-<bride>` (the slug is generated from the couple’s
names, lowercased).
