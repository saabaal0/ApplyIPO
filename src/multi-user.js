// src/multi-user.js
require('dotenv').config();
const { spawn } = require('child_process');

function redactSecrets(s = '') {
  // Basic redactions: JWT-like tokens and anything that looks like very long tokens
  return String(s)
    // JWT-like: xxx.yyy.zzz
    .replace(/\b[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g, '[REDACTED_TOKEN]')
    // Very long strings (probable tokens)
    .replace(/\b[A-Za-z0-9\-_]{80,}\b/g, '[REDACTED_LONG]');
}

function pickBestErrorLine(lines) {
  // Prefer explicit JS errors / your logger ERROR lines
  const patterns = [
    /ERROR:/i,
    /TypeError:/,
    /ReferenceError:/,
    /SyntaxError:/,
    /Auth failed/i,
    /HTTP\s+\d{3}/i
  ];

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] || '';
    if (patterns.some((p) => p.test(line))) return line;
  }
  // Fallback: last non-empty line
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] || '').trim();
    if (line) return line;
  }
  return '';
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  // If Telegram isn't configured, just skip (but your main runs will still log)
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('Telegram sendMessage failed:', t);
    }
  } catch (e) {
    console.error('Telegram sendMessage error:', e.message);
  }
}

function loadProfilesFromEnv() {
  const profiles = [];

  for (let i = 1; i <= 5; i++) {
    const username = process.env[`MEROSHARE_USERNAME_${i}`];
    if (!username) continue;

    profiles.push({
      idx: i,
      label: process.env[`USER_LABEL_${i}`] || `User${i}`,

      clientId: process.env[`MEROSHARE_CLIENT_ID_${i}`],
      username: process.env[`MEROSHARE_USERNAME_${i}`],
      password: process.env[`MEROSHARE_PASSWORD_${i}`],
      dpName: process.env[`MEROSHARE_DP_NAME_${i}`],

      bankName: process.env[`MEROSHARE_BANK_NAME_${i}`] || '',
      accountNo: process.env[`MEROSHARE_ACCOUNT_NO_${i}`] || '',
      crn: process.env[`MEROSHARE_CRN_${i}`] || '',
      txnPin: process.env[`MEROSHARE_TXN_PIN_${i}`] || '',
    });
  }

  if (profiles.length === 0) {
    throw new Error(
      'No profiles found. Add MEROSHARE_USERNAME_1 / _2 (and related keys) in .env'
    );
  }

  // Basic validation (fail early)
  for (const p of profiles) {
    const missing = [];
    if (!p.clientId) missing.push(`MEROSHARE_CLIENT_ID_${p.idx}`);
    if (!p.username) missing.push(`MEROSHARE_USERNAME_${p.idx}`);
    if (!p.password) missing.push(`MEROSHARE_PASSWORD_${p.idx}`);
    if (!p.dpName) missing.push(`MEROSHARE_DP_NAME_${p.idx}`);
    if (missing.length) {
      throw new Error(`Profile ${p.idx} missing: ${missing.join(', ')}`);
    }
  }

  return profiles;
}

function buildChildEnv(baseEnv, profile) {
  // Map profile-specific keys -> the single-user keys your existing code already expects.
  return {
    ...baseEnv,

    // helpful label for report prefixing (we’ll patch ReportBuilder in Change 3)
    USER_LABEL: profile.label,

    MEROSHARE_CLIENT_ID: profile.clientId,
    MEROSHARE_USERNAME: profile.username,
    MEROSHARE_PASSWORD: profile.password,
    MEROSHARE_DP_NAME: profile.dpName,

    MEROSHARE_BANK_NAME: profile.bankName,
    MEROSHARE_ACCOUNT_NO: profile.accountNo,
    MEROSHARE_CRN: profile.crn,
    MEROSHARE_TXN_PIN: profile.txnPin,
  };
}

function runSingleProfile(profile) {
  return new Promise((resolve) => {
    const env = buildChildEnv(process.env, profile);

    console.log(`Running for: ${profile.label}`);

    const child = spawn(process.execPath, ['src/index.js'], {
      env,
      stdio: ['inherit', 'pipe', 'pipe'], // ✅ capture output
      shell: false,
    });

    const MAX_LINES = 80;
    const tail = [];

    const pushLines = (chunk) => {
      const text = chunk.toString('utf8');
      // Also keep showing logs in terminal
      // (we’ll write it manually since we used pipe)
      return text.split(/\r?\n/).forEach((line) => {
        if (line === '') return;
        tail.push(line);
        if (tail.length > MAX_LINES) tail.shift();
      });
    };

    child.stdout.on('data', (d) => {
      process.stdout.write(d);
      pushLines(d);
    });

    child.stderr.on('data', (d) => {
      process.stderr.write(d);
      pushLines(d);
    });

    child.on('close', (code) => {
      const best = pickBestErrorLine(tail);
      resolve({ code, lastErrorLine: redactSecrets(best), tail: tail.map(redactSecrets) });
    });

    child.on('error', (err) => {
      resolve({ code: 1, err, lastErrorLine: redactSecrets(err.message || String(err)), tail: [] });
    });
  });
}


(async () => {
  const profiles = loadProfilesFromEnv();

  for (const p of profiles) {
    const startedAt = new Date().toISOString();

    const { code, err, lastErrorLine } = await runSingleProfile(p);


    if (err) {
      await sendTelegram(`👤 ${p.label}\n❌ Bot crashed: ${err.message}\nTime: ${startedAt}`);
      continue;
    }

    if (code !== 0) {
      const when = new Date().toLocaleString('en-GB', { hour12: false });
      const reason = lastErrorLine ? lastErrorLine : 'No error line captured (check console logs)';
    
      await sendTelegram(
        [
          'MeroShare Bot Report',
          when,
          '',
          `👤 ${p.label}`,
          'Status',
          `• Run failed (exit code: ${code})`,
          `• Reason: ${reason}`,
        ].join('\n')
      );
    }
    
    
  }
})();
