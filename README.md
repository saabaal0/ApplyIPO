# ApplyIPO – MeroShare IPO Automation 🤖

Automates **IPO/FPO application on MeroShare** using UI automation and sends **daily Telegram reports**.
Supports **multiple users** (e.g. self + spouse) and runs **locally or via GitHub Actions** on a schedule.

---

## Features

- Checks for new **IPO / FPO**
- Auto-applies for:
  - Ordinary Shares
  - IPO / FPO
  - For General Public
- Skips:
  - Debentures
  - Mutual Funds
  - Rights shares (unless holding exists)
- Detects:
  - Already applied
  - BLOCKED_APPROVE / APPROVED / TRANSACTION_SUCCESS
- Multi-user support
- Telegram daily summary
- Auto-retry on login / apply failures
- GitHub Actions scheduled execution

---

## Tech Stack

- Node.js
- Playwright (Chromium)
- GitHub Actions
- Telegram Bot API

---

## Project Structure

```
src/
├─ pages/
├─ services/
├─ api/
├─ telegram/
├─ utils/
├─ index.js
└─ multi-user.js
.github/workflows/
└─ meroshare-bot.yml
```

---

## Local Setup

### Install
```
npm install
npx playwright install chromium
```

### Environment file
Create `.env` (do NOT commit).

```
MEROSHARE_CLIENT_ID=
MEROSHARE_DP_NAME=
MEROSHARE_USERNAME=
MEROSHARE_PASSWORD=
MEROSHARE_BANK_NAME=
MEROSHARE_ACCOUNT_NO=
MEROSHARE_CRN=
MEROSHARE_TXN_PIN=

MEROSHARE_CLIENT_ID_WIFE=
MEROSHARE_DP_NAME_WIFE=
MEROSHARE_USERNAME_WIFE=
MEROSHARE_PASSWORD_WIFE=
MEROSHARE_BANK_NAME_WIFE=
MEROSHARE_ACCOUNT_NO_WIFE=
MEROSHARE_CRN_WIFE=
MEROSHARE_TXN_PIN_WIFE=

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

HEADLESS=false
```

---

## Run

Single user:
```
npm start
```

Multi-user:
```
node src/multi-user.js
```

---

## GitHub Actions

Runs automatically at **15:00 Nepal Time**
(Monday, Thursday, Saturday)

Workflow:
```
.github/workflows/meroshare-bot.yml
```

---

## Disclaimer

For personal automation and educational use only.
Use responsibly and comply with MeroShare/CDSC terms.

---

## Author

Sabal Gautam  
https://github.com/saabaal0
