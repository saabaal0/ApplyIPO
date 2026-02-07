const { chromium } = require('playwright');
const { retry } = require('../utils/retry');
const log = require('../utils/logger');
const { LoginPage } = require('../pages/LoginPage');
const { NavBar } = require('../pages/NavBar');
const { MyAsbaPage } = require('../pages/MyAsbaPage');
const { MySharePage } = require('../pages/MySharePage');
const { IpoApplyPage } = require('../pages/IpoApplyPage');
const { ApplicationReportPage } = require('../pages/ApplicationReportPage');
const { humanStatus } = require('../utils/applicationStatus');

class AutomationRunner {
  /**
   * @param {{baseUrl: string, loginUrl: string, dpName: string, username: string, password: string, bankName: string, accountNo: string, crn: string, txnPin: string}} cfg
   * @param {{headless: boolean, timeoutMin: number}} runtime
   */
  constructor(cfg, runtime) {
    this.cfg = cfg;
    this.runtime = runtime;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async start() {
    this.browser = await chromium.launch({ headless: this.runtime.headless });
    this.context = await this.browser.newContext({ viewport: { width: 1400, height: 900 } });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(45000);
  }

  async stop() {
    try { await this.page?.close(); } catch {}
    try { await this.context?.close(); } catch {}
    try { await this.browser?.close(); } catch {}
  }

  async login() {
    const mkLoginPage = () => new LoginPage(this.page, { loginUrl: this.cfg.loginUrl });
  
    const ensurePageAlive = async () => {
      const pageClosed = !this.page || this.page.isClosed?.();
      const ctxClosed = !this.context || this.context.isClosed?.();
      // browser doesn't have isClosed() reliably across versions, so we guard by try/catch
      if (pageClosed || ctxClosed) {
        log.warn('Page/context was closed. Recreating browser context...');
        await this.stop().catch(() => {});
        await this.start();
      }
    };
  
    await retry(async () => {
      await ensurePageAlive();
      const lp = mkLoginPage();
  
      await lp.login({
        dpName: this.cfg.dpName,
        username: this.cfg.username,
        password: this.cfg.password
      });
    }, {
      retries: 3,
      delayMs: 3000,
      onRetry: async (e, attempt) => {
        log.warn(`UI login retry ${attempt}: ${e.message}`);
  
        // Make sure we have a live page before doing anything on it
        await ensurePageAlive();
  
        // If we still have a page, try a safe recovery without crashing
        try {
          if (this.page && !this.page.isClosed()) {
            // If already on login page, just wait a bit; otherwise reload
            const url = this.page.url?.() || '';
            if (!url.includes('#/login')) {
              await this.page.goto(this.cfg.loginUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
            } else {
              await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            }
            await this.page.waitForTimeout(1500).catch(() => {});
          }
        } catch (err) {
          // Last resort: recreate everything
          log.warn(`Login recovery failed, restarting browser context: ${err.message}`);
          await this.stop().catch(() => {});
          await this.start();
        }
      }
    });
  }
  

  async getHoldingForScrip(scrip) {
    const nav = new NavBar(this.page);
    await nav.gotoMyShare();
    const ms = new MySharePage(this.page);

    return retry(async () => {
      const bal = await ms.getCurrentBalance(scrip);
      return bal;
    }, {
      retries: 3,
      delayMs: 1500,
      onRetry: (e, attempt) => log.warn(`My Share retry ${attempt} for ${scrip}: ${e.message}`)
    });
  }

  async applyIssue(issue, minUnit) {
    // Returns {status: 'applied'|'already'|'failed'|'manual', note, meta?}
    const nav = new NavBar(this.page);
    await nav.gotoMyAsba();

    const asba = new MyAsbaPage(this.page);
    const row = await asba.findRow(issue);

    if (!row) {
      return { status: 'failed', note: 'Issue row not found in My ASBA UI' };
    }

    // UI says already applied
    if (await asba.rowHasEdit(row)) {
      return { status: 'already', note: 'UI shows Edit (already applied)' };
    }

    // ✅ IMPORTANT FIX:
    // If Apply button is missing, do NOT assume manual.
    // Check Application Report UI for the scrip (HFIL case).
    if (!(await asba.rowHasApply(row))) {
      const found = await this.verifyInApplicationReport(issue.scrip).catch(() => null);

      if (found) {
        const status = String(found.statusName || '').trim();
        return {
          status: 'already',
          note: status ? humanStatus(status) : 'Already applied (found in Application Report)',
          meta: found
        };
      }

      return { status: 'manual', note: 'No Apply button and not found in Application Report' };
    }

    // Open details and read minUnit if not provided
    let min = minUnit;
    let details = { minUnit: null, shareValuePerUnit: null };

    try {
      await asba.openDetails(row);
      details = await asba.readMinUnitAndShareValue();
      if (!min && details.minUnit) min = details.minUnit;
    } catch (e) {
      // continue
    } finally {
      await asba.backToList().catch(() => {});
    }

    if (!min) {
      return { status: 'manual', note: 'MinUnit not detected; apply manually' };
    }

    // Need apply config for auto-apply
    if (!this.cfg.bankName || !this.cfg.accountNo || !this.cfg.crn || !this.cfg.txnPin) {
      return { status: 'manual', note: 'Auto-apply not configured (missing bank/account/CRN/PIN)' };
    }

    // Apply flow with retries, and re-login if session dies
    const attemptApply = async () => {
      await nav.gotoMyAsba();
      const row2 = await asba.findRow(issue);
      if (!row2) throw new Error('Issue row disappeared');

      if (await asba.rowHasEdit(row2)) {
        return { status: 'already', note: 'Already applied' };
      }

      await asba.clickApply(row2);

      const form = new IpoApplyPage(this.page);
      const res = await form.apply({
        bankName: this.cfg.bankName,
        accountNo: this.cfg.accountNo,
        crn: this.cfg.crn,
        txnPin: this.cfg.txnPin,
        minUnit: min
      });

      return {
        status: res.ok ? 'applied' : 'manual',
        note: res.message,
        meta: { minUnit: min, shareValuePerUnit: details.shareValuePerUnit }
      };
    };

    try {
      const out = await retry(attemptApply, {
        retries: 3,
        delayMs: 2500,
        onRetry: async (e, attempt) => {
          log.warn(`Apply retry ${attempt} for ${issue.scrip}: ${e.message}`);
          // If kicked to login, re-login
          if (this.page.url().includes('#/login')) {
            await this.login();
          } else {
            await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          }
          await this.page.waitForTimeout(1500);
        }
      });
      return out;
    } catch (e) {
      return { status: 'failed', note: e.message };
    }
  }

  async verifyInApplicationReport(scrip) {
    const nav = new NavBar(this.page);
    await nav.gotoApplicationReport();
    const ar = new ApplicationReportPage(this.page);
    return ar.findByScrip(scrip);
  }
}

module.exports = { AutomationRunner };
