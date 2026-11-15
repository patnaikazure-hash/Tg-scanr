/**
 * Run this ONCE to log in and save session string.
 * After this, index.js uses the saved session — no OTP needed again.
 *
 * Usage:
 *   node setup.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');
const fs = require('fs');

const API_ID   = 18550618;
const API_HASH = 'e98b922550a95f725dfc30e13571589f';
const SESSION_FILE = './session.txt';

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans.trim()); }));
}

(async () => {
  console.log('\n🔑 Telegram Session Setup');
  console.log('─────────────────────────');
  console.log('This runs ONCE. Session is saved so you never need to login again.\n');

  const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => {
      const p = await ask('📱 Phone number (e.g. +919861992132): ');
      return p;
    },
    password: async () => {
      const p = await ask('🔒 2FA password (press Enter if none): ');
      return p;
    },
    phoneCode: async () => {
      const c = await ask('📨 OTP code from Telegram: ');
      return c;
    },
    onError: (err) => console.error('Error:', err.message),
  });

  const session = client.session.save();
  fs.writeFileSync(SESSION_FILE, session);
  console.log('\n✅ Logged in successfully!');
  console.log('✅ Session saved to session.txt');
  console.log('\nNow run: node index.js');
  console.log('Or on Railway: it auto-starts with the saved session.\n');

  await client.disconnect();
  process.exit(0);
})();
