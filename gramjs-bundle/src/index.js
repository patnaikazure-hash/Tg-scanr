// Only expose what works in a browser WebView
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions/StringSession');
const { Api } = require('telegram/tl');

module.exports = {
  TelegramClient,
  StringSession,
  Api,
};
