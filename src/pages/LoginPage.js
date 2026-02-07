const log = require('../utils/logger');

class LoginPage {
  /** @param {import('playwright').Page} page */
  constructor(page, cfg) {
    this.page = page;
    this.cfg = cfg;
  }

  async goto() {
    await this.page.goto(this.cfg.loginUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await this.page.waitForTimeout(1200);
  }

  async selectDP(dpName) {
    // Select2 variants + fallback native select
    const p = this.page;
    const select2Selectors = [
      'span.select2-container:has-text("Select your DP")',
      'span.select2-selection:has-text("Select your DP")',
      'span.select2-selection__rendered:has-text("Select your DP")',
      'span.select2-container',
      'select2#selectBranch + span.select2-container'
    ];

    for (const sel of select2Selectors) {
      const dd = p.locator(sel).first();
      try {
        if (await dd.isVisible({ timeout: 2000 })) {
          await dd.click();
          await p.waitForTimeout(800);
          const opt = p.locator(`li.select2-results__option:has-text("${dpName}")`).first();
          if (await opt.isVisible({ timeout: 3000 })) {
            await opt.click();
            await p.waitForTimeout(500);
            return;
          }
          // fallback scan
          const all = await p.locator('li.select2-results__option').all();
          for (const o of all) {
            const t = (await o.textContent())?.trim();
            if (t && t.toLowerCase() === dpName.toLowerCase()) {
              await o.click();
              await p.waitForTimeout(500);
              return;
            }
          }
        }
      } catch {}
    }

    // native select fallback
    const native = p.locator('select#selectBranch, select[name*="branch" i], select').first();
    if (await native.isVisible({ timeout: 2000 }).catch(() => false)) {
      try {
        await native.selectOption({ label: dpName });
        return;
      } catch {
        // ignore
      }
    }

    throw new Error(`DP not found: ${dpName}`);
  }

  async fillCredentials(username, password) {
    const p = this.page;
    const userSel = [
      'input#username',
      'input[name="username"]',
      'input[placeholder*="username" i]',
      'input[type="text"]'
    ];
    const passSel = [
      'input#password',
      'input[name="password"]',
      'input[type="password"]'
    ];

    let u = null;
    for (const sel of userSel) {
      const f = p.locator(sel).first();
      if (await f.isVisible({ timeout: 1500 }).catch(() => false)) {
        u = f;
        break;
      }
    }
    if (!u) throw new Error('Username field not found');
    await u.fill('');
    await u.fill(username);

    let pw = null;
    for (const sel of passSel) {
      const f = p.locator(sel).first();
      if (await f.isVisible({ timeout: 1500 }).catch(() => false)) {
        pw = f;
        break;
      }
    }
    if (!pw) throw new Error('Password field not found');
    await pw.fill('');
    await pw.fill(password);
  }

  async submit() {
    const p = this.page;
    const btnSel = [
      'button[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("LOGIN")',
      'button.btn-primary',
      'input[type="submit"]'
    ];
    for (const sel of btnSel) {
      const b = p.locator(sel).first();
      if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
        await b.click();
        await p.waitForTimeout(2500);
        return;
      }
    }
    throw new Error('Login button not found');
  }

  async login({ dpName, username, password }) {
    await this.goto();
    await this.selectDP(dpName);
    await this.fillCredentials(username, password);
    await this.submit();

    // Wait until URL changes away from login or dashboard items appear
    await this.page.waitForTimeout(3000);
    const ok = await this.isLoggedIn();
    if (!ok) {
      const err = await this.getLoginError();
      throw new Error(err || 'Login failed (unknown reason)');
    }
  }

  async getLoginError() {
    const p = this.page;
    const selectors = ['.alert-danger', '.error', '[role="alert"]', '.toast-error'];
    for (const sel of selectors) {
      const e = p.locator(sel).first();
      const txt = await e.textContent().catch(() => null);
      if (txt && txt.trim()) return `Login failed: ${txt.trim()}`;
    }
    // Sometimes the app shows inline text
    const body = await p.textContent('body').catch(() => '');
    if (/invalid|failed|incorrect|error/i.test(body)) {
      const m = body.match(/(invalid|failed|incorrect|error)[^\n]{0,80}/i);
      if (m?.[0]) return `Login failed: ${m[0].trim()}`;
    }
    return null;
  }

  async isLoggedIn() {
    const url = this.page.url();
    if (!url.includes('#/login') && !url.includes('login')) {
      return true;
    }
    // If still on login URL, check for a known post-login element
    const candidates = [
      'a:has-text("My ASBA")',
      'a:has-text("My Share")',
      'text=/My\s+Portfolio/i'
    ];
    for (const sel of candidates) {
      if (await this.page.locator(sel).first().isVisible({ timeout: 1500 }).catch(() => false)) {
        return true;
      }
    }
    return false;
  }
}

module.exports = { LoginPage };
