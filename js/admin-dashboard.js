// =========================================================
//  admin-dashboard.js — Role-aware admin SPA module
//  Wrapped in IIFE to avoid conflict with dashboard.js globals.
//  Exposed: window.initAdminDashboard, window.approveClaim, window.rejectClaim
// =========================================================

(function () {

  var _adReports  = [];
  var _adClaims   = [];
  var _adCategory = '';
  var _adStatus   = '';
  var _adSort     = 'relevance';
  var _adInitialized = false;
  var _adSearchTimer = null;
  var _adSearchRequest = null;
  var _adSmartSearchActive = false;
  var _adLoadPromise = null;
  var ADMIN_CACHE_KEY = 'lf_admin_reports_cache_v2';

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDate(dateString) {
    if (!dateString) return 'N/A';
    var parts = String(dateString).split('-');
    if (parts.length === 3) return parts[1] + '-' + parts[2] + '-' + parts[0];
    return String(dateString);
  }

  function showDetailModal(html) {
    var body = document.getElementById('detailBody');
    var modal = document.getElementById('detailModal');
    if (body) body.innerHTML = html;
    if (modal) modal.classList.add('show');
  }

  function hideDetailModal() {
    var modal = document.getElementById('detailModal');
    if (modal) modal.classList.remove('show');
  }

  function wireFilters() {
    var searchInput = document.getElementById('globalSearch');
    var clearBtn    = document.getElementById('searchClearBtn');
    if (searchInput) {
      var fresh = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(fresh, searchInput);
      fresh.addEventListener('input', function () {
        if (clearBtn) clearBtn.style.display = fresh.value ? 'flex' : 'none';
        clearTimeout(_adSearchTimer);
        var query = fresh.value.trim();
        if (!query) {
          _adSmartSearchActive = false;
          setSearchStatus('');
          loadData();
          return;
        }
        setSearchStatus('Searching reports…', true);
        _adSearchTimer = setTimeout(function () { runAdminSearch(query); }, 300);
      });
    }
    var category = document.getElementById('categoryFilter');
    var status = document.getElementById('statusFilter');
    var sort = document.getElementById('sortReports');
    if (category) { category.value = _adCategory; category.onchange = function () { _adCategory = category.value; updateFilterUi(); renderAdminCards(); }; }
    if (status) { status.value = _adStatus; status.onchange = function () { _adStatus = status.value; updateFilterUi(); renderAdminCards(); }; }
    if (sort) { sort.value = _adSort; sort.onchange = function () { _adSort = sort.value; renderAdminCards(); }; }
    var clear = document.getElementById('clearFiltersBtn');
    if (clear) clear.onclick = function () {
      _adCategory = ''; _adStatus = '';
      if (category) category.value = '';
      if (status) status.value = '';
      updateFilterUi(); renderAdminCards();
    };
    updateFilterUi();
  }

  function setSearchStatus(message, loading) {
    var status = document.getElementById('smartSearchStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-loading', Boolean(loading));
  }

  async function runAdminSearch(query) {
    if (_adSearchRequest) _adSearchRequest.abort();
    _adSearchRequest = new AbortController();
    try {
      var response = await apiFetch(BASE_URL + '/reports/search?q=' + encodeURIComponent(query), { signal: _adSearchRequest.signal });
      var body = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(body.error || 'Search could not be completed.');
      if ((document.getElementById('globalSearch')?.value || '').trim() !== query) return;
      _adSmartSearchActive = true;
      _adReports = Array.isArray(body.results) ? body.results : [];
      var dateLabel = body.signals && body.signals.dateRange ? ' · Date: ' + body.signals.dateRange : '';
      setSearchStatus(_adReports.length + ' ranked result' + (_adReports.length === 1 ? '' : 's') + dateLabel, false);
      renderAdminCards();
    } catch (error) {
      if (error.name === 'AbortError') return;
      setSearchStatus(error.message || 'Search could not be completed.', false);
    } finally {
      _adSearchRequest = null;
    }
  }

  function updateFilterUi() {
    var filters = [];
    if (_adCategory) filters.push({ key: 'category', label: _adCategory });
    if (_adStatus) filters.push({ key: 'status', label: _adStatus === 'claimed' ? 'Unavailable' : 'Available' });
    var count = document.getElementById('filterCount');
    if (count) { count.textContent = filters.length; count.hidden = filters.length === 0; }
    var chips = document.getElementById('activeFilterChips');
    if (!chips) return;
    chips.innerHTML = filters.map(function (filter) { return '<span class="filter-chip">' + escapeHtml(filter.label) + '<button type="button" data-clear-filter="' + filter.key + '" aria-label="Remove ' + escapeHtml(filter.label) + ' filter">&times;</button></span>'; }).join('');
    chips.querySelectorAll('[data-clear-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.clearFilter === 'category') _adCategory = '';
        if (button.dataset.clearFilter === 'status') _adStatus = '';
        var category = document.getElementById('categoryFilter');
        var status = document.getElementById('statusFilter');
        if (category) category.value = _adCategory;
        if (status) status.value = _adStatus;
        updateFilterUi(); renderAdminCards();
      });
    });
  }

  function updateStats(reports) {
    var values = [
      reports.filter(function (r) { return r.lifecycleStatus === 'active' || (r.claimStatus || '').toLowerCase() !== 'claimed'; }).length,
      _adClaims.filter(function (c) { return ['pending', 'under_review'].includes((c.status || '').toLowerCase()); }).length,
      _adClaims.filter(function (c) { return (c.status || '').toLowerCase() === 'action_required'; }).length,
      _adClaims.filter(function (c) { return ['approved', 'returned'].includes((c.status || '').toLowerCase()); }).length,
    ];
    values.forEach(function (value, index) {
      var element = document.getElementById('metricValue' + (index + 1));
      if (element) element.textContent = value;
    });
  }

  function showSkeletonCards() {
    var grid = document.getElementById('reportCards');
    if (!grid) return;
    grid.innerHTML = Array.from({ length: 6 }).map(function () {
      return '<div class="rc-card rc-skeleton"><div class="rc-img-wrap skel-block"></div><div class="rc-body"><div class="skel-line skel-title"></div><div class="skel-line skel-meta"></div></div></div>';
    }).join('');
  }

  function getPendingClaim(reportId) {
    return _adClaims.find(function (c) {
      return String(c.report_id) === String(reportId) && (c.status || '').toLowerCase() === 'pending';
    }) || null;
  }

  function approveClaim(claimId) {
    sessionStorage.setItem('phase3ReviewClaimId', String(claimId));
    if (typeof navigate === 'function') navigate('claim-requests');
    else window.location.href = 'dashboard.html#claim-requests';
  }

  function rejectClaim(claimId) {
    apiFetch(BASE_URL + '/claims/' + claimId + '/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject' }),
    })
    .then(function (res) { return res.ok ? res.json() : res.json().then(function (e) { throw e; }); })
    .then(function () {
      localStorage.removeItem(ADMIN_CACHE_KEY);
      if (typeof showSuccessToast === 'function') showSuccessToast('Claim rejected.');
      hideDetailModal(); loadData();
    })
    .catch(function (e) { if (typeof showErrorToast === 'function') showErrorToast((e && e.error) || 'Rejection failed.'); });
  }

  function renderAdminCards() {
    var searchEl  = document.getElementById('globalSearch');
    var searchVal = searchEl ? searchEl.value.trim().toLowerCase() : '';
    var filtered  = _adReports.filter(function (r) {
      var ms = _adSmartSearchActive || !searchVal || (r.itemName || '').toLowerCase().includes(searchVal) || (r.location || '').toLowerCase().includes(searchVal) || (r.itemCategory || '').toLowerCase().includes(searchVal);
      var categoryTargetsReportType = ['lost', 'found'].includes(_adCategory.toLowerCase());
      var mc = !_adCategory || (categoryTargetsReportType
        ? (r.category || '').toLowerCase() === _adCategory.toLowerCase()
        : (r.itemCategory || '').toLowerCase() === _adCategory.toLowerCase());
      var mt = !_adStatus   || (r.claimStatus || '').toLowerCase() === _adStatus.toLowerCase();
      return ms && mc && mt;
    }).sort(function (a, b) {
      if (_adSort === 'name') return String(a.itemName || '').localeCompare(String(b.itemName || ''));
      var aDate = new Date(a.dateFound || a.createdAt || 0).getTime();
      var bDate = new Date(b.dateFound || b.createdAt || 0).getTime();
      if (_adSort === 'oldest') return aDate - bDate;
      if (_adSort === 'newest') return bDate - aDate;
      if (_adSort === 'relevance') return Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0) || bDate - aDate;
      return bDate - aDate;
    });
    var grid = document.getElementById('reportCards');
    if (!grid) return;
    var resultsCount = document.getElementById('resultsCount');
    if (resultsCount) resultsCount.textContent = filtered.length + (filtered.length === 1 ? ' item' : ' items');
    grid.innerHTML = '';
    if (filtered.length === 0) {
      grid.innerHTML = '<div class="rc-empty"><i class="fas fa-box-open"></i><p>No reports found</p></div>';
      return;
    }
    filtered.forEach(function (report) {
      var isClaimed   = (report.claimStatus || '').toLowerCase() === 'claimed';
      var statusClass = isClaimed ? 'claimed' : 'pending';
      var statusLabel = isClaimed ? 'Claimed' : 'Pending';
      var imgSrc      = report.imageUrl ? (report.imageUrl.startsWith('http') ? report.imageUrl : BASE_URL + report.imageUrl) : '';
      var pClaim      = getPendingClaim(report.id);
      var card        = document.createElement('div');
      card.className  = 'rc-card';
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'View ' + (report.itemName || 'report') + ' details');
      card.innerHTML  =
        '<div class="rc-img-wrap">' +
          '<div class="rc-img-placeholder"><i class="fas fa-image"></i><span>No image</span></div>' +
          (imgSrc ? '<img class="rc-img" src="' + escapeHtml(imgSrc) + '" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
          '<span class="rc-badge rc-badge--' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
          (pClaim ? '<span class="rc-badge-claim">Claim pending</span>' : '') +
        '</div>' +
        '<div class="rc-body">' +
          '<div class="rc-title">' + escapeHtml(report.itemName || 'Unknown Item') + '</div>' +
          '<div class="rc-meta"><i class="fas fa-tag"></i> ' + escapeHtml(report.itemCategory || report.category || 'Other') + '</div>' +
          '<div class="rc-meta"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(report.location || 'N/A') + '</div>' +
          '<div class="rc-meta"><i class="fas fa-calendar-alt"></i> ' + escapeHtml(formatDate(report.dateFound)) + '</div>' +
          (Array.isArray(report.searchEvidence) && report.searchEvidence.length ? '<div class="search-evidence"><strong>' + escapeHtml(report.relevanceScore + '% — ' + report.relevanceLabel) + '</strong><span>' + escapeHtml(report.searchEvidence.slice(0, 3).map(function (item) { return item.detail || item.label; }).filter(Boolean).join(' · ')) + '</span></div>' : '') +
        '</div>' +
        (pClaim ?
          '<div class="rc-admin-actions">' +
            '<button class="rc-admin-btn rc-admin-btn--approve" onclick="event.stopPropagation();approveClaim(' + pClaim.id + ')"><i class="fas fa-check"></i> Approve</button>' +
            '<button class="rc-admin-btn rc-admin-btn--reject" onclick="event.stopPropagation();rejectClaim(' + pClaim.id + ')"><i class="fas fa-times"></i> Reject</button>' +
          '</div>' : '');
      card.addEventListener('click', function () { openAdminModal(report, pClaim, imgSrc, statusClass, statusLabel); });
      card.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && event.target === card) openAdminModal(report, pClaim, imgSrc, statusClass, statusLabel);
      });
      grid.appendChild(card);
    });
  }

  function openAdminModal(report, pClaim, imgSrc, statusClass, statusLabel) {
    var imgHtml   = imgSrc ? '<img src="' + imgSrc + '" alt="Item" style="width:100%;max-height:260px;object-fit:cover;border-radius:8px;margin-bottom:16px;border:1px solid #e5e7eb;" onerror="this.style.display=\'none\'">' : '';
    var claimHtml = pClaim
      ? '<div class="detail-row"><i class="fas fa-user"></i><strong>Claimant:</strong>&nbsp;<span>' + escapeHtml(pClaim.student_email || pClaim.studentEmail || 'N/A') + '</span></div>' +
        '<div class="detail-row"><i class="fas fa-comment-alt"></i><strong>Claim note:</strong>&nbsp;<span>' + escapeHtml(pClaim.description || '—') + '</span></div>'
      : '';
    var actionsHtml = pClaim
      ? '<div class="modal-actions"><button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button>' +
        '<button class="claim-btn" style="background:#16a34a;" onclick="approveClaim(' + pClaim.id + ')"><i class="fas fa-check"></i> Approve</button>' +
        '<button class="claim-btn" style="background:#dc2626;" onclick="rejectClaim(' + pClaim.id + ')"><i class="fas fa-times"></i> Reject</button>' +
        '<button class="back-btn" onclick="hideDetailModal()"><i class="fa-solid fa-arrow-left"></i> Back</button></div>'
      : '<div class="modal-actions"><button class="print-btn" onclick="window.print()"><i class="fa-solid fa-print"></i> Print</button><button class="back-btn" onclick="hideDetailModal()"><i class="fa-solid fa-arrow-left"></i> Back</button></div>';
    showDetailModal(
      '<h2>Report Details</h2>' + imgHtml +
      '<div class="detail-row"><i class="fas fa-box"></i><strong>Item:</strong>&nbsp;<span>' + escapeHtml(report.itemName || 'N/A') + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-arrows-left-right"></i><strong>Report type:</strong>&nbsp;<span>' + escapeHtml(report.category || 'N/A') + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-tag"></i><strong>Item category:</strong>&nbsp;<span>' + escapeHtml(report.itemCategory || 'Other') + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-map-marker-alt"></i><strong>Location:</strong>&nbsp;<span>' + escapeHtml(report.location || 'N/A') + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-calendar"></i><strong>Date:</strong>&nbsp;<span>' + escapeHtml(report.dateFound || 'N/A') + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-clock"></i><strong>Status:</strong>&nbsp;<span class="status-badge status-' + statusClass + '">' + escapeHtml(statusLabel) + '</span></div>' +
      '<div class="detail-row"><i class="fas fa-align-left"></i><strong>Description:</strong>&nbsp;<span>' + escapeHtml(report.description || 'N/A') + '</span></div>' +
      (Array.isArray(report.searchEvidence) && report.searchEvidence.length ? '<div class="search-explanation"><strong>Relevance: ' + Number(report.relevanceScore) + '% — ' + escapeHtml(report.relevanceLabel) + '</strong><ul>' + report.searchEvidence.map(function (item) { return '<li>' + escapeHtml(item.label) + (item.detail ? ': ' + escapeHtml(item.detail) : '') + '</li>'; }).join('') + '</ul></div>' : '') +
      claimHtml + actionsHtml
    );
  }

  function loadData() {
    if (_adLoadPromise) return _adLoadPromise;
    _adLoadPromise = performAdminLoad().finally(function () { _adLoadPromise = null; });
    return _adLoadPromise;
  }

  async function performAdminLoad() {
    _adSmartSearchActive = false;
    var raw = localStorage.getItem(ADMIN_CACHE_KEY);
    if (raw) {
      try { _adReports = JSON.parse(raw); updateStats(_adReports); renderAdminCards(); }
      catch (_e) { localStorage.removeItem(ADMIN_CACHE_KEY); }
    } else { showSkeletonCards(); }

    try {
      var results = await Promise.allSettled([
        apiFetchWithTimeout(BASE_URL + '/reports'),
        apiFetchWithTimeout(BASE_URL + '/claims'),
      ]);
      var reportsResult = results[0];
      var claimsResult = results[1];
      if (reportsResult.status !== 'fulfilled' || !reportsResult.value.ok) throw new Error('Admin reports could not be loaded.');
      _adReports = await reportsResult.value.json() || [];
      if (claimsResult.status === 'fulfilled' && claimsResult.value.ok) {
        var claims = await claimsResult.value.json();
        _adClaims = Array.isArray(claims) ? claims : [];
      } else {
        _adClaims = [];
        setSearchStatus('Reports loaded. Claim status is temporarily unavailable.', false);
      }
      updateStats(_adReports);
      renderAdminCards();
      localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(_adReports));
    } catch (err) {
      console.error('[admin-dashboard] loadData:', err);
      if (!raw) {
        var grid = document.getElementById('reportCards');
        if (grid) {
          grid.innerHTML = '<div class="rc-empty"><i class="fas fa-wifi" style="color:#d1d5db;"></i><p>Could not load reports.</p><button type="button" class="back-btn" id="retryAdminDashboardLoad">Try again</button></div>';
          document.getElementById('retryAdminDashboardLoad')?.addEventListener('click', loadData, { once: true });
        }
      } else {
        setSearchStatus('Could not refresh Admin reports. Showing saved data.', false);
      }
    }
  }

  function initAdminDashboard() {
    var heading = document.getElementById('dashboardHeading');
    if (heading) heading.textContent = 'Admin Operations Dashboard';
    var eyebrow = document.getElementById('dashboardEyebrow');
    var intro = document.getElementById('dashboardIntro');
    if (eyebrow) eyebrow.textContent = 'Admin workspace';
    if (intro) intro.textContent = 'Monitor open reports and move recovery cases through review, return, and closure.';
    var titles = ['Open Reports', 'Claims Awaiting Review', 'Verification Required', 'Return / Closure Queue'];
    var contexts = ['Active Lost and Found records', 'Pending or under review', 'Waiting for student proof', 'Approved or returned'];
    titles.forEach(function (label, index) {
      var title = document.getElementById('metricTitle' + (index + 1));
      var context = document.getElementById('metricContext' + (index + 1));
      if (title) title.textContent = label;
      if (context) context.textContent = contexts[index];
    });
    window.clearSearch = function () {
      var inp = document.getElementById('globalSearch');
      var btn = document.getElementById('searchClearBtn');
      if (inp) { inp.value = ''; inp.focus(); }
      if (btn) btn.style.display = 'none';
      _adSmartSearchActive = false;
      setSearchStatus('', false);
      if (_adSearchRequest) _adSearchRequest.abort();
      loadData();
    };

    wireFilters();
    if (_adInitialized) { loadData(); return; }
    _adInitialized = true;
    loadData();

    var closeBtn    = document.getElementById('closeDetailBtn');
    var detailModal = document.getElementById('detailModal');
    if (closeBtn && !closeBtn._adBound) {
      closeBtn._adBound = true;
      closeBtn.addEventListener('click', hideDetailModal);
    }
    if (detailModal && !detailModal._adBound) {
      detailModal._adBound = true;
      detailModal.addEventListener('click', function (e) { if (e.target === detailModal) hideDetailModal(); });
    }
  }

  window.initAdminDashboard = initAdminDashboard;
  window.approveClaim       = approveClaim;
  window.rejectClaim        = rejectClaim;

})();
