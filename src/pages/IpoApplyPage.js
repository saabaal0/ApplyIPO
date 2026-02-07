// src/pages/IpoApplyPage.js
const log = require('../utils/logger');

class IpoApplyPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async waitReady() {
    await this.page.waitForSelector('body', { timeout: 30000 });
    await this.page.waitForTimeout(800);
  }

  async selectFromSelect2ByLabel(labelText, optionText) {
    const p = this.page;

    // Try to find a label and a nearby select2 container
    const label = p.locator(`text=${labelText}`).first();
    if (await label.isVisible({ timeout: 2000 }).catch(() => false)) {
      const container = label
        .locator(
          'xpath=ancestor::*[self::div or self::label][1]/following::span[contains(@class,"select2")][1]'
        )
        .first();

      if (await container.isVisible({ timeout: 2000 }).catch(() => false)) {
        await container.click();
        await p.waitForTimeout(400);

        const search = p.locator('input.select2-search__field').first();
        if (await search.isVisible({ timeout: 1500 }).catch(() => false)) {
          await search.fill(String(optionText));
          await p.waitForTimeout(400);
        }

        const opt = p.locator(`li.select2-results__option:has-text("${optionText}")`).first();
        if (await opt.isVisible({ timeout: 2500 }).catch(() => false)) {
          await opt.click();
          await p.waitForTimeout(500);
          return true;
        }
      }
    }

    // Fallback: try native select
    const selects = await p.locator('select').all();
    for (const s of selects) {
      const txt = ((await s.textContent().catch(() => '')) || '').toLowerCase();
      if (txt.includes(String(optionText).toLowerCase())) {
        try {
          await s.selectOption({ label: optionText });
          return true;
        } catch {}
      }
    }

    return false;
  }

  async fillBankAndAccount({ bankName, accountNo }) {
    const p = this.page;

    const pickFirstOption = async () => {
      const firstOpt = p.locator('li.select2-results__option').first();
      if (await firstOpt.isVisible({ timeout: 2500 }).catch(() => false)) {
        await firstOpt.click();
        await p.waitForTimeout(500);
        return true;
      }
      return false;
    };

    // ---- BANK ----
    const bankLabels = ['Select Bank', 'Bank', 'Choose Bank'];
    let bankPicked = false;

    if (bankName) {
      for (const label of bankLabels) {
        bankPicked = await this.selectFromSelect2ByLabel(label, bankName);
        if (bankPicked) break;
      }
    }

    if (!bankPicked) {
      const firstSelect2 = p.locator('span.select2-selection').first();
      if (await firstSelect2.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstSelect2.click();
        await p.waitForTimeout(350);

        if (bankName) {
          const search = p.locator('input.select2-search__field').first();
          if (await search.isVisible({ timeout: 1200 }).catch(() => false)) {
            await search.fill(bankName);
            await p.waitForTimeout(350);
          }
          const opt = p.locator(`li.select2-results__option:has-text("${bankName}")`).first();
          if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
            await opt.click();
            await p.waitForTimeout(500);
            bankPicked = true;
          }
        }

        if (!bankPicked) bankPicked = await pickFirstOption();
      }
    }

    if (!bankPicked) throw new Error('Bank not selectable (select2 not found or no options)');

    // ---- ACCOUNT ----
    let accountPicked = false;

    const acctLabels = ['Select Account Number', 'Account Number', 'Choose Account'];
    if (accountNo) {
      for (const label of acctLabels) {
        accountPicked = await this.selectFromSelect2ByLabel(label, accountNo);
        if (accountPicked) break;
      }
    }

    if (!accountPicked) {
      const sels = p.locator('span.select2-selection');
      const cnt = await sels.count().catch(() => 0);
      const accountDropdown = cnt >= 2 ? sels.nth(1) : sels.first();

      if (await accountDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
        await accountDropdown.click();
        await p.waitForTimeout(350);

        if (accountNo) {
          const opt = p.locator(`li.select2-results__option:has-text("${accountNo}")`).first();
          if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
            await opt.click();
            await p.waitForTimeout(500);
            accountPicked = true;
          }
        }

        if (!accountPicked) accountPicked = await pickFirstOption();
      }
    }

    if (!accountPicked) throw new Error('Account not selectable (no options)');
  }

  async fillKitta(minUnit) {
    const p = this.page;
    const kittaSelectors = [
      'input[formcontrolname="appliedKitta"]',
      'input[name*="kitta" i]',
      'input[placeholder*="kitta" i]',
      'input[type="number"]'
    ];

    for (const sel of kittaSelectors) {
      const inp = p.locator(sel).first();
      if (await inp.isVisible({ timeout: 2000 }).catch(() => false)) {
        await inp.fill('');
        await inp.type(String(minUnit), { delay: 40 });
        return;
      }
    }
    throw new Error('Kitta input not found');
  }

  async fillCRN(crn) {
    const p = this.page;
    const selectors = [
      'input[formcontrolname="crnNumber"]',
      'input[name*="crn" i]',
      'input[placeholder*="Enter CRN" i]',
      'input[placeholder*="crn" i]',
      'xpath=//*[normalize-space()="CRN"]/following::input[1]'
    ];

    for (const sel of selectors) {
      const inp = p.locator(sel).first();
      if (await inp.isVisible({ timeout: 2500 }).catch(() => false)) {
        await inp.fill('');
        await inp.type(String(crn), { delay: 40 });
        return;
      }
    }
    throw new Error('CRN input not found');
  }

  async acceptDisclaimer() {
    const p = this.page;

    // Prefer checkbox near disclaimer text
    const cbNearText = p
      .locator(
        'xpath=//*[contains(normalize-space(),"I hereby declare")]/preceding::input[@type="checkbox"][1]'
      )
      .first();

    if (await cbNearText.isVisible({ timeout: 1500 }).catch(() => false)) {
      const checked = await cbNearText.isChecked().catch(() => false);
      if (!checked) {
        await cbNearText.click({ force: true }).catch(() => {});
        await p.waitForTimeout(250);
      }
      return;
    }

    // Fallback: first checkbox
    const cb = p.locator('input[type="checkbox"]').first();
    if (await cb.isVisible({ timeout: 1500 }).catch(() => false)) {
      const checked = await cb.isChecked().catch(() => false);
      if (!checked) {
        await cb.click({ force: true }).catch(() => {});
        await p.waitForTimeout(250);
      }
    }
  }

  async clickProceed() {
    const p = this.page;

    const proceed = p.locator('button:has-text("Proceed")').first();
    if (await proceed.isVisible({ timeout: 2500 }).catch(() => false)) {
      await proceed.click();
      await p.waitForTimeout(1200);
      return;
    }

    const proceedCaps = p.locator('button:has-text("PROCEED")').first();
    if (await proceedCaps.isVisible({ timeout: 2500 }).catch(() => false)) {
      await proceedCaps.click();
      await p.waitForTimeout(1200);
      return;
    }

    throw new Error('Proceed button not found');
  }

  async fillTxnPin(pin) {
    const p = this.page;

    // Prefer the PIN prompt view you showed
    const prompt = p.locator('text=Please enter your 4 digits transaction PIN to proceed').first();
    if (await prompt.isVisible({ timeout: 8000 }).catch(() => false)) {
      // Choose first visible input after prompt appears
      const inputs = p.locator('input');
      const count = await inputs.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const candidate = inputs.nth(i);
        if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
          await candidate.fill('');
          await candidate.type(String(pin), { delay: 60 });
          return;
        }
      }

      throw new Error('Transaction PIN input not found on PIN screen');
    }

    // Fallback selectors
    const selectors = [
      'input[formcontrolname="transactionPin"]',
      'input[name*="transaction" i]',
      'input[name*="pin" i]',
      'input[placeholder*="pin" i]',
      'input[type="password"]'
    ];

    for (const sel of selectors) {
      const inp = p.locator(sel).first();
      if (await inp.isVisible({ timeout: 4000 }).catch(() => false)) {
        await inp.fill('');
        await inp.type(String(pin), { delay: 60 });
        return;
      }
    }

    throw new Error('Transaction PIN input not found');
  }

  async clickApply() {
    const p = this.page;

    // Prefer the Apply button on the PIN prompt screen you showed
    const pinPrompt = p.locator('text=Please enter your 4 digits transaction PIN to proceed').first();
    if (await pinPrompt.isVisible({ timeout: 8000 }).catch(() => false)) {
      const applyBtn = p.locator('button:has-text("Apply")').first();
      if (await applyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await applyBtn.click();
        await p.waitForTimeout(1500);
        return;
      }
      throw new Error('Apply button not found on PIN screen');
    }

    // Fallback: generic apply/submit buttons
    const btns = [
      'button[type="submit"]:has-text("Submit")',
      'button[type="submit"]:has-text("Apply")',
      'button:has-text("Submit")',
      'button:has-text("Apply")',
      'button:has-text("SUBMIT")',
      'button:has-text("APPLY")'
    ];

    for (const sel of btns) {
      const b = p.locator(sel).first();
      if (await b.isVisible({ timeout: 3000 }).catch(() => false)) {
        await b.click();
        await p.waitForTimeout(1500);
        return;
      }
    }

    throw new Error('Final Submit/Apply button not found');
  }

  async readToastOrStatus() {
    const p = this.page;

    // Exact success toast text you showed
    const successToast = p.locator('text=Share has been applied successfully.').first();
    if (await successToast.isVisible({ timeout: 8000 }).catch(() => false)) {
      return 'Share has been applied successfully.';
    }

    // General toast/alert containers
    const selectors = ['.toast', '.alert', '[role="alert"]', '.mat-snack-bar-container'];
    for (const sel of selectors) {
      const el = p.locator(sel).first();
      const txt = await el.textContent().catch(() => null);
      if (txt && txt.trim()) return txt.trim();
    }

    // Fallback scan
    const body = await p.textContent('body').catch(() => '');
    const m = body.match(
      /(Share has been applied successfully|TRANSACTION_SUCCESS|BLOCKED_APPROVE|APPROVED|success|submitted|failed|error)[^\n]{0,160}/i
    );
    return m?.[0]?.trim() || '';
  }

  /**
   * @param {{bankName: string, accountNo: string, crn: string, minUnit: number, txnPin: string}} data
   */
  async apply(data) {
    const min = Number(data.minUnit || 10);

    await this.waitReady();

    // Bank + Account: pick single option safely (or match by name if provided)
    await this.fillBankAndAccount({ bankName: data.bankName, accountNo: data.accountNo });

    await this.fillKitta(min);
    await this.fillCRN(data.crn);
    await this.acceptDisclaimer();

    await this.clickProceed();

    // Transaction PIN screen
    await this.fillTxnPin(data.txnPin);
    await this.clickApply();

    const msg = await this.readToastOrStatus();
    const ok =
      /share has been applied successfully|success|submitted|transaction_success|approved|blocked_approve/i.test(msg);

    if (!ok) {
      log.warn(`Apply may not have succeeded. Message: ${msg}`);
    }

    return { ok, message: msg || 'Submitted (no message)' };
  }
}

module.exports = { IpoApplyPage };
