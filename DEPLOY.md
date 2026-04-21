# TaxiBook — Deploy Checklist

## 1. Supabase SQL (run in order)
Run these in Supabase SQL Editor before deploying:

```sql
-- a. Taxis RLS — allow driver to update own availability
CREATE POLICY "Driver can update own taxi availability"
ON public.taxis FOR UPDATE
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

-- b. Notifications RLS — allow authenticated users to insert
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- c. Realtime for taxis
ALTER PUBLICATION supabase_realtime ADD TABLE public.taxis;

-- d. Notification types constraint
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'booking_confirmed','booking_rejected','booking_reassigned',
  'driver_assigned','driver_declined','trip_completed',
  'needs_approval','driver_reassigned','auto_completed',
  'reminder_15min','reminder_start','reminder_overdue'
));
```

## 2. Generate secrets

```bash
# CRON_SECRET
openssl rand -hex 32

# VAPID keys (for push notifications)
npx web-push generate-vapid-keys
```

## 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy from project root
cd taxibook-app
vercel --prod
```

## 4. Vercel Environment Variables
Add these in Vercel Dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| NEXT_PUBLIC_SUPABASE_URL | https://xxx.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | eyJ... |
| SUPABASE_SERVICE_ROLE_KEY | eyJ... |
| CRON_SECRET | (generated above) |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | (from web-push) |
| VAPID_PRIVATE_KEY | (from web-push) |
| VAPID_SUBJECT | mailto:admin@yourcompany.com |

## 5. Supabase Auth Settings
In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: https://your-app.vercel.app
- Redirect URLs: https://your-app.vercel.app/**

## 6. Vercel Cron
Already configured in vercel.json — runs every 5 min automatically on Vercel Pro.

## 7. Test after deploy
1. Open https://your-app.vercel.app
2. Login as staff, coordinator, driver
3. Submit a booking
4. Check driver gets popup
5. Accept → check staff notification
6. Open /board on a big screen
