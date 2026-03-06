# Blue Lava Weekly Newsletter

This sends an email briefing with:
- AI news (last 7 days)
- Economy news with The Economist mentions (last 7 days)
- Marketing news (last 7 days)
- Optional X highlights (best effort from public sources)

## Run once (send today)
```bash
npm install
npm run newsletter:send
```

## Install weekly schedule (Monday 08:00 Portugal)
```bash
npm run newsletter:install-schedule
```

## Important
Before first send, set `SMTP_PASS` in `.env.newsletter`.
For Gmail, use an App Password.
