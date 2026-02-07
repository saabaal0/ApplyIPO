const { retry } = require('../utils/retry');
const log = require('../utils/logger');

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

function normalizeToken(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  if (!t) return null;

  // Some servers return "Bearer <jwt>"
  if (t.toLowerCase().startsWith('bearer ')) {
    t = t.slice(7).trim();
  }

  // If multiple values exist, take the first
  if (t.includes(',')) {
    t = t.split(',')[0].trim();
  }

  return t || null;
}

function extractTokenFromHeaders(headers) {
  // Headers.get() is case-insensitive
  const candidates = [
    'authorization',
    'x-authorization',
    'x-auth-token',
    'x-access-token',
    'access-token',
    'jwt',
    'token',
  ];

  for (const k of candidates) {
    const v = headers.get(k);
    const t = normalizeToken(v);
    if (t) return t;
  }
  return null;
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== 'object') return issue;

  const shareGroupName = (issue.shareGroupName || '').trim();
  const shareTypeName = (issue.shareTypeName || '').trim();
  const subGroupRaw = issue.subGroup == null ? '' : String(issue.subGroup);
  const subGroupTrimmed = subGroupRaw.trim();

  const isOrdinary = /ordinary\s+shares?/i.test(shareGroupName);
  const isIpoOrFpo = /^(IPO|FPO)$/i.test(shareTypeName);

  // Your case: subgroup sometimes comes as " " for GP IPO/FPO
  const normalizedSubGroup =
    (isOrdinary && isIpoOrFpo && !subGroupTrimmed)
      ? 'For General Public'
      : subGroupTrimmed;

  return {
    ...issue,
    shareGroupName,
    shareTypeName,
    subGroup: normalizedSubGroup,
  };
}

class MeroShareApi {
  /**
   * @param {{apiBaseUrl: string, clientId: string, username: string, password: string}} cfg
   */
  constructor(cfg) {
    this.apiBaseUrl = cfg.apiBaseUrl;
    this.clientId = cfg.clientId;
    this.username = cfg.username;
    this.password = cfg.password;
  }

