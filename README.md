# MeroShare IPO Bot (API detect + UI apply)

This bot runs once daily and:

- Checks **Applicable Issue** via the MeroShare backend API.
- Applies **IPO/FPO** only when:
  - `shareGroupName` = **Ordinary Shares**
  - `shareTypeName` = **IPO** or **FPO**
  - `subGroup` = **For General Public**
  - (Debentures are skipped)
- Handles **Right Share** when:
  - `reservationTypeName` contains **RIGHT SHARE**
  - you have **Current Balance > 0** for the parent company scrip (via **My Share** UI)
- Sends a daily Telegram summary:
  - Applied
  - Already applied
  - Skipped by rule
  - Not eligible
  - Manual check needed

## Security note
Do **not** paste JWTs or credentials into code. Rotate/re-login if you ever shared a token.

## Env vars (local) / GitHub Secrets (Actions)

### Required
- `MEROSHARE_CLIENT_ID`
- `MEROSHARE_USERNAME`
- `MEROSHARE_PASSWORD`
- `MEROSHARE_DP_NAME` (DP label used on the login screen)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### Required for auto-apply (UI form)
- `MEROSHARE_BANK_NAME`
- `MEROSHARE_ACCOUNT_NO`
- `MEROSHARE_CRN`
- `MEROSHARE_TXN_PIN`

### Optional
- `HEADLESS` (`true` / `false`, default `true`)
- `RUN_TIMEOUT_MIN` (default `12`)

## Local run

```bash
npm i
npm run pw:install
cp .env.example .env
npm start
```

## GitHub Actions schedule

Configured for **14:00 Nepal time** (UTC+05:45) which is **08:15 UTC**:

```cron
15 8 * * *
```
