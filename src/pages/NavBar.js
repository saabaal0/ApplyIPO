class NavBar {
  /** @param {import('playwright').Page} page */
  constructor(page) {
    this.page = page;
  }

  async gotoMenu(label) {
    const p = this.page;
    await p.waitForTimeout(800);

    const selectors = [
      `a:has-text("${label}")`,
      `button:has-text("${label}")`,
      `li:has-text("${label}")`,
      `nav a:has-text("${label}")`,
      `text=${label}`
    ];

    for (const sel of selectors) {
      const el = p.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        await p.waitForTimeout(2500);
        return;
      }
    }

    // Some UIs need the hamburger menu expanded; try clicking it once.
    const hamburger = p.locator('button:has([class*="menu" i]), .navbar-toggler, button:has-text("Menu")').first();
    if (await hamburger.isVisible({ timeout: 1000 }).catch(() => false)) {
      await hamburger.click();
      await p.waitForTimeout(800);
      for (const sel of selectors) {
        const el = p.locator(sel).first();
        if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
          await el.click();
          await p.waitForTimeout(2500);
          return;
        }
      }
    }

    throw new Error(`Could not find menu: ${label}`);
  }

  async gotoMyAsba() {
    return this.gotoMenu('My ASBA');
  }

  async gotoMyShare() {
    return this.gotoMenu('My Share');
  }

  async gotoApplicationReport() {
    return this.gotoMenu('Application Report');
  }
}

module.exports = { NavBar };
