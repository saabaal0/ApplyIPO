const { chromium } = require("playwright");
const { retry } = require("../utils/retry");
const log = require("../utils/logger");
const { LoginPage } = require("../pages/LoginPage");
const { NavBar } = require("../pages/NavBar");
const { MyAsbaPage } = require("../pages/MyAsbaPage");
const { MySharePage } = require("../pages/MySharePage");
const { IpoApplyPage } = require("../pages/IpoApplyPage");
const { ApplicationReportPage } = require("../pages/ApplicationReportPage");
const { humanStatus } = require("../utils/applicationStatus");

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
    this.browser = await chromium.launch({
      headless: this.runtime.headless,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(45000);
    log.info("Browser started (headless: " + this.runtime.headless + ")");
  }

  async stop() {
    try {
      await this.page?.close();
    } catch {}
    try {
      await this.context?.close();
    } catch {}
    try {
      await this.browser?.close();
    } catch {}
  }

  async login() {
    const mkLoginPage = () =>
      new LoginPage(this.page, { loginUrl: this.cfg.loginUrl });

    const ensurePageAlive = async () => {
      const pageClosed = !this.page || this.page.isClosed?.();
      const ctxClosed = !this.context || this.context.isClosed?.();

      if (pageClosed || ctxClosed) {
        log.warn("Page/context was closed. Recreating browser context...");
        await this.stop().catch(() => {});
        await this.start();
      }
    };

    log.info("Logging in to MeroShare (" + this.cfg.dpName + ")");
    await retry(
      async () => {
        await ensurePageAlive();
        const lp = mkLoginPage();

        await lp.login({
          dpName: this.cfg.dpName,
          username: this.cfg.username,
          password: this.cfg.password,
        });
      },
      {
        retries: 3,
        delayMs: 3000,
        onRetry: async (e, attempt) => {
          log.warn(`UI login retry ${attempt}: ${e.message}`);

          await ensurePageAlive();

          try {
            if (this.page && !this.page.isClosed()) {
              const url = this.page.url?.() || "";
              if (!url.includes("#/login")) {
                await this.page
                  .goto(this.cfg.loginUrl, { waitUntil: "domcontentloaded" })
                  .catch(() => {});
              } else {
                await this.page
                  .reload({ waitUntil: "domcontentloaded" })
                  .catch(() => {});
              }
              await this.page.waitForTimeout(1500).catch(() => {});
            }
          } catch (err) {
            log.warn(
              `Login recovery failed, restarting browser context: ${err.message}`,
            );
            await this.stop().catch(() => {});
            await this.start();
          }
        },
      },
    );
  }

  async getHoldingForScrip(scrip) {
    const nav = new NavBar(this.page);
    await nav.gotoMyShare();
    const ms = new MySharePage(this.page);

    return retry(
      async () => {
        const bal = await ms.getCurrentBalance(scrip);
        return bal;
      },
      {
        retries: 3,
        delayMs: 1500,
        onRetry: (e, attempt) =>
          log.warn(`My Share retry ${attempt} for ${scrip}: ${e.message}`),
      },
    );
  }

  async applyIssue(issue, minUnit) {
    log.info("Applying: " + issue.scrip + " — " + issue.companyName);
    const nav = new NavBar(this.page);
    await nav.gotoMyAsba();
    await this.page.waitForTimeout(3000);
    const asba = new MyAsbaPage(this.page);
    const row = await asba.findRow(issue);

    if (!row) {
      return { status: "failed", note: "Issue row not found in My ASBA UI" };
    }

    if (await asba.rowHasEdit(row)) {
      return { status: "already", note: "UI shows Edit (already applied)" };
    }

    const hasApply = await asba.rowHasApply(row);

    if (!hasApply) {
      const found = await this.verifyInApplicationReport(issue.scrip).catch(
        () => null,
      );

      if (found?.found) {
        return {
          status: "already",
          note: `Already applied (status: ${found.status || "UNKNOWN"})`,
          meta: found,
        };
      }
      return {
        status: "manual",
        note: "No Apply button and not found in Application Report",
      };
    }

    if (
      !this.cfg.bankName ||
      !this.cfg.accountNo ||
      !this.cfg.crn ||
      !this.cfg.txnPin
    ) {
      return {
        status: "manual",
        note: "Auto-apply not configured (missing bank/account/CRN/PIN)",
      };
    }

    try {
      await asba.clickApply(row);
    } catch (e) {
      log.warn("Apply click failed: " + e.message);
      return { status: "failed", note: `Click failed: ${e.message}` };
    }

    const navigated = await Promise.race([
      this.page
        .waitForSelector("text=/Bank|Kitta|CRN|Proceed|Disclaimer/i", {
          timeout: 20000,
        })
        .then(() => true)
        .catch(() => false),

      this.page
        .waitForURL(/apply|form|ipo-apply|kitta/i, {
          timeout: 20000,
        })
        .then(() => true)
        .catch(() => false),
    ]);

    if (!navigated) {
      await this.page
        .screenshot({
          path: `debug-no-navigation-${Date.now()}.png`,
          fullPage: true,
        })
        .catch(() => {});
      return {
        status: "manual",
        note: "Apply clicked but no form loaded - check manually",
      };
    }

    const form = new IpoApplyPage(this.page);

    let res;
    try {
      res = await form.apply({
        bankName: this.cfg.bankName,
        accountNo: this.cfg.accountNo,
        crn: this.cfg.crn,
        txnPin: this.cfg.txnPin,
        minUnit: minUnit || 10,
      });
    } catch (e) {
      log.warn("Form submission failed: " + e.message);
      return {
        status: "manual",
        note: `Form submission error: ${e.message}`,
      };
    }

    if (res.ok) {
      log.info("Application submitted successfully: " + issue.scrip);
    } else {
      log.warn("Form submitted but success not confirmed: " + res.message);
    }
    return {
      status: res.ok ? "applied" : "manual",
      note: res.message,
      meta: { minUnit: minUnit || 10 },
    };
  }

  async verifyInApplicationReport(scrip) {
    const nav = new NavBar(this.page);
    await nav.gotoApplicationReport();
    const ar = new ApplicationReportPage(this.page);
    return ar.findByScrip(scrip);
  }
  /**
   * Check if the current browser session is still logged in to MeroShare
   * @returns {Promise<boolean>}
   */
  async isLoggedIn() {
    const p = this.page;
    try {
      // Fast URL check
      if (p.url().includes("#/login") || p.url().includes("login")) {
        return false;
      }

      // Check for logged-in elements (navbar, profile, etc.)
      const indicators = [
        "text=My ASBA",
        "text=My Share",
        "text=Application Report",
        "text=My Portfolio",
        "text=Logout",
        ".navbar-brand", // persistent header
      ];

      for (const sel of indicators) {
        if (
          await p
            .locator(sel)
            .first()
            .isVisible({ timeout: 4000 })
            .catch(() => false)
        ) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}

module.exports = { AutomationRunner };
