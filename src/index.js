const { getConfig } = require('./config');
const log = require('./utils/logger');
const { MeroShareApi } = require('./api/meroshareApi');
const { classify } = require('./services/IssueService');
const { AutomationRunner } = require('./services/AutomationRunner');
const { TelegramClient } = require('./telegram/TelegramClient');
const { buildDailyReport } = require('./telegram/ReportBuilder');
const { retry } = require('./utils/retry');

async function main() {
  const cfg = getConfig();

  const tg = new TelegramClient(cfg.telegram);
  const api = new MeroShareApi({
    apiBaseUrl: cfg.meroshare.apiBaseUrl,
    clientId: cfg.meroshare.clientId,
    username: cfg.meroshare.username,
    password: cfg.meroshare.password
  });

  const report = {
    foundCount: 0,
    eligibleCount: 0,
    applied: [],
    alreadyApplied: [],
    skipped: [],
    notEligible: [],
    manualCheck: [],
    errors: []
  };

  let token;
  try {
    token = await api.login();
  } catch (e) {
    report.errors.push(e.message);
    await tg.send(buildDailyReport(report));
    throw e;
  }

  let rawIssues = [];
  try {
    rawIssues = await api.getApplicableIssues(token);
  } catch (e) {
    // try re-login once
    report.errors.push(`ApplicableIssue: ${e.message}`);
    token = await api.login().catch(() => token);
    rawIssues = await api.getApplicableIssues(token).catch(() => []);
  }

  report.foundCount = rawIssues.length;

  const classified = rawIssues.map(classify);

  const eligible = classified.filter((i) => i.eligible);
  report.eligibleCount = eligible.length;

  // Fill already applied / skipped buckets based on API
  for (const i of classified) {
    if (i.alreadyApplied) {
      const note = i.doneState ? `Status: ${i.statusName} (${i.doneState})` : `Status: ${i.statusName || 'UNKNOWN'}`;
      report.alreadyApplied.push({ scrip: i.scrip, companyName: i.companyName, note });
    } else if (!i.eligible) {
      if (i.skipReason) report.skipped.push({ scrip: i.scrip, companyName: i.companyName, note: i.skipReason });
    }
  }

  // If nothing to apply and no right-share eligibility checks needed, just notify.
  const needsUI = eligible.length > 0;
  let runner = null;

  try {
    if (needsUI) {
      runner = new AutomationRunner({
        baseUrl: cfg.meroshare.baseUrl,
        loginUrl: cfg.meroshare.loginUrl,
        dpName: cfg.meroshare.dpName,
        username: cfg.meroshare.username,
        password: cfg.meroshare.password,
        bankName: cfg.meroshare.bankName,
        accountNo: cfg.meroshare.accountNo,
        crn: cfg.meroshare.crn,
        txnPin: cfg.meroshare.txnPin
      }, cfg.runtime);

      await runner.start();
      await runner.login();

      for (const issue of eligible) {
        // Right Share eligibility: must hold parent company > 0
        if (issue.kind === 'RIGHT_SHARE') {
          let bal = 0;
          try {
            bal = await runner.getHoldingForScrip(issue.scrip);
          } catch (e) {
            report.manualCheck.push({ scrip: issue.scrip, companyName: issue.companyName, note: `Could not verify holding (error: ${e.message})` });
            continue;
          }

          if (!bal || bal <= 0) {
            report.notEligible.push({ scrip: issue.scrip, companyName: issue.companyName, note: 'Right Share: parent holding is 0 (skipped)' });
            continue;
          }
        }

        const result = await runner.applyIssue(issue, null);

        if (result.status === 'already') {
          report.alreadyApplied.push({ scrip: issue.scrip, companyName: issue.companyName, note: result.note });
          continue;
        }

        if (result.status === 'failed') {
          report.manualCheck.push({ scrip: issue.scrip, companyName: issue.companyName, note: result.note });
          continue;
        }

        if (result.status === 'manual') {
          report.manualCheck.push({ scrip: issue.scrip, companyName: issue.companyName, note: result.note });
          continue;
        }

        // Applied: verify via API first
        const verify = await retry(async () => {
          let list = await api.getApplicableIssues(token);
          const found = list.find((x) => Number(x.companyShareId) === Number(issue.companyShareId));
          return found || null;
        }, {
          retries: 2,
          delayMs: 1500,
          onRetry: (e, attempt) => log.warn(`Verify retry ${attempt} for ${issue.scrip}: ${e.message}`)
        }).catch(() => null);

        if (verify && (verify.applicantFormId || ['TRANSACTION_SUCCESS', 'APPROVED'].includes(String(verify.statusName || '').toUpperCase()))) {
          report.applied.push({
            scrip: issue.scrip,
            companyName: issue.companyName,
            note: `Submitted. Status: ${verify.statusName}${verify.applicantFormId ? ` (formId ${verify.applicantFormId})` : ''}`
          });
        } else {
          // UI fallback
          const ui = await runner.verifyInApplicationReport(issue.scrip).catch(() => ({ found: false }));
          if (ui?.found) {
            report.applied.push({ scrip: issue.scrip, companyName: issue.companyName, note: `Submitted (verified in Application Report: ${ui.status || 'UNKNOWN'})` });
          } else {
            report.manualCheck.push({ scrip: issue.scrip, companyName: issue.companyName, note: 'Applied but could not verify—check Current Issue / Application Report' });
          }
        }
      }
    }
  } catch (e) {
    report.errors.push(e.message);
  } finally {
    await runner?.stop();
  }

  const msg = buildDailyReport(report);
  await tg.send(msg);

  // If we had errors and nothing applied, fail the action to get visibility in logs.
  if (report.errors.length > 0 && report.applied.length === 0) {
    throw new Error(report.errors.join(' | '));
  }
}

main().catch(async (e) => {
  // One more attempt to at least print something useful in Actions logs
  log.error(e.stack || e.message);
  process.exitCode = 1;
});
