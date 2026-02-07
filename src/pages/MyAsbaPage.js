const log = require('../utils/logger');

class MyAsbaPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async waitReady() {
    const p = this.page;
    await p.waitForTimeout(1500);
    await p.waitForSelector('body', { timeout: 30000 });
  }

  async trySearch(text) {
    const p = this.page;
    const inputs = [
      'div.dataTables_filter input[type="search"]',
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[aria-label*="Search" i]'
    ];

    for (const sel of inputs) {
      const inp = p.locator(sel).first();
      if (await inp.isVisible({ timeout: 1000 }).catch(() => false)) {
        await inp.fill('');
        await inp.fill(text);
        await p.waitForTimeout(1200);
        return true;
      }
    }
    return false;
  }

  async getCompanyRows() {
    const p = this.page;
    const rows = await p.locator('div.company-list').all();
    if (rows.length > 0) return rows;
    return p.locator('table tr, .table tr').all();
  }

  async findRow(issue) {
    const p = this.page;
    await this.waitReady();

    // Try search to reduce pagination pain
    await this.trySearch(issue.scrip || issue.companyName || '').catch(() => {});

    const rows = await this.getCompanyRows();
    const needleA = (issue.scrip || '').toLowerCase();
    const needleB = (issue.companyName || '').toLowerCase();

    for (const row of rows) {
      const txt = (await row.textContent().catch(() => ''))?.toLowerCase();
      if (!txt) continue;
      if (needleA && txt.includes(needleA)) return row;
      if (needleB && txt.includes(needleB)) return row;
    }

    return null;
  }

  async rowHasApply(row) {
    // Text-based apply
    const byText = row.locator([
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      '[role="button"]:has-text("Apply")',
      'input[value*="Apply" i]'
    ].join(',')).first();
  
    if (await byText.isVisible({ timeout: 800 }).catch(() => false)) return true;
  
    // Icon-based apply in last td (common)
    const lastCell = row.locator('td').last();
    const anyAction = lastCell.locator('button, a, [role="button"], i, span').first();
    return await anyAction.isVisible({ timeout: 800 }).catch(() => false);
  }
  

  async rowHasEdit(row) {
    const b = row.locator('button:has-text("Edit"), a:has-text("Edit")').first();
    return await b.isVisible({ timeout: 1000 }).catch(() => false);
  }


  async readMinUnitAndShareValue() {
    const p = this.page;
    await p.waitForTimeout(1500);
    const body = await p.textContent('body').catch(() => '');

    const minUnitMatch = body.match(/MinUnit\s*[:\-]?\s*(\d+)/i);
    const shareValueMatch = body.match(/Share Value Per Unit\s*[:\-]?\s*(\d+\.?\d*)/i);

    return {
      minUnit: minUnitMatch ? Number(minUnitMatch[1]) : null,
      shareValuePerUnit: shareValueMatch ? Number(shareValueMatch[1]) : null
    };
  }

  async backToList() {
    const p = this.page;
    const back = p.locator('button:has-text("←"), a:has-text("←"), .back-button, [class*="back" i]').first();
    if (await back.isVisible({ timeout: 1000 }).catch(() => false)) {
      await back.click();
      await p.waitForTimeout(2000);
      return;
    }
    await p.goBack().catch(() => {});
    await p.waitForTimeout(2000);
  }
  async clickApply(row) {
    const p = this.page;
  
    // 1) Try text-based Apply buttons/links inside the row
    const byText = row.locator([
      'button:has-text("Apply")',
      'a:has-text("Apply")',
      '[role="button"]:has-text("Apply")',
      'input[value*="Apply" i]'
    ].join(',')).first();
  
    if (await byText.isVisible({ timeout: 1200 }).catch(() => false)) {
      await byText.click({ timeout: 5000 });
      await p.waitForTimeout(1500);
      return;
    }
  
    // 2) Fallback: action column is usually the LAST td
    // Click the first button/link/icon-like element in the last cell.
    const lastCell = row.locator('td').last();
  
    const actionCandidate = lastCell.locator([
      'button',
      'a',
      '[role="button"]',
      'i',
      'span'
    ].join(',')).first();
  
    // If it exists, click it; force helps with hover-hidden UI
    if (await actionCandidate.isVisible({ timeout: 1200 }).catch(() => false)) {
      await actionCandidate.click({ timeout: 5000, force: true });
      await p.waitForTimeout(1500);
      return;
    }
  
    // 3) Final fallback: try clicking ONLY within last cell (not company name)
    await lastCell.click({ timeout: 5000, force: true });
    await p.waitForTimeout(1500);
  
    // If still not navigated, fail
    throw new Error('Apply control not found in issue row');
  }
  
}

module.exports = { MyAsbaPage };
