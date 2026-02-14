const log = require("../utils/logger");

class MyAsbaPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async waitReady() {
    const p = this.page;
    await p.waitForTimeout(1500);
    await p.waitForSelector("body", { timeout: 30000 });
    
    // Wait for any loading indicators to disappear
    await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }

  async trySearch(text) {
    const p = this.page;
    const inputs = [
      'div.dataTables_filter input[type="search"]',
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]',
    ];

    for (const sel of inputs) {
      const inp = p.locator(sel).first();
      if (await inp.isVisible({ timeout: 1000 }).catch(() => false)) {
        await inp.fill("");
        await inp.fill(text);
        await p.waitForTimeout(1200);
        return true;
      }
    }
    return false;
  }

  async getCompanyRows() {
    const p = this.page;
    const rows = await p.locator("div.company-list").all();
    if (rows.length > 0) return rows;
    return p.locator("table tr, .table tr").all();
  }

  async findRow(issue) {
    const p = this.page;
    await this.waitReady();
    await p.waitForSelector('table, .company-list, [class*="table"]', { timeout: 10000 }).catch(() => {});
    await p.waitForTimeout(2000);

    const searched = await this.trySearch(issue.scrip || issue.companyName || "").catch(() => false);
    if (searched) {
      await p.waitForTimeout(1500);
    }

    const rows = await this.getCompanyRows();
    const needleA = (issue.scrip || "").toLowerCase();
    const needleB = (issue.companyName || "").toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const txt = (await row.textContent().catch(() => ""))?.toLowerCase();
      if (!txt) continue;
      const matchesScrip = needleA && txt.includes(needleA);
      const matchesCompany = needleB && txt.includes(needleB);
      if (matchesScrip || matchesCompany) {
        return row;
      }
    }
    log.warn("IPO row not found: " + (issue.scrip || issue.companyName));
    return null;
  }

  async rowHasApply(row) {
    await this.page.waitForTimeout(1000);
    const strategies = [
      { locator: row.locator('button.btn-issue').first() },
      { locator: row.locator('button >> i:text-is("Apply")').first() },
      { locator: row.locator('button:has(i:text("Apply"))').first() },
      { locator: row.locator('button:has-text("Apply"), a:has-text("Apply")').first() },
      { locator: row.locator('td:last-child button, div.action-buttons button, div[class*="action"] button').first(), checkText: true }
    ];
    for (const strategy of strategies) {
      const visible = await strategy.locator.isVisible({ timeout: 1500 }).catch(() => false);
      if (!visible) continue;
      if (strategy.checkText) {
        const text = await strategy.locator.innerText().catch(() => '');
        if (!/apply/i.test(text)) continue;
      }
      return true;
    }
    return false;
  }

  async rowHasEdit(row) {
    const b = row.locator('button:has-text("Edit"), a:has-text("Edit")').first();
    return await b.isVisible({ timeout: 1000 }).catch(() => false);
  }

  async readMinUnitAndShareValue() {
    const p = this.page;
    await p.waitForTimeout(1500);
    const body = await p.textContent("body").catch(() => "");

    const minUnitMatch = body.match(/MinUnit\s*[:\-]?\s*(\d+)/i);
    const shareValueMatch = body.match(
      /Share Value Per Unit\s*[:\-]?\s*(\d+\.?\d*)/i,
    );

    return {
      minUnit: minUnitMatch ? Number(minUnitMatch[1]) : null,
      shareValuePerUnit: shareValueMatch ? Number(shareValueMatch[1]) : null,
    };
  }

  async backToList() {
    const p = this.page;
    const back = p.locator(
      'button:has-text("←"), a:has-text("←"), .back-button, [class*="back" i]',
    ).first();
    
    if (await back.isVisible({ timeout: 1000 }).catch(() => false)) {
      await back.click();
      await p.waitForTimeout(2000);
      return;
    }
    
    await p.goBack().catch(() => {});
    await p.waitForTimeout(2000);
  }

  async _formLoaded(p) {
    const formKeywords = ['Bank', 'Kitta', 'CRN', 'Proceed', 'Disclaimer', 'Apply'];
    const visible = await p.locator(`text=/${formKeywords.join('|')}/i`).first().isVisible({ timeout: 5000 }).catch(() => false);
    return visible || /apply|form|ipo|kitta/i.test(p.url());
  }

  async clickApply(row) {
    const p = this.page;
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await p.waitForTimeout(2000);

    const btnByClass = row.locator('button.btn-issue').first();
    if (await btnByClass.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await btnByClass.boundingBox().catch(() => null);
      const isEnabled = await btnByClass.isEnabled().catch(() => false);
      if (box && isEnabled) {
        await btnByClass.scrollIntoViewIfNeeded().catch(() => {});
        await p.waitForTimeout(500);
        await btnByClass.hover({ timeout: 5000 }).catch(() => {});
        await p.waitForTimeout(500);
        let clicked = false;
        try {
          await btnByClass.click({ timeout: 5000 });
          clicked = true;
        } catch (_) {}
        if (!clicked) {
          try {
            await btnByClass.click({ force: true, timeout: 5000 });
            clicked = true;
          } catch (_) {}
        }
        if (!clicked) {
          try {
            await btnByClass.evaluate(el => el.click());
            clicked = true;
          } catch (_) {}
        }
        if (!clicked) {
          try {
            await btnByClass.evaluate(el => {
              el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, buttons: 1 }));
            });
            clicked = true;
          } catch (_) {}
        }
        if (clicked) {
          await p.waitForTimeout(4000);
          if (await this._formLoaded(p)) return;
        }
      }
    }

    const allButtons = await row.locator('button, a[role="button"], [onclick]').all();
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const btnText = await btn.innerText().catch(() => '');
      if (!/apply/i.test(btnText) || !(await btn.isVisible().catch(() => false))) continue;
      try {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.hover().catch(() => {});
        await p.waitForTimeout(300);
        await btn.click({ force: true, timeout: 5000 });
        await p.waitForTimeout(4000);
        if (await p.locator('text=/Bank|Kitta|CRN/i').first().isVisible({ timeout: 5000 }).catch(() => false)) return;
      } catch (_) {}
    }

    const xpathSelectors = [
      '//button[contains(@class, "btn-issue")]',
      '//button[.//i[contains(text(), "Apply")]]',
      '//button[contains(., "Apply")]',
      '//a[contains(., "Apply")]',
      '//button[contains(@class, "apply")]',
      '//*[@role="button" and contains(., "Apply")]'
    ];
    for (let i = 0; i < xpathSelectors.length; i++) {
      const btn = row.locator(`xpath=${xpathSelectors[i]}`).first();
      if (!(await btn.isVisible({ timeout: 2000 }).catch(() => false))) continue;
      try {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({ force: true, timeout: 5000 });
        await p.waitForTimeout(4000);
        if (await p.locator('text=/Bank|Kitta/i').first().isVisible({ timeout: 5000 }).catch(() => false)) return;
      } catch (_) {}
    }

    const applyLink = row.locator('a[href*="apply"], a[href*="asba"]').first();
    if (await applyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await applyLink.click({ force: true });
        await p.waitForTimeout(4000);
        if (await p.locator('text=/Bank|Kitta/i').first().isVisible({ timeout: 5000 }).catch(() => false)) return;
      } catch (_) {}
    }

    const allClickables = await row.locator('button, a, [onclick], [role="button"], input[type="button"]').all();
    for (let i = 0; i < allClickables.length; i++) {
      const el = allClickables[i];
      const text = await el.innerText().catch(() => '');
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      if (text.length < 50 && (text || tag === 'BUTTON')) {
        try {
          await el.click({ force: true, timeout: 3000 });
          await p.waitForTimeout(3000);
          if (await p.locator('text=/Bank|Kitta|CRN/i').first().isVisible({ timeout: 3000 }).catch(() => false)) return;
        } catch (_) {}
      }
    }

    log.warn("Apply button not found or not clickable after all strategies");
    throw new Error('Apply button not found or not clickable after all strategies');
  }

  /**
   * Open details view for an IPO row (if your UI has a details/view button)
   */
  async openDetails(row) {
    const p = this.page;
    
    const detailsSelectors = [
      'button:has-text("View")',
      'button:has-text("Details")',
      'a:has-text("View")',
      'button.btn-view',
      'i.fa-eye'
    ];
    
    for (const sel of detailsSelectors) {
      const btn = row.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await p.waitForTimeout(2000);
        return;
      }
    }
    
    // If no details button, just click the row
    await row.click();
    await p.waitForTimeout(2000);
  }
}

module.exports = { MyAsbaPage };