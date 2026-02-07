
const APPLIED_STATUSES = new Set([
    'CREATE_APPROVE',
    'APPROVED',
    'BLOCKED_APPROVE',
    'TRANSACTION_SUCCESS',
  ]);
  
  function isAlreadyApplied(appRow) {
    return Boolean(
      appRow &&
      appRow.applicantFormId &&
      APPLIED_STATUSES.has(String(appRow.statusName || '').toUpperCase())
    );
  }
  
  function humanStatus(status) {
    switch (String(status || '').toUpperCase()) {
      case 'CREATE_APPROVE':
        return 'Application submitted';
      case 'APPROVED':
        return 'Application approved (bank pending)';
      case 'BLOCKED_APPROVE':
        return 'Amount blocked in bank';
      case 'TRANSACTION_SUCCESS':
        return 'Payment deducted successfully';
      default:
        return status || 'Unknown status';
    }
  }
  
  module.exports = {
    APPLIED_STATUSES,
    isAlreadyApplied,
    humanStatus,
  };
  