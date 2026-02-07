class MySharePage {
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

  async getHeaderIndexMap() {
    const p = this.page;
    const headerCells = p.locator('table thead tr th, .table thead tr th');
    const count = await headerCells.count().catch(() => 0);
    const map = {};
    for (let i = 0; i < count; i++) {
      const t = (await headerCells.nth(i).textContent().catch(() => ''))?.trim().toLowerCase();
      if (!t) continue;
      map[t] = i;
    }
    return map;
  }

  async findRowByScrip(scrip) {
    const p = this.page;
    const rows = p.locator('table tbody tr, .table tbody tr');
    const rc = await rows.count().catch(() => 0);
    const needle = scrip.toLowerCase();
    for (let i = 0; i < rc; i++) {
      const row = rows.nth(i);
      const txt = (await row.textContent().catch(() => ''))?.toLowerCase();
      if (txt && txt.includes(needle)) return row;
    }
    return null;
  }

  async getCurrentBalance(scrip) {
    await this.waitReady();
    await this.search(scrip).catch(() => {});

    // No record quick check
    const body = await this.page.textContent('body').catch(() => '');
    if (/No Record/i.test(body)) return 0;

    const row = await this.findRowByScrip(scrip);
    if (!row) return 0;

    // Best effort to locate the "Current Balance" cell
    const headerMap = await this.getHeaderIndexMap();

    // Try exact match first
    let idx = null;
    for (const [k, v] of Object.entries(headerMap)) {
      if (k.includes('current') && k.includes('balance')) {
        idx = v;
        break;
      }
    }

    if (idx !== null) {
      const cell = row.locator('td').nth(idx);
      const txt = (await cell.textContent().catch(() => ''))?.trim();
      const num = Number(String(txt).replace(/[^0-9.]/g, ''));
      return Number.isFinite(num) ? num : 0;
    }

    // Fallback: parse numbers from the row and return the last number-ish token
    const txt = (await row.textContent().catch(() => '')) || '';
    const nums = txt.match(/\d+(?:\.\d+)?/g);
    if (!nums || nums.length === 0) return 0;
    return Number(nums[nums.length - 1]) || 0;
  }
}

module.exports = { MySharePage };
