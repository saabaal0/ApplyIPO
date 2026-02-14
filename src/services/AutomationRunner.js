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
    console.log('[AutomationRunner] Starting browser...');
    console.log('[Headless mode]:', this.runtime.headless);
    
    this.browser = await chromium.launch({ 
      headless: this.runtime.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    });
    
    this.context = await this.browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(45000);
    
    console.log('[AutomationRunner] ✅ Browser started');
  }

  async stop() {
    console.log('[AutomationRunner] Stopping browser...');
    
    try {
      await this.page?.close();
    } catch {}
    try {
      await this.context?.close();
    } catch {}
    try {
      await this.browser?.close();
    } catch {}
    
    console.log('[AutomationRunner] ✅ Browser stopped');
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

    console.log('\n═══════════════════════════════════════════');
    console.log('LOGGING IN TO MEROSHARE');
    console.log('═══════════════════════════════════════════');
    console.log('[DP Name]:', this.cfg.dpName);
    console.log('[Username]:', this.cfg.username);
    
    await retry(
      async () => {
        await ensurePageAlive();
        const lp = mkLoginPage();

        await lp.login({
          dpName: this.cfg.dpName,
          username: this.cfg.username,
          password: this.cfg.password,
        });
        
        console.log('✅ Login successful\n');
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
    console.log(`\n[getHoldingForScrip] Checking holding for: ${scrip}`);
    
    const nav = new NavBar(this.page);
    await nav.gotoMyShare();
    const ms = new MySharePage(this.page);

    return retry(
      async () => {
        const bal = await ms.getCurrentBalance(scrip);
        console.log(`[Holding] ${scrip}: ${bal} units`);
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
    console.log('\n');
    console.log('█████████████████████████████████████████████████████████████');
    console.log('█                                                           █');
    console.log(`█  APPLYING IPO: ${issue.scrip.padEnd(10)} ${issue.companyName.slice(0, 28).padEnd(28)} █`);
    console.log('█                                                           █');
    console.log('█████████████████████████████████████████████████████████████');
    console.log('');
    
    const nav = new NavBar(this.page);
    
    // Navigate to My ASBA
    console.log('[Step 1/7] Navigating to My ASBA...');
    await nav.gotoMyAsba();
    
    // Wait for page to fully load
    await this.page.waitForTimeout(3000);
    
    const asba = new MyAsbaPage(this.page);
    
    // Find the IPO row
    console.log('[Step 2/7] Finding IPO row...');
    const row = await asba.findRow(issue);

    if (!row) {
      console.log('❌ FAILED: Row not found\n');
      return { status: "failed", note: "Issue row not found in My ASBA UI" };
    }

    console.log('✅ Row found');

    // Check if already applied (Edit button present)
    console.log('[Step 3/7] Checking if already applied...');
    if (await asba.rowHasEdit(row)) {
      console.log('⏭️  SKIPPED: Already applied (Edit button present)\n');
      return { status: "already", note: "UI shows Edit (already applied)" };
    }

    // Check if Apply button exists
    console.log('[Step 4/7] Checking for Apply button...');
    const hasApply = await asba.rowHasApply(row);

    if (!hasApply) {
      console.log('⚠️  No Apply button detected');
      console.log('[Fallback] Checking Application Report...');
      
      const found = await this.verifyInApplicationReport(issue.scrip).catch(() => null);

      if (found?.found) {
        console.log('✅ Found in Application Report - already applied');
        console.log(`   Status: ${found.status || "UNKNOWN"}\n`);
        
        return {
          status: "already",
          note: `Already applied (status: ${found.status || "UNKNOWN"})`,
          meta: found,
        };
      }

      console.log('❌ Not found in Application Report either');
      console.log('⚠️  MANUAL CHECK REQUIRED\n');
      
      return {
        status: "manual",
        note: "No Apply button and not found in Application Report",
      };
    }

    console.log('✅ Apply button detected');

    // Check if we have bank details for auto-apply
    if (!this.cfg.bankName || !this.cfg.accountNo || !this.cfg.crn || !this.cfg.txnPin) {
      console.log('⚠️  Bank details not configured');
      console.log('   Missing: Bank/Account/CRN/PIN');
      console.log('⚠️  MANUAL CHECK REQUIRED\n');
      
      return {
        status: "manual",
        note: "Auto-apply not configured (missing bank/account/CRN/PIN)",
      };
    }

    // Attempt to click Apply button
    console.log('[Step 5/7] Clicking Apply button...');
    
    try {
      await asba.clickApply(row);
      console.log('✅ Click executed');
    } catch (e) {
      console.log('❌ Click failed:', e.message);
      console.log('   Check debug screenshots for details\n');
      
      return { status: "failed", note: `Click failed: ${e.message}` };
    }

    // Wait for form to load
    console.log('[Step 6/7] Waiting for application form...');
    
    const navigated = await Promise.race([
      this.page.waitForSelector('text=/Bank|Kitta|CRN|Proceed|Disclaimer/i', {
        timeout: 20000,
      }).then(() => true).catch(() => false),
      
      this.page.waitForURL(/apply|form|ipo-apply|kitta/i, { 
        timeout: 20000 
      }).then(() => true).catch(() => false),
    ]);

    if (!navigated) {
      console.log('❌ Form did not load after clicking');
      console.log('   Screenshot saved for debugging');
      
      await this.page.screenshot({ 
        path: `debug-no-navigation-${Date.now()}.png`,
        fullPage: true
      }).catch(() => {});
      
      console.log('⚠️  MANUAL CHECK REQUIRED\n');
      
      return {
        status: "manual",
        note: "Apply clicked but no form loaded - check manually",
      };
    }

    console.log('✅ Application form loaded');

    // Fill and submit the form
    console.log('[Step 7/7] Filling application form...');
    console.log('   Bank:', this.cfg.bankName);
    console.log('   Account:', this.cfg.accountNo);
    console.log('   CRN:', this.cfg.crn);
    console.log('   Kitta:', minUnit || 10);
    
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
      console.log('❌ Form submission failed:', e.message);
      console.log('⚠️  MANUAL CHECK REQUIRED\n');
      
      return {
        status: "manual",
        note: `Form submission error: ${e.message}`
      };
    }

    console.log('\n[Form Submission Result]');
    console.log('   Status:', res.ok ? '✅ SUCCESS' : '❌ FAILED');
    console.log('   Message:', res.message);
    console.log('');

    if (res.ok) {
      console.log('🎉 🎉 🎉 APPLICATION SUCCESSFUL 🎉 🎉 🎉\n');
    } else {
      console.log('⚠️  Form submitted but success not confirmed\n');
    }

    return {
      status: res.ok ? "applied" : "manual",
      note: res.message,
      meta: { minUnit: minUnit || 10 }
    };
  }

  async verifyInApplicationReport(scrip) {
    console.log(`[verifyInApplicationReport] Checking for: ${scrip}`);
    
    const nav = new NavBar(this.page);
    await nav.gotoApplicationReport();
    
    const ar = new ApplicationReportPage(this.page);
    const result = await ar.findByScrip(scrip);
    
    console.log(`[Application Report] Found: ${result.found}, Status: ${result.status || 'N/A'}`);
    
    return result;
  }
}

module.exports = { AutomationRunner };