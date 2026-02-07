const dotenv = require('dotenv');
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return String(v).trim();
}

function optional(name, def = '') {
  const v = process.env[name];
  return (v === undefined || v === null || String(v).trim() === '') ? def : String(v).trim();
}

function getConfig() {
  return {
    meroshare: {
      clientId: required('MEROSHARE_CLIENT_ID'),
      username: required('MEROSHARE_USERNAME'),
      password: required('MEROSHARE_PASSWORD'),
      dpName: required('MEROSHARE_DP_NAME'),

      bankName: optional('MEROSHARE_BANK_NAME'),
      accountNo: optional('MEROSHARE_ACCOUNT_NO'),
      crn: optional('MEROSHARE_CRN'),
      txnPin: optional('MEROSHARE_TXN_PIN'),

      baseUrl: 'https://meroshare.cdsc.com.np',
      loginUrl: 'https://meroshare.cdsc.com.np/#/login',
      apiBaseUrl: optional('API_BASE_URL', 'https://webbackend.cdsc.com.np/api/meroShare'),
    },

    telegram: {
      token: required('TELEGRAM_BOT_TOKEN'),
      chatId: required('TELEGRAM_CHAT_ID'),
    },

    runtime: {
      headless: optional('HEADLESS', 'true').toLowerCase() !== 'false',
      timeoutMin: Number(optional('RUN_TIMEOUT_MIN', '12')) || 12,
    },

    // optional: used for prefixing report if you added that logic
    userLabel: optional('USER_LABEL', ''),
  };
}

module.exports = { getConfig };
