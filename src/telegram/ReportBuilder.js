const { humanStatus } = require('../utils/applicationStatus');


function fmtDateTime(d = new Date()) {
  // Similar to: 05/02/2026, 15:37:47
  return d.toLocaleString('en-GB', { hour12: false });
}

function arr(x) {
  return Array.isArray(x) ? x : [];
}

function addList(lines, title, items, lineFn) {
  if (!items || items.length === 0) return;
  lines.push(title);
  for (const it of items) {
    lines.push(`• ${lineFn(it)}`);
  }
  lines.push('');
}

function formatIssueLine(x) {
  const scrip = x?.scrip || '';
  const name = x?.companyName || '';
  const note = (x?.note || x?.reason || '').trim();
  return note ? `${scrip} — ${name} (${note})` : `${scrip} — ${name}`;
}


function buildDailyReport(result) {
  const lines = [];

  // Optional label set by multi-user runner (USER_LABEL)
  const who = (process.env.USER_LABEL || '').trim();
  if (who) {
    lines.push(`👤 ${who}`, '');
  }

  lines.push('MeroShare Bot Report');
  lines.push(fmtDateTime(new Date()));
  lines.push('');

  // Normalize buckets
  const found = Number(result?.summary?.found ?? result?.found ?? 0);
  const eligible = Number(result?.summary?.eligible ?? result?.eligible ?? 0);
  const applied = arr(result?.applied);
  const alreadyApplied = arr(result?.alreadyApplied);
  const skipped = arr(result?.skipped);
  const notEligible = arr(result?.notEligible);
  const manualCheck = arr(result?.manualCheck);

  lines.push('Summary');
  lines.push(`• Found: ${found}`);
  lines.push(`• Eligible: ${eligible}`);
  lines.push(`• Applied: ${applied.length}`);
  lines.push(`• Already applied: ${alreadyApplied.length}`);
  lines.push(`• Skipped: ${skipped.length}`);
  lines.push(`• Not eligible: ${notEligible.length}`);
  lines.push(`• Manual check: ${manualCheck.length}`);
  lines.push('');

  // If nothing today (optional convenience)
  if (
    eligible === 0 &&
    applied.length === 0 &&
    alreadyApplied.length === 0 &&
    manualCheck.length === 0
  ) {
    lines.push('No IPO today');
  }
  

  addList(lines, '✅ Applied', applied, formatIssueLine);
  addList(lines, 'ℹ️ Already applied', alreadyApplied, formatIssueLine);
  addList(lines, '⏭️ Skipped', skipped, formatIssueLine);
  addList(lines, '🚫 Not eligible', notEligible, formatIssueLine);
  addList(lines, '⚠️ Manual check', manualCheck, formatIssueLine);

  return lines.join('\n').trim();
}

module.exports = { buildDailyReport };
