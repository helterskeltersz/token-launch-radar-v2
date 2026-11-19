// Token Launch Radar dashboard: renders window.RADAR (written by main.ts
// from the sealed snapshot), with search / category / chain / watchlist /
// TVL filters, four sorts, a live-token tab, a per-protocol detail dialog
// and hash deep-links: #/protocol/<slug> and #/filter/<category>.
(function () {
  var R = window.RADAR;
  if (!R) { document.getElementById('meta').textContent = 'No data file found.'; return; }
  var rows = R.rows;
  var live = R.live;

  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(c) {
    if (c === null || c === undefined) return '<span class="muted">n/a</span>';
    var cls = c >= 0 ? 'up' : 'down';
    return '<span class="' + cls + '">' + (c >= 0 ? '+' : '') + c.toFixed(1) + '%</span>';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var meta = R.meta;
  document.getElementById('meta').textContent =
    'Snapshot ' + meta.as_of + '  ·  ' + meta.protocols + ' protocols  ·  ' +
    meta.watchlist + ' on the watchlist  ·  ' + meta.comparables + ' launched comparables';
  document.getElementById('score').innerHTML =
    '<b>' + money(rows[0].implied_value_usd) + '</b><span>top implied FDV &middot; ' + esc(rows[0].name) + '</span>';

  // Filter option lists, in first-seen order for categories, alpha for chains.
  var cats = [], chains = [];
  rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  var catSel = document.getElementById('cat');
  cats.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  var chainSel = document.getElementById('chain');
  chains.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  // Category multiples table.
  document.getElementById('mult-rows').innerHTML = R.multiples.map(function (m) {
    return '<tr><td>' + esc(m.category) + '</td><td class="num">' + m.comparables +
      '</td><td class="num">' + (m.median === null ? 'n/a' : m.median.toFixed(3)) +
      '</td><td class="num">' + m.multiple.toFixed(3) + '</td></tr>';
  }).join('');

  var q = document.getElementById('q');
  var minTvl = document.getElementById('min-tvl');
  var watchOnly = document.getElementById('watch-only');
  var sortSel = document.getElementById('sort');
  var showing = document.getElementById('showing');
  var tbody = document.getElementById('rows');
  var boardTable = document.getElementById('board');
  var liveWrap = document.getElementById('live-wrap');
  var tabBoard = document.getElementById('tab-board');
  var tabLive = document.getElementById('tab-live');
  var view = 'board';

  function current() {
    var needle = q.value.trim().toLowerCase();
    var list = rows.filter(function (r) {
      if (needle && r.name.toLowerCase().indexOf(needle) < 0 && r.slug.indexOf(needle) < 0) return false;
      if (catSel.value && r.category !== catSel.value) return false;
      if (chainSel.value && r.chains.indexOf(chainSel.value) < 0) return false;
      if (watchOnly.checked && !r.watchlist) return false;
      if (r.tvl_usd < Number(minTvl.value)) return false;
      return true;
    });
    var key = sortSel.value;
    list.sort(function (a, b) {
      if (key === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (key === 'growth') return (b.change_7d || 0) - (a.change_7d || 0);
      if (key === 'age') return (b.age_days || 0) - (a.age_days || 0);
      return a.rank - b.rank;
    });
    return list;
  }

  function render() {
    var list = current();
    showing.textContent = 'Showing ' + list.length + ' of ' + rows.length + ' pre-token protocols' +
      (watchOnly.checked ? ' (watchlist only)' : '') + '. Click a row for its farm plan.';
    tbody.innerHTML = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b>' + (r.watchlist ? '<span class="badge">watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (r.age_days === null ? 'n/a' : r.age_days + 'd') + '</td>' +
        '<td class="num">' + r.multiple.toFixed(3) + '</td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
  }

  function renderLive() {
    document.getElementById('live-rows').innerHTML = live.map(function (r) {
      return '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_usd / r.tvl_usd).toFixed(3) + '</td></tr>';
    }).join('');
  }

  function setView(v) {
    view = v;
    tabBoard.classList.toggle('active', v === 'board');
    tabLive.classList.toggle('active', v === 'live');
    boardTable.hidden = v !== 'board';
    liveWrap.hidden = v !== 'live';
    showing.hidden = v !== 'live';
    if (v === 'live') renderLive();
  }
  tabBoard.addEventListener('click', function () { setView('board'); history.replaceState(null, '', '#/board'); });
  tabLive.addEventListener('click', function () { setView('live'); history.replaceState(null, '', '#/live'); });

  var dlg = document.getElementById('detail');
  function openDetail(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var age = r.age_days === null ? 'not listed' : r.age_days + ' days since first listed';
    document.getElementById('detail-body').innerHTML =
      '<h2>' + esc(r.name) + '</h2><p class="note">Rank #' + r.rank +
      (r.watchlist ? ' · on the watchlist' : ' · early find below the floor') +
      ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) + '</p>' +
      '<div class="kv"><div><b>' + money(r.implied_value_usd) + '</b><span>implied FDV</span></div>' +
      '<div><b>' + money(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + r.multiple.toFixed(3) + '</b><span>category multiple</span></div>' +
      '<div><b>' + r.growth_factor.toFixed(2) + 'x</b><span>growth factor</span></div></div>' +
      '<p class="note">TVL ' + money(r.tvl_usd) + ' &times; multiple ' + r.multiple.toFixed(3) +
      ' &times; growth ' + r.growth_factor.toFixed(2) + ' &times; maturity ' + r.maturity_factor.toFixed(2) +
      ' = ' + money(r.implied_value_usd) + '. 7-day TVL change ' +
      (r.change_7d === null ? 'unreported' : (r.change_7d >= 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') +
      '; ' + age + '. This protocol records no token in the snapshot.</p>' +
      '<h3>How to farm it</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('close', function () {
    if (location.hash.indexOf('#/protocol/') === 0) history.replaceState(null, '', '#/board');
  });
  tbody.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr');
    if (!tr) return;
    location.hash = '#/protocol/' + tr.getAttribute('data-slug');
  });

  [q, catSel, chainSel, minTvl, watchOnly, sortSel].forEach(function (el) {
    el.addEventListener('input', render);
    el.addEventListener('change', render);
  });

  function route() {
    var h = location.hash || '#/board';
    if (h.indexOf('#/protocol/') === 0) { setView('board'); openDetail(h.slice(11)); return; }
    if (dlg.open) dlg.close();
    if (h.indexOf('#/filter/') === 0) {
      var cat = decodeURIComponent(h.slice(9));
      if (cats.indexOf(cat) >= 0) { catSel.value = cat; }
      setView('board'); render(); return;
    }
    if (h === '#/live') { setView('live'); return; }
    setView('board');
  }
  window.addEventListener('hashchange', route);
  render();
  route();
})();
