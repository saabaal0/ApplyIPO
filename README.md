# MeroShare IPO Automation Bot

Fully automated tool to apply for IPOs/FPOs on [MeroShare](https://meroshare.cdsc.com.np) using Node.js and Playwright.

Supports multiple user profiles, intelligent filtering, Telegram notifications, and scheduled runs via GitHub Actions.

For personal use only. Use responsibly and comply with CDSC/MeroShare terms.

## Features

- Detects open eligible IPOs/FPOs (ordinary shares, general public quota)
- Skips debentures, right shares without holding, already applied issues
- Multi-profile support (you + family members)
- Full UI automation: login → My ASBA → apply → fill form → PIN → submit
- Smart verification: toast + active forms polling + UI Application Report fallback
- Beautiful Telegram reports with per-user sections and emojis
- Scheduled runs via GitHub Actions (Mon/Thu/Sat 15:00 NPT)
- Headless mode for production

## Requirements

- Node.js 18+ (20 recommended)
- Playwright Chromium
- Telegram bot token + chat ID
- Valid MeroShare credentials (per profile)

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/meroshare-IPO-automation.git
cd meroshare-IPO-automation
npm install
```
## Setup (.env)
```
# Telegram (required for reports)
TELEGRAM_BOT_TOKEN=XXXXXXX:xxxxxxxxxxx
TELEGRAM_CHAT_ID=-xxxxxxxxxxx

# ────────────── Profile 1  ──────────────
MEROSHARE_NAME_1=
MEROSHARE_CLIENT_ID_1=xxxxxxxx
MEROSHARE_DP_NAME_1=xxxxxxxx
MEROSHARE_USERNAME_1=xxxxxxxx
MEROSHARE_PASSWORD_1=xxxxxxxx
MEROSHARE_BANK_NAME_1=xxxxxxxx
MEROSHARE_ACCOUNT_NO_1=xxxxxxxx SAVING ACCOUNT
MEROSHARE_CRN_1=xxxxxxxx
MEROSHARE_TXN_PIN_1=xxxxxxxx

# ────────────── Profile 2  ──────────────
MEROSHARE_NAME_2=
MEROSHARE_CLIENT_ID_2=xxxxxxxx
MEROSHARE_DP_NAME_2=xxxxxxxx
MEROSHARE_USERNAME_2=xxxxxxxx
MEROSHARE_PASSWORD_2=xxxxxxxx
MEROSHARE_BANK_NAME_2=xxxxxxxx
MEROSHARE_ACCOUNT_NO_2=xxxxxxxx - SAVING ACCOUNT
MEROSHARE_CRN_2=xxxxxxxx
MEROSHARE_TXN_PIN_2=xxxx

# Runtime
HEADLESS=true           # true = silent (production), false = watch browser
RUN_MODE=multi          # multi = all profiles, single = only profile 1
```
## Security notes:

Never commit .env
Use exact strings from MeroShare dropdown for bank/account
CRN must be correct (wrong CRN = silent failure)
