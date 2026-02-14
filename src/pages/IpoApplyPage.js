// src/pages/IpoApplyPage.js
const log = require('../utils/logger');

class IpoApplyPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async waitReady() {
    await this.page.waitForSelector('body', { timeout: 30000 });
    await this.page.waitForTimeout(1500); // extra stability
  }

  async fillBankAndAccount({ bankName, accountNo }) {
    const p = this.page;
    console.log(`[fillBankAndAccount] Bank: "${bankName}", Account: "${accountNo}"`);

    await p.waitForTimeout(1500);

    // Bank select
    const bankSelect = p.locator('select[name="selectBank"]');
    if (await bankSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
      console.log('[Bank] select[name="selectBank"] visible');

      try {
        await bankSelect.selectOption({ label: bankName });
        console.log('[Bank] Selected via exact label');
      } catch {
        try {
          await bankSelect.selectOption(bankName); // try value
          console.log('[Bank] Selected via value');
        } catch {
          console.warn('[Bank] Could not select bank - trying first option');
          await bankSelect.selectOption({ index: 1 }); // fallback
        }
      }
      await p.waitForTimeout(1200);
    } else {
      console.warn('[Bank] select[name="selectBank"] NOT visible');
    }

    // Account select
    // Account select
const accountSelect = p.locator('select[name="accountNumber"]');

if (await accountSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
  console.log('[Account] select[name="accountNumber"] visible');

  try {
    // Try exact full label first (from .env)
    await accountSelect.selectOption({ label: accountNo });
    console.log('[Account] Selected exact label from .env');
  } catch {
    console.log('[Account] Exact label failed → trying partial match on number');

    // Get all options
    const options = await accountSelect.locator('option').allInnerTexts();

    // Find option that contains the account number
    const matchingText = options.find(opt => opt.trim().includes(accountNo));

    if (matchingText) {
      await accountSelect.selectOption({ label: matchingText.trim() });
      console.log('[Account] Selected via partial match:', matchingText.trim());
    } else {
      console.warn('[Account] No matching account option found in dropdown');
      // Fallback: select first option if desperate (only for testing!)
      // await accountSelect.selectOption({ index: 1 });
    }
  }

  await p.waitForTimeout(1200);
} else {
  console.warn('[Account] select[name="accountNumber"] NOT visible');
}
  }

  async fillKitta(kitta) {
    const p = this.page;
    const kittaInput = p.locator("#appliedKitta");

    console.log(`[fillKitta] Trying to fill: ${kitta}`);

    if (await kittaInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await kittaInput.fill(String(kitta));
      await kittaInput.press('Tab'); // trigger validation
      console.log('[fillKitta] Filled successfully');
    } else {
      console.warn('[fillKitta] #appliedKitta not visible');
      await p.screenshot({ path: `debug-kitta-missing-${Date.now()}.png` });
    }
  }

  async fillCRN(crn) {
    const p = this.page;
    const crnInput = p.locator("#crnNumber");

    console.log(`[fillCRN] Trying to fill: ${crn}`);

    if (await crnInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await crnInput.fill(crn);
      await crnInput.press('Tab');
      console.log('[fillCRN] Filled successfully');
    } else {
      console.warn('[fillCRN] #crnNumber not visible');
      await p.screenshot({ path: `debug-crn-missing-${Date.now()}.png` });
    }
  }

  async acceptDisclaimer() {
    const p = this.page;
    const checkbox = p.locator('input[type="checkbox"][name*="disclaimer"], input[type="checkbox"]').first();

    if (await checkbox.isVisible({ timeout: 8000 }).catch(() => false)) {
      if (!(await checkbox.isChecked())) {
        await checkbox.check({ force: true });
        console.log('[Disclaimer] Checked');
      } else {
        console.log('[Disclaimer] Already checked');
      }
    } else {
      console.warn('[Disclaimer] Checkbox not found');
    }
  }

  async clickProceed() {
    const p = this.page;

    const proceedBtn = p.getByRole('button', { name: /Proceed|Continue|Next/i })
      .or(p.locator('button:has-text("Proceed")'))
      .or(p.locator('button[type="submit"]:has-text("Proceed")'))
      .first();

    console.log('[Proceed] Looking for button');

    if (await proceedBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await proceedBtn.click({ force: true, timeout: 10000 });
      console.log('[Proceed] Clicked Proceed button');
      await p.waitForTimeout(3000);
    } else {
      console.warn('[Proceed] No Proceed button found');
      await p.screenshot({ path: `debug-proceed-missing-${Date.now()}.png` });
    }
  }

  async fillTxnPin(pin) {
    const p = this.page;
  
    const pinInput = p.locator('#transactionPIN')
      .or(p.locator('input[name="transactionPIN"]'))
      .or(p.locator('[name="transactionPIN"]'))
      .first();
  
    console.log('[fillTxnPin] Looking for PIN input');
  
    if (await pinInput.isVisible({ timeout: 15000 }).catch(() => false)) {
      console.log('[fillTxnPin] PIN input visible - filling');
  
      await pinInput.fill('');
      await pinInput.pressSequentially(pin, { delay: 150 });
      await pinInput.press('Tab'); // blur
  
      console.log('[fillTxnPin] PIN filled and blurred');
  
      const applyBtn = p.getByRole('button', { name: /Apply/i })
        .or(p.locator('button:has-text("Apply")'))
        .or(p.locator('button[type="submit"]:has-text("Apply")'))
        .first();
  
      await applyBtn.waitFor({ state: 'visible', timeout: 20000 });
      console.log('[fillTxnPin] Apply button visible');
  
      // Wait for enabled + extra safety delay
      let attempts = 0;
      while (attempts < 25) {
        const isEnabled = await applyBtn.evaluate(btn => !btn.disabled);
        if (isEnabled) {
          console.log('[fillTxnPin] Apply button enabled after', attempts, 'attempts');
          await p.waitForTimeout(1500); // <--- IMPORTANT DELAY: give UI time to stabilize
          break;
        }
        await p.waitForTimeout(500);
        attempts++;
      }
  
      if (attempts >= 25) {
        console.warn('[fillTxnPin] Apply button never enabled');
        await p.screenshot({ path: `debug-pin-button-never-enabled-${Date.now()}.png` });
      }
  
    } else {
      console.warn('[fillTxnPin] #transactionPIN not visible');
      await p.screenshot({ path: `debug-pin-missing-${Date.now()}.png` });
    }
  }
  async clickApply() {
    const p = this.page;
  
    const applyBtn = p.getByRole('button', { name: /Apply/i })
      .or(p.locator('button:has-text("Apply")'))
      .or(p.locator('button[type="submit"]:has-text("Apply")'))
      .first();
  
    console.log('[clickApply - Final] Looking for final Apply button on PIN screen');
  
    if (!(await applyBtn.isVisible({ timeout: 15000 }).catch(() => false))) {
      console.warn('[clickApply - Final] Final Apply button NOT visible');
      await p.screenshot({ path: `debug-final-apply-missing-${Date.now()}.png`, fullPage: true });
      return;
    }
  
    console.log('[clickApply - Final] Final Apply button is visible');
  
    let clickSuccess = false;
  
    for (let attempt = 1; attempt <= 5; attempt++) {
      console.log(`[clickApply - Final] Attempt ${attempt}/${5}`);
  
      // Check enabled state
      const isEnabled = await applyBtn.evaluate(btn => !btn.disabled && btn.offsetParent !== null);
      console.log(`[clickApply - Final] Button enabled? ${isEnabled}`);
  
      if (!isEnabled) {
        console.warn('[clickApply - Final] Button disabled on attempt', attempt);
        await p.waitForTimeout(2000);
        continue;
      }
  
      // Normal Playwright click
      try {
        await applyBtn.click({ force: true, timeout: 12000 });
        console.log('[clickApply - Final] Normal click executed on attempt', attempt);
      } catch (e) {
        console.log('[clickApply - Final] Normal click error on attempt', attempt, ':', e.message);
      }
  
      // Mouse fallback click (bypasses most actionability checks)
      const box = await applyBtn.boundingBox().catch(() => null);
      if (box) {
        console.log('[clickApply - Final] Mouse fallback click on attempt', attempt);
        await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 100 });
      }
  
      // Delay after click
      await p.waitForTimeout(4000);
  
      // Check for success indicators
      const hasSuccess = await p.locator('text=applied|success|submitted|TRANSACTION_SUCCESS|Share has been applied successfully').isVisible({ timeout: 6000 }).catch(() => false);
      if (hasSuccess) {
        clickSuccess = true;
        console.log('[clickApply - Final] Success indicator detected after attempt', attempt);
        break;
      }
  
      // Screenshot for debug
      await p.screenshot({ path: `debug-final-click-attempt-${attempt}-${Date.now()}.png`, fullPage: true });
      console.log('[clickApply - Final] Screenshot saved for attempt', attempt);
    }
  
    if (clickSuccess) {
      console.log('[clickApply - Final] SUCCESS - button click appears to have worked');
      await p.waitForTimeout(10000); // give time for redirect or toast
    } else {
      console.warn('[clickApply - Final] No success detected after 5 attempts');
      await p.screenshot({ path: `debug-final-click-failed-all-${Date.now()}.png`, fullPage: true });
    }
  }

  async readToastOrStatus() {
    const p = this.page;

    // Success toast
    const success = await p.locator('text=Share has been applied successfully').first().isVisible({ timeout: 10000 }).catch(() => false);
    if (success) return 'Share has been applied successfully.';

    // Other toasts/alerts
    const toast = p.locator('.toast, .alert, [role="alert"], .mat-snack-bar-container').first();
    const text = await toast.textContent().catch(() => '');
    if (text?.trim()) return text.trim();

    // Fallback body scan
    const bodyText = await p.textContent('body').catch(() => '');
    const match = bodyText.match(/(success|applied|submitted|TRANSACTION_SUCCESS|APPROVED|BLOCKED_APPROVE|error|failed)[^\n]{0,200}/i);
    return match ? match[0].trim() : 'No status message found';
  }

  /**
   * @param {{bankName: string, accountNo: string, crn: string, minUnit: number, txnPin: string}} data
   */
  async apply(data) {
    const min = Number(data.minUnit || 10);

    await this.waitReady();
    console.log('[apply START]');

    try {
      await this.fillBankAndAccount({ bankName: data.bankName, accountNo: data.accountNo });
      await this.fillKitta(min);
      await this.fillCRN(data.crn);
      await this.acceptDisclaimer();
      await this.clickProceed();
      await this.fillTxnPin(data.txnPin);
      await this.clickApply();

      const msg = await this.readToastOrStatus();
      console.log('[apply] Final message:', msg);

      const ok = /success|applied|submitted|TRANSACTION_SUCCESS|APPROVED|BLOCKED_APPROVE/i.test(msg);

      if (!ok) {
        await this.page.screenshot({ path: `debug-apply-fail-${Date.now()}.png`, fullPage: true });
      }

      return { ok, message: msg || 'No confirmation received' };
    } catch (err) {
      console.error('[apply] Error during form fill/submit:', err.message);
      await this.page.screenshot({ path: `debug-apply-error-${Date.now()}.png`, fullPage: true });
      return { ok: false, message: err.message };
    }
  }
}

module.exports = { IpoApplyPage };