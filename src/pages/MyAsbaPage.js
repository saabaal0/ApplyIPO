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
    await p.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('[waitReady] Network not idle, continuing anyway');
    });
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
    
    console.log('═══════════════════════════════════════════');
    console.log('[findRow] Searching for IPO');
    console.log('═══════════════════════════════════════════');
    console.log('[Scrip]:', issue.scrip);
    console.log('[Company]:', issue.companyName);
    
    await this.waitReady();
    
    // Wait for table to be present
    await p.waitForSelector('table, .company-list, [class*="table"]', { 
      timeout: 10000 
    }).catch(() => {
      console.log('[findRow] WARNING: No table found on page');
    });
    
    // Extra wait for dynamic content
    await p.waitForTimeout(2000);

    // Try search to reduce pagination pain
    const searched = await this.trySearch(issue.scrip || issue.companyName || "").catch(() => false);
    console.log('[Search] Executed:', searched);
    
    if (searched) {
      // Wait for search to filter results
      await p.waitForTimeout(1500);
    }

    const rows = await this.getCompanyRows();
    console.log('[Rows] Total found:', rows.length);
    
    const needleA = (issue.scrip || "").toLowerCase();
    const needleB = (issue.companyName || "").toLowerCase();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const txt = (await row.textContent().catch(() => ""))?.toLowerCase();
      if (!txt) continue;
      
      const matchesScrip = needleA && txt.includes(needleA);
      const matchesCompany = needleB && txt.includes(needleB);
      
      if (matchesScrip || matchesCompany) {
        console.log(`[findRow] ✅ MATCH at row ${i}`);
        console.log('[Row Preview]:', txt.slice(0, 150).replace(/\s+/g, ' '));
        return row;
      }
    }

    console.log('[findRow] ❌ NO MATCH FOUND');
    return null;
  }

  async rowHasApply(row) {
    console.log('[rowHasApply] Checking for Apply button...');
    
    // Wait a bit for any dynamic content
    await this.page.waitForTimeout(1000);
    
    const strategies = [
      {
        name: 'button.btn-issue',
        locator: row.locator('button.btn-issue').first()
      },
      {
        name: 'button >> i:text-is("Apply")',
        locator: row.locator('button >> i:text-is("Apply")').first()
      },
      {
        name: 'button:has(i:text("Apply"))',
        locator: row.locator('button:has(i:text("Apply"))').first()
      },
      {
        name: 'Any button with Apply text',
        locator: row.locator('button:has-text("Apply"), a:has-text("Apply")').first()
      },
      {
        name: 'Last cell action button',
        locator: row.locator('td:last-child button, div.action-buttons button, div[class*="action"] button').first()
      }
    ];
    
    for (const strategy of strategies) {
      const visible = await strategy.locator.isVisible({ timeout: 1500 }).catch(() => false);
      const text = visible ? await strategy.locator.innerText().catch(() => '') : '';
      
      console.log(`  [${strategy.name}]: ${visible ? '✅ FOUND' : '❌ NOT FOUND'}${text ? ` ("${text.trim()}")` : ''}`);
      
      if (visible && (strategy.name.includes('Last cell') ? /apply/i.test(text) : true)) {
        return true;
      }
    }
    
    console.log('[rowHasApply] ❌ NO APPLY BUTTON DETECTED');
    return false;
  }

  async rowHasEdit(row) {
    const b = row.locator('button:has-text("Edit"), a:has-text("Edit")').first();
    const hasEdit = await b.isVisible({ timeout: 1000 }).catch(() => false);
    console.log('[rowHasEdit]:', hasEdit ? '✅ YES (already applied)' : '❌ NO');
    return hasEdit;
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

  async clickApply(row) {
    const p = this.page;
    
    console.log('\n═══════════════════════════════════════════');
    console.log('[clickApply] STARTING APPLY BUTTON CLICK');
    console.log('═══════════════════════════════════════════\n');
    
    // Log row content for debugging
    const rowText = await row.innerText().catch(() => 'ERROR_GETTING_TEXT');
    console.log('[Row Content (first 200 chars)]:\n', rowText.slice(0, 200));
    
    // Take screenshot before attempting click
    const timestamp = Date.now();
    await p.screenshot({ 
      path: `debug-before-click-${timestamp}.png`, 
      fullPage: true 
    }).catch(() => console.log('[Screenshot] Failed to capture'));
    
    // Wait for row to be stable and visible
    await row.waitFor({ state: 'visible', timeout: 15000 });
    await p.waitForTimeout(2000); // Extra wait for JS to settle
    
    // ═════════════════════════════════════════════════════════════════
    // STRATEGY 1: Direct class selector (button.btn-issue)
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[STRATEGY 1] Trying button.btn-issue');
    console.log('─────────────────────────────────────');
    
    const btnByClass = row.locator('button.btn-issue').first();
    const classVisible = await btnByClass.isVisible({ timeout: 3000 }).catch(() => false);
    
    console.log('[button.btn-issue] Visible:', classVisible);
    
    if (classVisible) {
      const box = await btnByClass.boundingBox().catch(() => null);
      const isEnabled = await btnByClass.isEnabled().catch(() => false);
      const btnText = await btnByClass.innerText().catch(() => '');
      
      console.log('[button.btn-issue] Bounding box:', box ? `${box.width}x${box.height} at (${box.x}, ${box.y})` : 'null');
      console.log('[button.btn-issue] Enabled:', isEnabled);
      console.log('[button.btn-issue] Text:', btnText);
      
      if (box && isEnabled) {
        // Scroll into view
        await btnByClass.scrollIntoViewIfNeeded().catch(() => {
          console.log('[button.btn-issue] scrollIntoView failed');
        });
        await p.waitForTimeout(500);
        
        // Hover first
        await btnByClass.hover({ timeout: 5000 }).catch(() => {
          console.log('[button.btn-issue] Hover failed');
        });
        await p.waitForTimeout(500);
        
        let clicked = false;
        
        // Attempt 1: Normal click
        if (!clicked) {
          try {
            console.log('[Attempt 1] Normal click...');
            await btnByClass.click({ timeout: 5000 });
            console.log('[Attempt 1] ✅ SUCCESS');
            clicked = true;
          } catch (e) {
            console.log('[Attempt 1] ❌ FAILED:', e.message);
          }
        }
        
        // Attempt 2: Force click
        if (!clicked) {
          try {
            console.log('[Attempt 2] Force click...');
            await btnByClass.click({ force: true, timeout: 5000 });
            console.log('[Attempt 2] ✅ SUCCESS');
            clicked = true;
          } catch (e) {
            console.log('[Attempt 2] ❌ FAILED:', e.message);
          }
        }
        
        // Attempt 3: JavaScript click
        if (!clicked) {
          try {
            console.log('[Attempt 3] JavaScript click...');
            await btnByClass.evaluate(el => el.click());
            console.log('[Attempt 3] ✅ SUCCESS');
            clicked = true;
          } catch (e) {
            console.log('[Attempt 3] ❌ FAILED:', e.message);
          }
        }
        
        // Attempt 4: Dispatch click event
        if (!clicked) {
          try {
            console.log('[Attempt 4] Dispatch click event...');
            await btnByClass.evaluate(el => {
              const event = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
              });
              el.dispatchEvent(event);
            });
            console.log('[Attempt 4] ✅ SUCCESS');
            clicked = true;
          } catch (e) {
            console.log('[Attempt 4] ❌ FAILED:', e.message);
          }
        }
        
        if (clicked) {
          await p.waitForTimeout(4000); // Wait for navigation
          
          // Take screenshot after click
          await p.screenshot({ 
            path: `debug-after-click-${timestamp}.png`, 
            fullPage: true 
          }).catch(() => {});
          
          const currentURL = p.url();
          console.log('\n[After Click] Current URL:', currentURL);
          
          // Check if form loaded
          const formKeywords = ['Bank', 'Kitta', 'CRN', 'Proceed', 'Disclaimer', 'Apply'];
          const formVisible = await p.locator(`text=/${formKeywords.join('|')}/i`)
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false);
          
          console.log('[After Click] Form visible:', formVisible);
          console.log('[After Click] URL contains apply/form:', /apply|form|ipo|kitta/i.test(currentURL));
          
          if (formVisible || /apply|form|ipo|kitta/i.test(currentURL)) {
            console.log('\n✅ ✅ ✅ CLICK SUCCESSFUL - Form loaded ✅ ✅ ✅\n');
            return;
          } else {
            console.log('\n⚠️  Click executed but form not detected, continuing to next strategy...\n');
          }
        }
      } else {
        console.log('[button.btn-issue] Button not in valid state (disabled or no bounding box)');
      }
    }
    
    // ═════════════════════════════════════════════════════════════════
    // STRATEGY 2: Find ALL buttons in row and try each one
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[STRATEGY 2] Finding ALL buttons in row');
    console.log('─────────────────────────────────────');
    
    const allButtons = await row.locator('button, a[role="button"], [onclick]').all();
    console.log('[All Buttons] Count:', allButtons.length);
    
    for (let i = 0; i < allButtons.length; i++) {
      const btn = allButtons[i];
      const btnText = await btn.innerText().catch(() => '');
      const btnClass = await btn.getAttribute('class').catch(() => '');
      const btnVisible = await btn.isVisible().catch(() => false);
      
      console.log(`  [Button ${i}] Text: "${btnText.trim()}", Class: "${btnClass}", Visible: ${btnVisible}`);
      
      if (/apply/i.test(btnText) && btnVisible) {
        console.log(`  [Button ${i}] ⭐ Attempting click (contains "Apply")`);
        
        try {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.hover().catch(() => {});
          await p.waitForTimeout(300);
          await btn.click({ force: true, timeout: 5000 });
          await p.waitForTimeout(4000);
          
          const formVisible = await p.locator('text=/Bank|Kitta|CRN/i')
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false);
          
          if (formVisible) {
            console.log(`\n✅ ✅ ✅ CLICK SUCCESSFUL via Strategy 2 (Button ${i}) ✅ ✅ ✅\n`);
            return;
          } else {
            console.log(`  [Button ${i}] Clicked but form not loaded`);
          }
        } catch (e) {
          console.log(`  [Button ${i}] Click failed:`, e.message);
        }
      }
    }
    
    // ═════════════════════════════════════════════════════════════════
    // STRATEGY 3: XPath selectors (most robust)
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[STRATEGY 3] Trying XPath selectors');
    console.log('─────────────────────────────────────');
    
    const xpathSelectors = [
      '//button[contains(@class, "btn-issue")]',
      '//button[.//i[contains(text(), "Apply")]]',
      '//button[contains(., "Apply")]',
      '//a[contains(., "Apply")]',
      '//button[contains(@class, "apply")]',
      '//*[@role="button" and contains(., "Apply")]'
    ];
    
    for (let i = 0; i < xpathSelectors.length; i++) {
      const xpath = xpathSelectors[i];
      console.log(`  [XPath ${i}]`, xpath);
      
      const btn = row.locator(`xpath=${xpath}`).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      
      if (visible) {
        console.log(`  [XPath ${i}] ✅ Found visible element`);
        
        try {
          await btn.scrollIntoViewIfNeeded().catch(() => {});
          await btn.click({ force: true, timeout: 5000 });
          await p.waitForTimeout(4000);
          
          const formVisible = await p.locator('text=/Bank|Kitta/i')
            .first()
            .isVisible({ timeout: 5000 })
            .catch(() => false);
          
          if (formVisible) {
            console.log(`\n✅ ✅ ✅ CLICK SUCCESSFUL via XPath ${i} ✅ ✅ ✅\n`);
            return;
          }
        } catch (e) {
          console.log(`  [XPath ${i}] Click failed:`, e.message);
        }
      }
    }
    
    // ═════════════════════════════════════════════════════════════════
    // STRATEGY 4: Try to find Apply by href (if it's a link)
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[STRATEGY 4] Looking for Apply link with href');
    console.log('─────────────────────────────────────');
    
    const applyLink = row.locator('a[href*="apply"], a[href*="asba"]').first();
    const linkVisible = await applyLink.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (linkVisible) {
      const href = await applyLink.getAttribute('href').catch(() => '');
      console.log('[Apply Link] Found, href:', href);
      
      try {
        await applyLink.click({ force: true });
        await p.waitForTimeout(4000);
        
        const formVisible = await p.locator('text=/Bank|Kitta/i')
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        
        if (formVisible) {
          console.log('\n✅ ✅ ✅ CLICK SUCCESSFUL via Apply Link ✅ ✅ ✅\n');
          return;
        }
      } catch (e) {
        console.log('[Apply Link] Click failed:', e.message);
      }
    }
    
    // ═════════════════════════════════════════════════════════════════
    // STRATEGY 5: Nuclear option - click everything that might work
    // ═════════════════════════════════════════════════════════════════
    console.log('\n[STRATEGY 5] Nuclear option - trying all clickable elements');
    console.log('─────────────────────────────────────');
    
    const allClickables = await row.locator('button, a, [onclick], [role="button"], input[type="button"]').all();
    console.log('[Clickables] Found:', allClickables.length);
    
    for (let i = 0; i < allClickables.length; i++) {
      const el = allClickables[i];
      const text = await el.innerText().catch(() => '');
      const tag = await el.evaluate(e => e.tagName).catch(() => '');
      
      // Only try elements that might be the Apply button
      if (text.length < 50 && (text || tag === 'BUTTON')) {
        console.log(`  [Element ${i}] ${tag}: "${text.trim()}"`);
        
        try {
          await el.click({ force: true, timeout: 3000 });
          await p.waitForTimeout(3000);
          
          const formVisible = await p.locator('text=/Bank|Kitta|CRN/i')
            .first()
            .isVisible({ timeout: 3000 })
            .catch(() => false);
          
          if (formVisible) {
            console.log(`\n✅ ✅ ✅ CLICK SUCCESSFUL via Nuclear Option (Element ${i}) ✅ ✅ ✅\n`);
            return;
          }
        } catch (e) {
          // Silent fail, keep trying
        }
      }
    }
    
    // ═════════════════════════════════════════════════════════════════
    // ALL STRATEGIES FAILED
    // ═════════════════════════════════════════════════════════════════
    console.log('\n❌ ❌ ❌ ALL CLICK STRATEGIES FAILED ❌ ❌ ❌');
    console.log('Taking final debug screenshot...\n');
    
    await p.screenshot({ 
      path: `debug-click-failed-${timestamp}.png`, 
      fullPage: true 
    }).catch(() => {});
    
    // Save page HTML for analysis
    const html = await p.content().catch(() => '');
    const fs = require('fs');
    fs.writeFileSync(`debug-page-${timestamp}.html`, html);
    console.log(`Saved page HTML to: debug-page-${timestamp}.html`);
    
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