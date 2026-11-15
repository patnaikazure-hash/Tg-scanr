/**
 * First-time login — reads credentials from env vars so it works on Railway.
 *
 * Set these in Railway Variables:
 *   TG_PHONE = +919861992132
 *   TG_CODE  = (paste OTP after Telegram sends it)
 *
 * Step 1: Deploy with TG_PHONE set → it sends OTP to your Telegram
 * Step 2: Add TG_CODE in Variables → redeploy → session saved
 * Step 3: Change start command to: node index.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const fs = require('fs');

const API_ID   = 18550618;
const API_HASH = 'e98b922550a95f725dfc30e13571589f';
const SESSION_FILE = './session.txt';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForCode() {
  // Wait up to 3 minutes for TG_CODE to be set in env
  console.log('Waiting for TG_CODE env var... (set it in Railway Variables now)');
  for (let i = 0; i < 180; i++) {
    if (process.env.TG_CODE && process.env.TG_CODE.length >= 4) {
      console.log('Got TG_CODE!');
      return process.env.TG_CODE.trim();
    }
    await sleep(1000);
  }
  throw new Error('TG_CODE not set within 3 minutes. Add it in Railway Variables and redeploy.');
}

(async () => {
  const phone = process.env.TG_PHONE;
  if (!phone) {
    console.error('ERROR: TG_PHONE env var not set!');
    console.error('Add TG_PHONE = +919861992132 in Railway Variables');
    process.exit(1);
  }

  console.log('\n🔑 Telegram Session Setup');
  console.log('Phone:', phone);
  console.log('─────────────────────────');

  if (fs.existsSync(SESSION_FILE)) {
    const existing = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    if (existing.length > 10) {
      console.log('✅ Session already exists! Switching to scanner...');
      // Start the main scanner
      require('./index.js');
      return;
    }
  }

  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  let codeSent = false;

  await client.start({
    phoneNumber: async () => {
      console.log('Using phone:', phone);
      return phone;
    },
    password: async () => {
      const pwd = process.env.TG_PASSWORD || '';
      console.log('2FA password:', pwd ? '(set)' : '(none)');
      return pwd;
    },
    phoneCode: async () => {
      if (!codeSent) {
        codeSent = true;
        console.log('\n📨 OTP sent to your Telegram!');
        console.log('→ Open Telegram on your phone');
        console.log('→ Copy the OTP code');
        console.log('→ Go to Railway → Variables → Add: TG_CODE = <your code>');
        console.log('→ Save Variables (no redeploy needed — this process is watching)');
      }
      return await waitForCode();
    },
    onError: (err) => console.error('TG Error:', err.message),
  });

  const session = client.session.save();
  fs.writeFileSync(SESSION_FILE, session);
  console.log('\n✅ Logged in! Session saved.');
  console.log('✅ Now change Start Command to: node index.js');
  console.log('✅ And redeploy — scanner will run 24/7\n');

  await client.disconnect();

  // Keep process alive so Railway doesn't restart it
  console.log('Waiting... change start command to node index.js and redeploy.');
  await sleep(600000); // wait 10 mins
  process.exit(0);
})();
