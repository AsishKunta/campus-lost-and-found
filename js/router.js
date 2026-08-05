// ================================================================
//  router.js — unified SPA router for Student + Admin portal
//
//  Public API (all globals):
//    navigate(page, params?)  — switch to a named section
//    registerPage(name, fn)   — register a page init function
// ================================================================

(function () {

  const ROUTE_ALIASES = {
    messages: 'conversations',
    'add-found-item': 'report',
  };

  function normalizePage(page) {
    return ROUTE_ALIASES[page] || page;
  }

  // ── Page title map ────────────────────────────────────────────
  const PAGE_TITLES = {
    dashboard:      'Dashboard',
    report:         'Report Item',
    'my-reports':   'My Reports',
    'my-claims':    'My Claims',
    'student-lost-reports': 'Student Lost Reports',
    'add-found-item': 'Report Item',
    claim:          'File a Claim',
    'new-claim':    'New Claim',
    conversations:  'Messages',
    'claim-requests': 'Claim Requests',
    profile:        'My Profile',
  };

  // ── Sidebar definitions per role ─────────────────────────────
  const SIDEBAR_LINKS = {
    student: [
      { page: 'dashboard',     icon: 'fa-tachometer-alt',  label: 'Dashboard'   },
      { page: 'my-reports',    icon: 'fa-folder-open',      label: 'My Reports'  },
      { page: 'report',        icon: 'fa-bullhorn',         label: 'Report Item' },
      { page: 'new-claim',     icon: 'fa-file-circle-plus', label: 'New Claim'   },
      { page: 'my-claims',     icon: 'fa-hand-holding',     label: 'My Claims'   },
      { page: 'conversations', icon: 'fa-comments',         label: 'Messages'    },
    ],
    admin: [
      { page: 'dashboard',     icon: 'fa-tachometer-alt',  label: 'Dashboard'      },
      { page: 'student-lost-reports', icon: 'fa-folder-open', label: 'Student Lost Reports' },
      { page: 'report',        icon: 'fa-circle-plus',      label: 'Report Item' },
      { page: 'claim-requests',icon: 'fa-clipboard-list',  label: 'Claim Requests' },
      { page: 'conversations', icon: 'fa-comments',         label: 'Messages'       },
    ],
  };

  // ── Page init function registry ──────────────────────────────
  const _initMap = {};

  // ── Public: register a page init function ─────────────────────
  window.registerPage = function (name, fn) {
    _initMap[name] = fn;
  };

  // ── Render role-based sidebar ─────────────────────────────────
  function renderSidebar(role) {
    // Brand subtitle
    var brandSub = document.querySelector('.sidebar-brand p');
    if (brandSub) brandSub.textContent = role === 'admin' ? 'Admin Portal' : 'Student Portal';

    // Nav links
    var nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    var links = (SIDEBAR_LINKS[role] || SIDEBAR_LINKS.student);
    nav.innerHTML = links.map(function (link) {
      return '<li>' +
        '<a class="sidebar-nav-link" data-page="' + link.page + '"' +
        ' href="#' + link.page + '"' +
        ' onclick="event.preventDefault(); navigate(\'' + link.page + '\');">' +
        '<i class="fas ' + link.icon + '"></i> ' + link.label +
        '</a></li>';
    }).join('');

    renderSidebarWelcome(role);
  }

  function titleCaseIdentifier(value) {
    return String(value || '')
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, function (character) { return character.toUpperCase(); })
      .trim();
  }

  function renderSidebarWelcome(role) {
    var storedUser = typeof getCurrentUser === 'function' ? getCurrentUser() : {};
    var email = storedUser.email || '';
    var emailName = titleCaseIdentifier(String(email).split('@')[0]);
    var storedName = String(storedUser.displayName || storedUser.name || '').trim();
    var displayName = storedName || emailName || 'Campus User';
    var nameElement = document.getElementById('sidebarWelcomeName');
    var workspaceElement = document.getElementById('sidebarWelcomeWorkspace');
    if (nameElement) nameElement.textContent = displayName;
    if (workspaceElement) workspaceElement.textContent = role === 'admin' ? 'Admin Workspace' : 'Student Workspace';
  }

  function refreshWorkspace(role) {
    renderSidebar(role);
    var roleLabel = document.getElementById('avatarRoleLabel');
    if (roleLabel) roleLabel.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    var roleSelect = document.getElementById('roleSwitch');
    if (roleSelect) roleSelect.value = role;
    localStorage.removeItem('lf_reports_cache_v2');
    navigate('dashboard', { forceRefresh: true });
  }

  window.refreshWorkspace = refreshWorkspace;

  // ── Public: navigate to a section ─────────────────────────────
  window.navigate = function (page, params) {
    page = normalizePage(page);
    var role = localStorage.getItem('role') || 'student';

    // Guard: students cannot access admin-only pages
    if (role === 'student' && ['claim-requests', 'student-lost-reports'].includes(page)) page = 'dashboard';
    // Guard: admins cannot access student-only pages
    if (role === 'admin' && ['claim', 'new-claim', 'my-reports', 'my-claims'].includes(page)) page = 'dashboard';

    if (!PAGE_TITLES[page]) page = 'dashboard';

    // 1. Hide all sections
    document.querySelectorAll('.spa-page').forEach(function (s) {
      s.classList.remove('active');
    });

    // 2. Show target section
    var sectionPage = page === 'new-claim' ? 'claim' : page;
    var section = document.getElementById('page-' + sectionPage);
    if (section) section.classList.add('active');

    // 3. Update topbar title
    var titleEl = document.getElementById('topbarTitle');
    if (titleEl) titleEl.textContent = PAGE_TITLES[page] || page;

    // 4. Highlight active sidebar link
    document.querySelectorAll('.sidebar-nav-link').forEach(function (a) {
      a.classList.toggle('active', a.dataset.page === page);
    });

    // 5. Push history state
    var hash = '#' + page;
    if (location.hash !== hash) {
      history.pushState({ page: page, params: params || null }, '', hash);
    } else if (params) {
      history.replaceState({ page: page, params: params }, '', hash);
    }

    // 6. Call the page's init / refresh function
    var fn = _initMap[page];
    if (fn) fn(params);
  };

  // ── Handle browser back / forward ─────────────────────────────
  window.addEventListener('popstate', function (e) {
    var requestedPage = (e.state && e.state.page)
      || (location.hash.slice(1).split('&')[0])
      || 'dashboard';
    var page = normalizePage(requestedPage);
    if (requestedPage !== page) {
      history.replaceState({ page: page, params: e.state && e.state.params }, '', '#' + page);
    }
    navigate(page, e.state && e.state.params);
  });

  // ── Register unified role-dispatched pages ────────────────────
  registerPage('dashboard', function (params) {
    var role = localStorage.getItem('role') || 'student';
    if (role === 'admin') {
      if (typeof window.initAdminDashboard === 'function') window.initAdminDashboard(params);
    } else {
      if (typeof window.initStudentDashboard === 'function') window.initStudentDashboard(params);
    }
  });

  registerPage('conversations', function (params) {
    var role = localStorage.getItem('role') || 'student';
    if (role === 'admin') {
      if (typeof window.initAdminMessages === 'function') window.initAdminMessages(params);
    } else {
      if (typeof window.initStudentMessages === 'function') window.initStudentMessages(params);
    }
  });

  registerPage('claim-requests', function (params) {
    if (typeof window.initAdminClaims === 'function') window.initAdminClaims(params);
  });

  registerPage('report', function () { if (window.initReport) window.initReport(); });
  registerPage('my-reports', function () { if (window.initMyReports) window.initMyReports(); });
  registerPage('my-claims', function () { if (window.initMyClaims) window.initMyClaims(); });
  registerPage('student-lost-reports', function () { if (window.initStudentLostReports) window.initStudentLostReports(); });

  registerPage('claim', function (params) {
    if (typeof window.initClaim === 'function') window.initClaim(params);
  });

  registerPage('new-claim', function () {
    if (typeof window.initClaim === 'function') window.initClaim({ manual: true });
  });

  registerPage('profile', function (params) {
    if (typeof window.initProfile === 'function') window.initProfile(params);
  });

  // ── Initial navigation on page load ───────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    if (window.authReady) await window.authReady;
    var role = localStorage.getItem('role') || 'student';

    // 1. Render the role-specific sidebar
    renderSidebar(role);

    // 2. Update avatar role label
    var roleLabel = document.getElementById('avatarRoleLabel');
    if (roleLabel) roleLabel.textContent = role.charAt(0).toUpperCase() + role.slice(1);

    // 3. Navigate to hashed page (or default)
    var requestedHash = location.hash.slice(1).split('&')[0] || 'dashboard';
    var hash = normalizePage(requestedHash);
    var routeParams = history.state && history.state.page === hash
      ? history.state.params : null;
    if (requestedHash !== hash) {
      history.replaceState({ page: hash, params: routeParams }, '', '#' + hash);
    }
    navigate(hash, routeParams);
  });

})();
