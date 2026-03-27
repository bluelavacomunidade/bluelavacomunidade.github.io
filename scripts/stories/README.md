# Shared Stories Setup (Supabase)

This enables global story publishing in `historias.html` so every visitor sees new stories instantly.

## 1) Create Supabase project
- Create a project at https://supabase.com/
- Open SQL Editor and run `scripts/stories/supabase-stories.sql`

## 2) Add public keys
Edit `stories-config.js` and set:
- `supabaseUrl`
- `supabaseAnonKey`

Example:

```js
window.BLUELAVA_STORIES_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_PUBLIC_KEY'
};
```

## 3) Deploy
Commit and push the updated files.

## Notes
- Without keys, the page falls back to local browser storage.
- With keys configured, stories are shared globally and update in near real-time.
