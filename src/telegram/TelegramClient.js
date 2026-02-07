const TelegramBot = require('node-telegram-bot-api');

class TelegramClient {
  /**
   * @param {{token: string, chatId: string}} cfg
   */
  constructor(cfg) {
    this.chatId = cfg.chatId;
    this.bot = new TelegramBot(cfg.token, { polling: false });
  }

  /**
   * @param {string} message
   */
  async send(message) {
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
  }
}

module.exports = { TelegramClient };
