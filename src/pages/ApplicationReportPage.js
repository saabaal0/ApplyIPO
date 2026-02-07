class ApplicationReportPage {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async waitReady() {
    await this.page.waitForSelector('body', { timeout: 30000 });
    await this.page.waitForTimeout(1200);
  }

  async search(text) {
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

  async findByScrip(scrip) {
    await this.waitReady();
    await this.search(scrip).catch(() => {});

    const rows = this.page.locator('table tbody tr, .table tbody tr');
    const rc = await rows.count().catch(() => 0);
    const needle = scrip.toLowerCase();
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const txt = ((await row.textContent().catch(() => '')) || '').toLowerCase();
      if (txt.includes(needle)) {
        // best effort extract statusName from row text
        const m = txt.match(/(transaction_success|approved|create_approve|pending|failed|rejected)/i);
        return {
          found: true,
          status: m?.[0] ? m[0].toUpperCase() : null,
          raw: (await row.textContent().catch(() => '') || '').trim()
        };
      }
    }

    return { found: false, status: null, raw: null };
  }
}

module.exports = { ApplicationReportPage };
