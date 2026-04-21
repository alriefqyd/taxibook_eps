# TaxiBook — Setup Guide

Company fleet booking system built with Next.js 14 PWA + Supabase.

---

## Stack

- **Frontend** — Next.js 14 (App Router) + Tailwind CSS
- **Backend** — Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Notifications** — Web Push (VAPID)
- **Deployment** — Vercel Pro

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yourcompany/taxibook.git
cd taxibook
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose region: **Singapore (ap-southeast-1)**
3. Copy your project URL and keys
4. Go to SQL Editor → paste contents of `supabase/schema.sql` → Run

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Generate VAPID keys for push notifications

```bash
npx web-push generate-vapid-keys
```

Add to `.env.local`:
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:admin@yourcompany.com
```

### 5. Add CRON_SECRET

```bash
# Generate a random secret
openssl rand -hex 32
```

Add to `.env.local`:
```
CRON_SECRET=your-random-secret
```

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Create first users

In Supabase dashboard → Authentication → Users → Add user

Then in SQL Editor, link to users table:
```sql
insert into public.users (id, name, email, role) values
  ('uuid-from-auth', 'Admin Koordinator', 'coord@company.com', 'coordinator'),
  ('uuid-from-auth', 'Pak Hendra',        'hendra@company.com', 'driver'),
  ('uuid-from-auth', 'Budi Santoso',      'budi@company.com', 'staff');
```

## Add taxis

```sql
insert into public.taxis (name, plate, driver_id, color) values
  ('Taxi 01', 'DD 0001 TB', 'driver-1-uuid', '#2563EB'),
  ('Taxi 02', 'DD 0002 TB', 'driver-2-uuid', '#059669'),
  ('Taxi 03', 'DD 0003 TB', 'driver-3-uuid', '#DB2777'),
  ('Taxi 04', 'DD 0004 TB', 'driver-4-uuid', '#D97706'),
  ('Taxi 05', 'DD 0005 TB', 'driver-5-uuid', '#7C3AED');
```

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add all environment variables in Vercel dashboard → Settings → Environment Variables.

The cron job runs every 5 minutes automatically (auto-complete overdue trips).

---

## Folder structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/           # Login page
│   ├── staff/               # Staff mobile layout + pages
│   ├── coordinator/         # Coordinator pages
│   ├── driver/              # Driver pages
│   ├── board/               # Web dispatch board
│   └── api/                 # API routes
│       ├── bookings/        # CRUD + approve/reject/reassign
│       ├── push/            # Push subscription
│       └── cron/            # Auto-complete job
├── components/              # Shared UI components
├── hooks/                   # Realtime + push hooks
├── lib/
│   ├── supabase/            # Client + server clients
│   ├── notifications.ts     # All push notification helpers
│   └── auto-assign.ts       # Auto-assign driver logic
├── types/                   # TypeScript types + constants
└── middleware.ts             # Auth + role-based routing
```

---

## PWA install instructions (share with users)

**Android (Chrome):**
1. Open taxibook.yourcompany.com in Chrome
2. Tap the 3-dot menu → "Add to Home screen"
3. Tap Add → Done

**iPhone (Safari):**
1. Open taxibook.yourcompany.com in Safari
2. Tap the Share button (box with arrow)
3. Tap "Add to Home Screen"
4. Tap Add → Done

---

## Notification triggers

| Event | Staff | Coordinator | Driver |
|---|---|---|---|
| Booking submitted (>60min WAIT) | — | ✓ | — |
| Booking confirmed | ✓ | — | — |
| Booking rejected | ✓ | — | — |
| New trip assigned | — | — | ✓ |
| Driver declines | — | ✓ | — |
| Coordinator reassigns | ✓ | — | ✓ old + new |
| Trip completed | ✓ | — | — |
| Auto-completed | ✓ | — | ✓ |
| Booking submitted (DROP) | — | ✓ | — |

---

## V1 scope

- ✅ Login + role detection
- ✅ Staff booking flow (3 steps)
- ✅ Coordinator approval + auto-assign
- ✅ Driver accept/decline
- ✅ Trip completion (manual + auto)
- ✅ Day/Week/Month calendar views
- ✅ Web dispatch board
- ✅ Push notifications (all roles)
- ✅ Realtime updates

## V2 planned

- Reports & analytics
- GPS driver location
- Route time optimization
- Export to Excel
- Booking history filters
