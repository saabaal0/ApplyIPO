const DONE_STATUSES = new Set(['TRANSACTION_SUCCESS', 'APPROVED']);

function norm(s) {
  return (s ?? '').toString().trim();
}

function isOrdinaryShares(issue) {
  return /ordinary\s+shares?/i.test(norm(issue.shareGroupName));
}

function isGeneralPublic(issue) {
  return norm(issue.subGroup).toLowerCase() === 'for general public';
}

function isDebenture(issue) {
  const hay = `${norm(issue.shareGroupName)} ${norm(issue.shareTypeName)} ${norm(issue.reservationTypeName)}`.toLowerCase();
  return hay.includes('debenture') || hay.includes('bond');
}

function isIPOorFPO(issue) {
  const t = norm(issue.shareTypeName).toUpperCase();
  return t === 'IPO' || t === 'FPO';
}

function isRightShare(issue) {
  const rt = norm(issue.reservationTypeName).toUpperCase();
  return rt.includes('RIGHT SHARE');
}

function alreadyApplied(issue) {
  return Boolean(issue.applicantFormId) || DONE_STATUSES.has(norm(issue.statusName).toUpperCase());
}

function classify(issue) {
  // Returns {kind, eligible, skipReason?, alreadyApplied, doneState?}
  const base = {
    companyShareId: issue.companyShareId,
    scrip: norm(issue.scrip),
    companyName: norm(issue.companyName),
    subGroup: norm(issue.subGroup),
    shareTypeName: norm(issue.shareTypeName),
    reservationTypeName: norm(issue.reservationTypeName),
    shareGroupName: norm(issue.shareGroupName),
    statusName: norm(issue.statusName),
    applicantFormId: issue.applicantFormId
  };

  if (isDebenture(issue)) {
    return { ...base, kind: 'UNKNOWN', eligible: false, skipReason: 'Skipped: Debenture', alreadyApplied: alreadyApplied(issue) };
  }

  if (!isOrdinaryShares(issue)) {
    return { ...base, kind: 'UNKNOWN', eligible: false, skipReason: 'Skipped: Not Ordinary Shares', alreadyApplied: alreadyApplied(issue) };
  }

  if (!isGeneralPublic(issue)) {
    return { ...base, kind: 'UNKNOWN', eligible: false, skipReason: 'Skipped: Not General Public', alreadyApplied: alreadyApplied(issue) };
  }

  if (isRightShare(issue)) {
    const ap = alreadyApplied(issue);
    const doneState = ap ? (norm(issue.statusName).toUpperCase() === 'TRANSACTION_SUCCESS' ? 'BANK_DEDUCTED' : 'SUBMITTED_APPROVED') : null;
    return { ...base, kind: 'RIGHT_SHARE', eligible: !ap, alreadyApplied: ap, doneState };
  }

  if (isIPOorFPO(issue)) {
    const ap = alreadyApplied(issue);
    const doneState = ap ? (norm(issue.statusName).toUpperCase() === 'TRANSACTION_SUCCESS' ? 'BANK_DEDUCTED' : 'SUBMITTED_APPROVED') : null;
    return { ...base, kind: 'IPO_FPO', eligible: !ap, alreadyApplied: ap, doneState };
  }

  return { ...base, kind: 'UNKNOWN', eligible: false, skipReason: 'Skipped: Not IPO/FPO or Right Share', alreadyApplied: alreadyApplied(issue) };
}

module.exports = {
  classify,
  alreadyApplied,
  DONE_STATUSES
};