  async login() {
    const url = `${this.apiBaseUrl}/auth/`;
    const payload = {
      clientId: Number(this.clientId),
      username: this.username,
      password: this.password,
    };

    return retry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'Origin': 'https://meroshare.cdsc.com.np',
          'Referer': 'https://meroshare.cdsc.com.np/',
          'Authorization': 'null',
        },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg = data?.message || data?.error || data?._raw || `HTTP ${res.status}`;
        throw new Error(`Auth failed: ${msg}`);
      }

      // JWT is in response headers (your finding)
      const headerToken = extractTokenFromHeaders(res.headers);

      // Fallback: token in body (rare, but safe)
      const bodyToken = typeof data === 'string'
        ? normalizeToken(data)
        : normalizeToken(data?.token || data?.accessToken || data?.authorization || data?.jwt);

      const token = headerToken || bodyToken;

      if (!token) {
        const keys = Array.from(res.headers.keys()).join(', ');
        throw new Error(`Auth succeeded but token not found. Header keys: ${keys || '(none)'}`);
      }

      return token;
    }, {
      retries: 3,
      delayMs: 1500,
      onRetry: (e, attempt) => log.warn(`API login retry ${attempt}: ${e.message}`),
    });
  }

  /**
   * Applicable Issue API
   * @param {string} token
   * @returns {Promise<any[]>}
   */
  async getApplicableIssues(token) {
    const url = `${this.apiBaseUrl}/companyShare/applicableIssue/`;

    const body = {
      filterFieldParams: [
        { key: 'companyIssue.companyISIN.script', alias: 'Scrip' },
        { key: 'companyIssue.companyISIN.company.name', alias: 'Company Name' },
        { key: 'companyIssue.assignedToClient.name', value: '', alias: 'Issue Manager' },
      ],
      page: 1,
      size: 50,
      searchRoleViewConstants: 'VIEW_APPLICABLE_SHARE',
      filterDateParams: [
        { key: 'minIssueOpenDate', condition: '', alias: '', value: '' },
        { key: 'maxIssueCloseDate', condition: '', alias: '', value: '' },
      ],
    };

    return retry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'Authorization': token,
          'Origin': 'https://meroshare.cdsc.com.np',
          'Referer': 'https://meroshare.cdsc.com.np/',
        },
        body: JSON.stringify(body),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg = data?.message || data?.error || data?._raw || `HTTP ${res.status}`;
        throw new Error(`ApplicableIssue failed: ${msg}`);
      }

      const listRaw = Array.isArray(data) ? data : (data?.object || data?.data || data?.content || []);
      const list = Array.isArray(listRaw) ? listRaw.map(normalizeIssue) : [];
      return list;
    }, {
      retries: 3,
      delayMs: 1000,
      onRetry: (e, attempt) => log.warn(`ApplicableIssue retry ${attempt}: ${e.message}`),
    });
  }

  /**
   * Application Report API (Applicant Form - Active)
   * Endpoint: /applicantForm/active/search/
   *
   * @param {string} token
   * @param {{page?: number, size?: number}} opts
   * @returns {Promise<{list: any[], totalCount: number}>}
   */
  async getActiveApplicantFormsPage(token, opts = {}) {
    const url = `${this.apiBaseUrl}/applicantForm/active/search/`;
    const page = Number(opts.page ?? 1);
    const size = Number(opts.size ?? 200);

    const body = {
      filterFieldParams: [
        { key: 'companyShare.companyIssue.companyISIN.script', alias: 'Scrip' },
        { key: 'companyShare.companyIssue.companyISIN.company.name', alias: 'Company Name' },
      ],
      page,
      size,
      searchRoleViewConstants: 'VIEW_APPLICANT_FORM_COMPLETE',
      filterDateParams: [
        { key: 'appliedDate', condition: '', alias: '', value: '' },
        { key: 'appliedDate', condition: '', alias: '', value: '' },
      ],
    };

    return retry(async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          'Authorization': token,
          'Origin': 'https://meroshare.cdsc.com.np',
          'Referer': 'https://meroshare.cdsc.com.np/',
        },
        body: JSON.stringify(body),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        const msg = data?.message || data?.error || data?._raw || `HTTP ${res.status}`;
        throw new Error(`ApplicantForm search failed: ${msg}`);
      }

      const listRaw = Array.isArray(data) ? data : (data?.object || data?.data || data?.content || []);
      const list = Array.isArray(listRaw) ? listRaw.map(normalizeIssue) : [];
      const totalCount = Number(data?.totalCount ?? list.length);

      return { list, totalCount };
    }, {
      retries: 3,
      delayMs: 1000,
      onRetry: (e, attempt) => log.warn(`ApplicantForm search retry ${attempt}: ${e.message}`),
    });
  }

  /**
   * Fetch all active applicant forms with pagination.
   * @param {string} token
   * @param {{pageSize?: number, maxPages?: number}} opts
   * @returns {Promise<any[]>}
   */
  async getAllActiveApplicantForms(token, opts = {}) {
    const pageSize = Number(opts.pageSize ?? 200);
    const maxPages = Number(opts.maxPages ?? 10);

    let page = 1;
    let all = [];
    let totalCount = null;

    while (page <= maxPages) {
      const { list, totalCount: tc } = await this.getActiveApplicantFormsPage(token, { page, size: pageSize });
      if (totalCount == null) totalCount = tc;

      all = all.concat(list);

      if (list.length === 0) break;
      if (typeof totalCount === 'number' && all.length >= totalCount) break;

      page += 1;
    }

    return all;
  }

  /**
   * Find one application report row by scrip.
   * @param {string} token
   * @param {string} scrip
   * @returns {Promise<any|null>}
   */
  async findApplicantFormByScrip(token, scrip) {
    const target = String(scrip || '').trim().toUpperCase();
    if (!target) return null;

    const all = await this.getAllActiveApplicantForms(token, { pageSize: 200, maxPages: 10 });
    return all.find(x => String(x?.scrip || '').trim().toUpperCase() === target) || null;
  }
}

module.exports = { MeroShareApi };
