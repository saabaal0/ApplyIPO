// src/index.js
const { getConfig } = require("./config");
const log = require("./utils/logger");
const { MeroShareApi } = require("./api/meroshareApi");
const { classify } = require("./services/IssueService");
const { AutomationRunner } = require("./services/AutomationRunner");
const { TelegramClient } = require("./telegram/TelegramClient");
const { buildDailyReport } = require("./telegram/ReportBuilder");
const { retry } = require("./utils/retry");

async function main() {
  const cfg = getConfig();

  const tg = new TelegramClient(cfg.telegram);
  const api = new MeroShareApi({
    apiBaseUrl: cfg.meroshare.apiBaseUrl,
    clientId: cfg.meroshare.clientId,
    username: cfg.meroshare.username,
    password: cfg.meroshare.password,
  });

  const report = {
    foundCount: 0,
    eligibleCount: 0,
    applied: [],
    alreadyApplied: [],
    skipped: [],
    notEligible: [],
    manualCheck: [],
    errors: [],
  };

  let token;
  try {
    token = await api.login();
    log.info("API login successful");
  } catch (e) {
    report.errors.push(e.message);
    await tg.send(buildDailyReport(report));
    throw e;
  }

  let rawIssues = [];
  try {
    rawIssues = await api.getApplicableIssues(token);
  } catch (e) {
    report.errors.push(`ApplicableIssue: ${e.message}`);
    token = await api.login().catch(() => token);
    rawIssues = await api.getApplicableIssues(token).catch(() => []);
  }

  report.foundCount = rawIssues.length;

  // Cross-check against active applicant forms (real source of truth)
  let activeForms = [];
  try {
    activeForms = await api.getAllActiveApplicantForms(token, { pageSize: 200, maxPages: 5 });
    log.info(`Active applicant forms found: ${activeForms.length}`);
  } catch (e) {
    log.warn("Failed to fetch active forms: " + e.message);
  }

  const appliedCompanyIds = new Set(activeForms.map(f => Number(f.companyShareId)));

  // Classify using applicantFormId + active forms check (ignore statusName from applicableIssue)
  const classified = rawIssues.map(issue => {
    const fromActiveForms = appliedCompanyIds.has(Number(issue.companyShareId));
    const c = classify(issue);
    return {
      ...c,
      alreadyApplied: fromActiveForms || Boolean(issue.applicantFormId),
      eligible: !fromActiveForms && !Boolean(issue.applicantFormId) && c.eligible,
      skipReason: fromActiveForms
        ? "Already applied (found in active forms)"
        : Boolean(issue.applicantFormId)
        ? "Already applied (applicantFormId present)"
        : c.skipReason || "none"
    };
  });

  const eligible = classified.filter(i => i.eligible);
  log.info(`Issues: ${rawIssues.length} found, ${eligible.length} eligible to apply`);
  report.eligibleCount = eligible.length;

  // Fill buckets based on classification
  for (const i of classified) {
    if (i.alreadyApplied) {
      report.alreadyApplied.push({
        scrip: i.scrip,
        companyName: i.companyName,
        note: i.skipReason || `Status: ${i.statusName || "UNKNOWN"}`
      });
    } else if (!i.eligible) {
      if (i.skipReason) {
        report.skipped.push({
          scrip: i.scrip,
          companyName: i.companyName,
          note: i.skipReason
        });
      }
    }
  }

  const needsUI = eligible.length > 0;
  let runner = null;

  try {
    if (needsUI) {
      runner = new AutomationRunner(
        {
          baseUrl: cfg.meroshare.baseUrl,
          loginUrl: cfg.meroshare.loginUrl,
          dpName: cfg.meroshare.dpName,
          username: cfg.meroshare.username,
          password: cfg.meroshare.password,
          bankName: cfg.meroshare.bankName,
          accountNo: cfg.meroshare.accountNo,
          crn: cfg.meroshare.crn,
          txnPin: cfg.meroshare.txnPin,
        },
        cfg.runtime,
      );

      await runner.start();
      await runner.login();

      for (const issue of eligible) {
        // Right-share holding check
        if (issue.kind === "RIGHT_SHARE") {
          let bal = 0;
          try {
            bal = await runner.getHoldingForScrip(issue.scrip);
          } catch (e) {
            report.manualCheck.push({
              scrip: issue.scrip,
              companyName: issue.companyName,
              note: `Could not verify holding: ${e.message}`
            });
            continue;
          }
          if (bal <= 0) {
            report.notEligible.push({
              scrip: issue.scrip,
              companyName: issue.companyName,
              note: "Right Share: no parent holding"
            });
            continue;
          }
        }

        const result = await runner.applyIssue(issue, null);

        if (result.status === "already") {
          report.alreadyApplied.push({
            scrip: issue.scrip,
            companyName: issue.companyName,
            note: result.note
          });
          continue;
        }

        if (result.status === "failed" || result.status === "manual") {
          report.manualCheck.push({
            scrip: issue.scrip,
            companyName: issue.companyName,
            note: result.note
          });
          continue;
        }

        // ──────────────────────────────────────────────
        // VERIFICATION: Re-login + poll active forms (strongest confirmation)
        // ──────────────────────────────────────────────
        try {
          log.info(`[Verification] Re-logging in to API for fresh token (${issue.scrip})`);
          token = await api.login();
          log.info('[Verification] API re-login successful');
        } catch (e) {
          log.warn('[Verification] API re-login failed:', e.message);
        }

        let verify = null;
        const maxWaitMs = 30000; // 30 seconds max poll
        const start = Date.now();

        while (Date.now() - start < maxWaitMs) {
          try {
            const forms = await api.getAllActiveApplicantForms(token);
            verify = forms.find(f => Number(f.companyShareId) === Number(issue.companyShareId));
            if (verify) {
              log.info('[Verification] Found in active forms - success');
              break;
            }
          } catch (e) {
            log.warn('[Verification] Active forms poll error:', e.message);
          }
          await new Promise(r => setTimeout(r, 3000)); // 3s interval
        }

        if (verify) {
          report.applied.push({
            scrip: issue.scrip,
            companyName: issue.companyName,
            note: `Submitted & confirmed in active forms (status: ${verify.statusName || 'unknown'})`
          });
        } else {
          // UI fallback with re-login check
          try {
            log.info(`[Verification UI] Checking session for ${issue.scrip}`);
            const isLoggedIn = await runner.isLoggedIn();
            if (!isLoggedIn) {
              log.info('[Verification UI] Session expired - re-logging in');
              await runner.login();
              log.info('[Verification UI] UI re-login successful');
            } else {
              log.info('[Verification UI] Still logged in');
            }
          } catch (e) {
            log.warn('[Verification UI] Re-login attempt failed:', e.message);
          }

          const ui = await runner.verifyInApplicationReport(issue.scrip).catch(() => ({ found: false }));
          if (ui?.found) {
            report.applied.push({
              scrip: issue.scrip,
              companyName: issue.companyName,
              note: `Submitted (verified in UI Application Report: ${ui.status || 'UNKNOWN'})`
            });
          } else {
            report.manualCheck.push({
              scrip: issue.scrip,
              companyName: issue.companyName,
              note: 'Applied but no confirmation yet — check manually'
            });
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

  if (report.errors.length > 0 && report.applied.length === 0) {
    throw new Error(report.errors.join(" | "));
  }
}

main().catch(async e => {
  log.error(e.stack || e.message);
  process.exitCode = 1;
});