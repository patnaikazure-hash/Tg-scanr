# TG Firebase Scanner — Server

24/7 Node.js server that:
- Logs into your real Telegram account
- Scans ALL chat history for Firebase links on startup
- Listens to ALL new messages in real time
- Auto-checks every Firebase link (live/dead, total devices, active devices)
- Rejects duplicates automatically
- Web dashboard to view results at any time

---

## First-time setup (local)

```bash
npm install
node setup.js        # Login once — saves session.txt
node index.js        # Start the scanner
```

Dashboard: http://localhost:3000

---

## Deploy to Railway (free 24/7 hosting)

1. Go to https://railway.app → New Project → Deploy from GitHub repo
2. Select the `server/` folder (or point to this repo)
3. Add environment variable: `TG_SESSION` = contents of `session.txt`
4. Railway auto-detects Node.js and starts with `node index.js`
5. Your dashboard URL will be shown in Railway dashboard

### Environment variables on Railway:
| Variable | Value |
|---|---|
| `TG_SESSION` | paste your session.txt content here |
| `TG_PHONE` | +919861992132 (only needed for first login) |
| `PORT` | set by Railway automatically |

---

## How it works

1. **Login**: Uses your api_id + api_hash + phone OTP (once only)
2. **History scan**: Fetches last 1000 messages from every chat/group/channel
3. **Real-time**: `NewMessage` event fires for every new message across all chats
4. **Firebase check**: For each URL found:
   - GET `/.json?shallow=true` → checks if alive
   - Scans device paths (devices, users, panel, tokens, etc.)
   - Counts active devices by boolean fields + timestamp recency
5. **Dedup**: `results` object keyed by URL — duplicates are skipped automatically
6. **Dashboard**: Express server on port 3000, auto-refreshes every 10s
