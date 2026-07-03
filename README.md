# TaxiBook — Setup Guide

Company fleet booking system built with Next.js 14 PWA + Supabase.

---

## Stack

- **Frontend** — Next.js 14 (App Router) + inline styles
- **Backend** — Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Notifications** — Web Push (VAPID)
- **Maps** — Leaflet (OpenStreetMap)
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
│   ├── login/               # Login page
│   ├── staff/               # Staff mobile layout + pages
│   │   ├── home/            # Home with calendar/map toggle
│   │   ├── book/            # 3-step booking form
│   │   ├── trips/           # Full trip history
│   │   └── success/         # Booking confirmation
│   ├── coordinator/         # Coordinator pages
│   │   ├── home/            # Dashboard with Gantt + approvals
│   │   ├── book/            # Create booking for others
│   │   ├── dispatch/        # Full dispatch board
│   │   ├── drivers/         # Driver + taxi management
│   │   ├── locations/       # Saved/registered locations
│   │   ├── report/          # Trip report & export
│   │   └── users/           # User management
│   ├── driver/              # Driver pages
│   │   └── home/            # Trip queue + availability toggle
│   ├── board/               # Web dispatch board (fullscreen)
│   └── api/                 # API routes
│       ├── bookings/        # CRUD + approve/reject/start/complete
│       ├── push/            # Push subscription
│       └── cron/            # Auto-complete job
├── components/
│   ├── GanttCalendar.tsx    # Day/Week/Month Gantt with calendar+map toggle
│   ├── PageLoader.tsx       # Vale logo animated loading screen
│   ├── OnboardingTour.tsx   # First-run guide (per role)
│   ├── BottomNav.tsx        # Mobile bottom navigation
│   ├── NotificationsPage.tsx
│   ├── ProfilePage.tsx
│   ├── StaffBookingSheet.tsx
│   └── map/                 # Leaflet map components
├── hooks/                   # Realtime + push + navigation hooks
├── lib/
│   ├── supabase/            # Client + server clients
│   ├── notifications.ts     # Push notification helpers
│   ├── language.ts          # EN/ID language toggle
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
| Booking submitted (DROP / instant) | — | ✓ immediate | — |
| Booking confirmed | ✓ | — | ✓ assigned |
| Booking rejected | ✓ | — | — |
| Driver declines | — | ✓ | — |
| Coordinator reassigns | ✓ | — | ✓ old + new |
| Trip started | ✓ | — | — |
| Trip completed | ✓ | — | — |
| Auto-completed | ✓ | — | ✓ |
| Overdue reminder (GPS-aware) | — | — | ✓ |

---

## Changelog

### v1.1.0 — Current

- **Calendar / map toggle** — icon buttons (calendar + map) inline in the card header row alongside Day/Week/Month pill; map tab hides the schedule pills
- **Vale logo page loader** — animated SVG stroke tracing the teal swoosh replaces all spinner loading states app-wide
- **Onboarding tour** — first-run modal guides each role through their key buttons and menu; staff tour covers New booking, schedule view, My bookings, and notifications
- **Saved locations** — coordinator can pin registered plant-site locations to avoid geocoding errors; staff can pick from saved pins when booking
- **Staff home booking cards** — restyled to match coordinator latest-trips card (left accent border, formatted date, pickup → destination, taxi color dot)
- **Coordinator home stat** — "Trips today" (WITA-aware count) replaces active booking count
- **Remove driver confirmation** — replaces browser confirm() with a styled modal showing driver name and taxi details
- **Language toggle** — EN / ID switch in profile, persisted in localStorage
- **Login spinner** — loading indicator on the sign-in button during authentication
- **Approve / reject spinners** — per-button loading state on coordinator booking cards
- **Map view** — live fleet map available on both coordinator and staff home screens
- **Profile version** — displays app version in the About section

### v1.0.0 — Initial release

- Login + role detection (staff / coordinator / driver)
- Staff booking flow (3 steps: pickup, destination, schedule)
- Coordinator approval + auto-assign taxi
- Driver accept / decline trips
- Trip completion (manual + auto-complete cron)
- Day / Week / Month Gantt calendar views
- Web dispatch board (fullscreen)
- Push notifications (all roles, VAPID)
- Realtime updates via Supabase channels
- Driver day assignment (full-day duty marking)
- Trip report page with filters

---

## Roadmap

- Export trip report to Excel / PDF
- GPS driver location tracking
- Route time estimation
- Booking history advanced filters
- Admin analytics dashboard
