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
    await p.waitForTimeout(1500);

    const bankSelect = p.locator('select[name="selectBank"]');
    if (await bankSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
      try {
        await bankSelect.selectOption({ label: bankName });
      } catch {
        try {
          await bankSelect.selectOption(bankName);
        } catch {
          log.warn("Bank select failed - using first option");
          await bankSelect.selectOption({ index: 1 });
        }
      }
      await p.waitForTimeout(1200);
    }

    const accountSelect = p.locator('select[name="accountNumber"]');
    if (await accountSelect.isVisible({ timeout: 10000 }).catch(() => false)) {
      try {
        await accountSelect.selectOption({ label: accountNo });
      } catch {
        const options = await accountSelect.locator('option').allInnerTexts();
        const matchingText = options.find(opt => opt.trim().includes(accountNo));
        if (matchingText) {
          await accountSelect.selectOption({ label: matchingText.trim() });
        } else {
          log.warn("No matching account option in dropdown");
        }
      }
      await p.waitForTimeout(1200);
    }
  }

  async fillKitta(kitta) {
    const p = this.page;
    const kittaInput = p.locator("#appliedKitta");
    if (await kittaInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await kittaInput.fill(String(kitta));
      await kittaInput.press('Tab');
    } else {
      log.warn("Kitta input not visible");
    }
  }

  async fillCRN(crn) {
    const p = this.page;
    const crnInput = p.locator("#crnNumber");
    if (await crnInput.isVisible({ timeout: 10000 }).catch(() => false)) {
      await crnInput.fill(crn);
      await crnInput.press('Tab');
    } else {
      log.warn("CRN input not visible");
    }
  }

  async acceptDisclaimer() {
    const p = this.page;
    const checkbox = p.locator('input[type="checkbox"][name*="disclaimer"], input[type="checkbox"]').first();
    if (await checkbox.isVisible({ timeout: 8000 }).catch(() => false)) {
      if (!(await checkbox.isChecked())) {
        await checkbox.check({ force: true });
      }
    }
  }

  async clickProceed() {
    const p = this.page;
    const proceedBtn = p.getByRole('button', { name: /Proceed|Continue|Next/i })
      .or(p.locator('button:has-text("Proceed")'))
      .or(p.locator('button[type="submit"]:has-text("Proceed")'))
      .first();
    if (await proceedBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await proceedBtn.click({ force: true, timeout: 10000 });
      await p.waitForTimeout(3000);
    }
  }

  async fillTxnPin(pin) {
    const p = this.page;
    const pinInput = p.locator('#transactionPIN')
      .or(p.locator('input[name="transactionPIN"]'))
      .or(p.locator('[name="transactionPIN"]'))
      .first();

    if (await pinInput.isVisible({ timeout: 15000 }).catch(() => false)) {
      await pinInput.fill('');
      await pinInput.pressSequentially(pin, { delay: 150 });
      await pinInput.press('Tab');

      const applyBtn = p.getByRole('button', { name: /Apply/i })
        .or(p.locator('button:has-text("Apply")'))
        .or(p.locator('button[type="submit"]:has-text("Apply")'))
        .first();
      await applyBtn.waitFor({ state: 'visible', timeout: 20000 });

      let attempts = 0;
      while (attempts < 25) {
        const isEnabled = await applyBtn.evaluate(btn => !btn.disabled);
        if (isEnabled) {
          await p.waitForTimeout(1500);
          break;
        }
        await p.waitForTimeout(500);
        attempts++;
      }
      if (attempts >= 25) {
        log.warn("Apply button never enabled on PIN screen");
      }
    } else {
      log.warn("Transaction PIN input not visible");
    }
  }
  async clickApply() {
    const p = this.page;
    const applyBtn = p.getByRole('button', { name: /Apply/i })
      .or(p.locator('button:has-text("Apply")'))
      .or(p.locator('button[type="submit"]:has-text("Apply")'))
      .first();

    if (!(await applyBtn.isVisible({ timeout: 15000 }).catch(() => false))) {
      log.warn("Final Apply button not visible");
      return;
    }

    const isEnabled = await applyBtn.evaluate(btn => !btn.disabled);
    if (!isEnabled) {
      log.warn("Final Apply button disabled");
      return;
    }

    const box = await applyBtn.boundingBox().catch(() => null);
    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      await p.mouse.move(centerX, centerY, { steps: 10 });
      await p.waitForTimeout(300);
      await p.mouse.down();
      await p.waitForTimeout(150);
      await p.mouse.move(centerX + 5, centerY + 3, { steps: 5 });
      await p.waitForTimeout(100);
      await p.mouse.up();
    } else {
      await applyBtn.click({ force: true, timeout: 15000 });
    }

    try {
      await p.waitForURL(/#\/asba|my-asba|current-issue/i, { timeout: 20000 });
    } catch (_) {
      log.warn("No redirect to My ASBA after Apply - check result manually");
    }
    await p.waitForTimeout(5000);
  }

  async readToastOrStatus() {
    const p = this.page;
    await p.waitForTimeout(10000);

    const successSelectors = [
      'text=Share has been applied successfully',
      'text=Application submitted',
      'text=Applied Kitta',
      'text=Success',
      'text=Submitted',
      'text=TRANSACTION_SUCCESS'
    ];
    for (const sel of successSelectors) {
      if (await p.locator(sel).first().isVisible({ timeout: 8000 }).catch(() => false)) {
        const text = await p.locator(sel).first().textContent();
        return text.trim();
      }
    }

    const toast = p.locator('.toast, .alert, [role="alert"], .mat-snack-bar-container').first();
    const toastText = await toast.textContent().catch(() => '');
    if (toastText?.trim()) return toastText.trim();

    const bodyText = await p.textContent('body').catch(() => '');
    const match = bodyText.match(/(success|applied|submitted|TRANSACTION_SUCCESS|APPROVED|BLOCKED_APPROVE|Share has been applied successfully)[^\n]{0,200}/i);
    if (match) return match[0].trim();

    return 'No confirmation message detected (check Application Report manually)';
  }

  /**
   * @param {{bankName: string, accountNo: string, crn: string, minUnit: number, txnPin: string}} data
   */
  async apply(data) {
    const min = Number(data.minUnit || 10);
    await this.waitReady();

    try {
      await this.fillBankAndAccount({ bankName: data.bankName, accountNo: data.accountNo });
      await this.fillKitta(min);
      await this.fillCRN(data.crn);
      await this.acceptDisclaimer();
      await this.clickProceed();
      await this.fillTxnPin(data.txnPin);
      await this.clickApply();

      const msg = await this.readToastOrStatus();
      const ok = /success|applied|submitted|TRANSACTION_SUCCESS|APPROVED|BLOCKED_APPROVE/i.test(msg);
      return { ok, message: msg || 'No confirmation received' };
    } catch (err) {
      log.error("Apply form error: " + err.message);
      return { ok: false, message: err.message };
    }
  }
}

module.exports = { IpoApplyPage };