// Only expose what works in a browser WebView
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions/StringSession');
const { Api } = require('telegram/tl');
const { computeCheck } = require('telegram/Password');

module.exports = {
  TelegramClient,
  StringSession,
  Api,
  computeCheck,
};
