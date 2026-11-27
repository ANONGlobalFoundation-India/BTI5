/* ANON Internship Leaderboard
   Reads a batch (live Google Sheet or a saved copy), works out points, suggested grades and ranks,
   and draws the page. Everything shown is added as escaped text, never as raw HTML from the sheet. */
(function () {
  'use strict';
  var C = window.LB_CONFIG || {};
  var ALL_TEAMS = C.teams || [], TEAMS = ALL_TEAMS;   // TEAMS = the teams of the batch on screen
  var $ = function (id) { return document.getElementById(id); };
  var TAB = { settings: 'Settings', types: 'Work Types', log: 'Work Log', ec: 'EC', events: 'Events', winners: 'Winners', stories: 'Stories', leaves: 'Leaves' };
  // the columns a tab must have, so a wrong or missing tab is never mistaken for another one
  var SIGN = {
    'Settings': ['setting', 'value'], 'Work Types': ['work type', 'points'], 'Work Log': ['intern', 'work type'],
    'EC': ['name', 'role'], 'Events': ['event', 'status'], 'Winners': ['activity', 'position'], 'Stories': ['section', 'title'], 'Leaves': ['name', 'from', 'to'],
    team: ['name', 'status']
  };
  var RESERVED = ['name', 'institution', 'status', 'lead grade', "lead's reason", 'lead reason', 'highlight', 'certificate id',
    'points', 'work summary', 'rank', 'notes', 'note', 'team', 'email', 'phone', 'mobile', 'contact',
    'start date', 'end date', 'tenure start', 'tenure end', 'role', 'joined', 'left'];
  var GRADE = { O: 'Outstanding', A: 'Good', B: 'Average / below average' };

  var state = { batch: null, model: null, team: '', q: '', grade: '', evFilter: '', dutyFilter: '', loadedAt: null, timer: null, check: false };

  // ------------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function safeUrl(u) { u = String(u || '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : ''; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').trim()); return isFinite(n) ? n : 0; }
  function key(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function initials(n) { return String(n).replace(/^(dr|mr|ms|mrs|tr)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function fmt(n) { return Math.round(n).toLocaleString('en-IN'); }
  function teamOf(name) { return ALL_TEAMS.filter(function (t) { return t.name === name; })[0] || { name: name, short: name, color: '#24407f' }; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function timeNow(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  // ------------------------------------------------------------------ CSV
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // turn a grid into { headers, rows } where each row is keyed by the lower-case header
  function table(grid) {
    if (!grid.length) return { headers: [], rows: [] };
    var headers = grid[0].map(function (h) { return String(h).trim(); });
    var rows = grid.slice(1).map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { if (h) o[key(h)] = String(r[i] == null ? '' : r[i]).trim(); });
      return o;
    }).filter(function (o) { return Object.keys(o).some(function (k) { return o[k]; }); });
    return { headers: headers, rows: rows };
  }
  function fromObjects(list) {   // saved copies are lists of objects
    var headers = [];
    (list || []).forEach(function (o) { Object.keys(o).forEach(function (h) { if (headers.indexOf(h) < 0) headers.push(h); }); });
    return table([headers].concat((list || []).map(function (o) { return headers.map(function (h) { return o[h]; }); })));
  }
  function signed(name, t) {
    var need = SIGN[name] || SIGN.team, have = t.headers.map(key);
    return need.every(function (n) { return have.indexOf(n) >= 0; });
  }

  // ------------------------------------------------------------------ loading
  function tabNames() { return [TAB.settings, TAB.types, TAB.log, TAB.ec, TAB.events, TAB.winners, TAB.stories, TAB.leaves].concat(TEAMS.map(function (t) { return t.name; })); }
  function sheetId(s) { var m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s || ''); return m ? m[1] : String(s || '').trim(); }
  function fetchText(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  }
  function load(batch) {
    var names = tabNames(), out = {}, warnings = [];
    function keep(name, t) {
      if (!t.headers.length || !signed(name, t)) { if (t.headers.length || (batch.sheet && name !== TAB.leaves)) warnings.push('Tab "' + name + '" is missing or its column headings were changed.'); out[name] = { headers: [], rows: [] }; }
      else out[name] = t;
    }
    if (batch.file) {
      return fetchText(batch.file + '?t=' + Date.now()).then(function (txt) {
        var d = JSON.parse(txt);
        names.forEach(function (n) { var t = fromObjects(d[n]); if (t.headers.length) keep(n, t); else out[n] = t; });
        return { tabs: out, warnings: warnings };
      });
    }
    var base;
    if (batch.sheet) {
      var id = sheetId(batch.sheet);
      base = function (n) { return 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(id) + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(n) + '&t=' + Date.now(); };
    } else if (batch.csv) {
      base = function (n) { return batch.csv + encodeURIComponent(n) + '.csv?t=' + Date.now(); };
    } else return Promise.reject(new Error('not-connected'));
    var failed = 0, privateSheet = false;
    return Promise.all(names.map(function (n) {
      return fetchText(base(n)).then(function (txt) {
        if (/^\s*</.test(txt)) { privateSheet = true; throw new Error('not-shared'); }   // Google sends a sign-in page when the sheet is private
        keep(n, table(parseCSV(txt)));
      }).catch(function () {                                    // one unreadable tab should not blank the whole page
        failed++; out[n] = { headers: [], rows: [] }; warnings.push('Tab "' + n + '" could not be read.');
      });
    })).then(function () {
      if (privateSheet) throw new Error('not-shared');
      if (failed === names.length) throw new Error('unreachable');
      return { tabs: out, warnings: warnings };
    });
  }

  // ------------------------------------------------------------------ dates and time on duty
  // Days are whole calendar days, counted as numbers (days since 1 Jan 1970) so leap years and month ends need no special care.
  var MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function dayNum(y, m, d) {
    var t = Date.UTC(y, m - 1, d), dt = new Date(t);
    return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? Math.round(t / 864e5) : null;
  }
  function parseDay(s, year) {
    s = String(s || '').trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/,/g, ' ').replace(/\s+/g, ' ');
    var m, mo;
    if (!s) return null;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return dayNum(+m[1], +m[2], +m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s))) return dayNum(+m[3] < 100 ? +m[3] + 2000 : +m[3], +m[2], +m[1]);   // day first, as in India
    if ((m = /^(\d{1,2})[ \-]([A-Za-z]{3,})\.?(?:[ \-](\d{2,4}))?$/.exec(s))) {
      mo = MON.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; var y = m[3] ? (+m[3] < 100 ? +m[3] + 2000 : +m[3]) : year;
      return mo && y ? dayNum(y, mo, +m[1]) : null;
    }
    if ((m = /^([A-Za-z]{3,})\.? (\d{1,2})(?: (\d{4}))?$/.exec(s))) {
      mo = MON.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; var y2 = m[3] ? +m[3] : year;
      return mo && y2 ? dayNum(y2, mo, +m[2]) : null;
    }
    return null;
  }
  // a date written without a year ("27 Nov") is placed in the year that keeps it near the batch
  function parseNear(s, anchor) {
    var y = new Date(anchor * 864e5).getUTCFullYear(), d = parseDay(s, y);
    if (d != null && !/\d{4}/.test(s) && !/\d+[\/.\-]\d+[\/.\-]\d+/.test(s) && d < anchor - 60) d = parseDay(s, y + 1);
    return d;
  }
  function fmtDay(n, short) {
    var d = new Date(n * 864e5), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return d.getUTCDate() + ' ' + mon + (short ? '' : ' ' + d.getUTCFullYear());
  }
  function todayNum() {
    var t = new URLSearchParams(location.search).get('today'), d = t ? parseDay(t) : null;   // ?today= is only for trying out dates
    if (d != null) return d;
    var n = new Date(); return dayNum(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }
  function dutyOf(start, end, leaves, need, today) {
    if (start == null || end == null || end < start) return null;
    var total = end - start + 1, asOf = Math.min(today, end), elapsed = Math.max(0, asOf - start + 1);
    var parts = leaves.map(function (l) { return [Math.max(l.a, start), Math.min(l.b, end)]; })
      .filter(function (l) { return l[0] <= l[1]; }).sort(function (x, y) { return x[0] - y[0]; });
    var merged = [];
    parts.forEach(function (l) { var last = merged[merged.length - 1]; if (last && l[0] <= last[1] + 1) last[1] = Math.max(last[1], l[1]); else merged.push(l.slice()); });
    var leaveTotal = 0, leaveSoFar = 0;
    merged.forEach(function (l) { leaveTotal += l[1] - l[0] + 1; if (l[0] <= asOf) leaveSoFar += Math.min(l[1], asOf) - l[0] + 1; });
    var d = {
      start: start, end: end, total: total, elapsed: elapsed, leaveTotal: leaveTotal, leaveSoFar: leaveSoFar,
      active: elapsed - leaveSoFar, planned: total - leaveTotal,
      phase: today < start ? 'upcoming' : today > end ? 'done' : 'running',
      breaks: merged.map(function (l) { return { a: l[0], b: l[1], when: l[1] < today ? 'past' : l[0] > today ? 'future' : 'now' }; })
    };
    d.onLeave = d.breaks.some(function (b) { return b.when === 'now'; });
    d.pct = elapsed ? d.active / elapsed : null;
    d.projPct = d.planned / total;
    d.flag = d.projPct < need ? (d.phase === 'done' ? 'Extension recommended' : 'Extension may be needed') : '';
    return d;
  }

  // ------------------------------------------------------------------ the model
  function build(tabs, batch, warnings) {
    var S = {};
    tabs[TAB.settings].rows.forEach(function (r) { if (r.setting) S[key(r.setting)] = r.value || ''; });
    var types = tabs[TAB.types].rows.filter(function (r) { return r['work type']; }).map(function (r) {
      return { team: r.team || 'All teams', name: r['work type'], points: num(r.points), why: r['why this many points'] || r.why || '' };
    });
    function pointsFor(team, type) {
      var hits = types.filter(function (w) { return key(w.name) === key(type); });
      if (!hits.length) return null;
      var own = hits.filter(function (w) { return key(w.team) === key(team) || key('team ' + w.team) === key(team); })[0];
      var all = hits.filter(function (w) { return /^(all|all teams|everyone)?$/i.test(w.team.trim()); })[0];
      return (own || all || hits[0]).points;
    }
    function setting(name, team, fallback) {
      var v = S[key(name + ' (' + team + ')')];
      if (v == null || v === '') v = S[key(name)];
      return v == null || v === '' ? fallback : num(v);
    }
    var interns = [], byName = {}, issues = warnings.slice();
    TEAMS.forEach(function (team) {
      var t = tabs[team.name];
      t.rows.forEach(function (r) {
        var name = (r.name || '').replace(/\s+/g, ' ').trim();
        if (!name) return;
        var counts = {};
        t.headers.forEach(function (h) {
          if (!h || RESERVED.indexOf(key(h)) >= 0) return;
          var v = num(r[key(h)]);
          if (v > 0) counts[h] = v;
        });
        var st = key(r.status);
        var it = {
          name: name, team: team.name, institution: r.institution || '', counts: counts, links: [],
          status: /drop/.test(st) ? 'Dropped' : /inactive|left/.test(st) ? 'Inactive' : /break/.test(st) ? 'On break' : 'Active',
          override: r.points != null && r.points !== '' ? num(r.points) : null, summary: r['work summary'] || '',
          leadGrade: /^[OAB]$/.test((r['lead grade'] || '').trim().toUpperCase().charAt(0)) && (r['lead grade'] || '').trim().length <= 3 ? r['lead grade'].trim().toUpperCase().charAt(0) : '',
          leadReason: r["lead's reason"] || r['lead reason'] || '', highlight: r.highlight || '', certId: (r['certificate id'] || '').trim(),
          startRaw: r['start date'] || r.joined || '', endRaw: r['end date'] || r.left || ''
        };
        if (byName[key(name)]) issues.push('"' + name + '" appears more than once. Each name should be listed once.');
        byName[key(name)] = it;
        interns.push(it);
      });
    });
    // quick log entries add to the counts
    tabs[TAB.log].rows.forEach(function (r) {
      var it = byName[key((r.intern || '').replace(/\s+/g, ' '))];
      if (!r.intern && !r['work type']) return;
      if (!it) { issues.push('Work Log: no intern called "' + (r.intern || '(blank)') + '" in any team tab.'); return; }
      var type = (r['work type'] || '').trim();
      if (!type) { issues.push('Work Log: an entry for ' + it.name + ' has no work type.'); return; }
      var existing = Object.keys(it.counts).filter(function (k) { return key(k) === key(type); })[0];
      var c = r.count === '' || r.count == null ? 1 : num(r.count);
      it.counts[existing || type] = (it.counts[existing || type] || 0) + c;
      var link = safeUrl(r.link);
      if (link || r.note) it.links.push({ type: type, link: link, date: r.date || '', note: r.note || '' });
    });
    var unscored = {};
    interns.forEach(function (it) {
      var pts = 0, pieces = 0, parts = [];
      Object.keys(it.counts).forEach(function (k) {
        var c = it.counts[k], p = pointsFor(it.team, k);
        pieces += c;
        if (p == null) unscored[k] = 1;
        parts.push({ type: k, count: c, each: p, total: p == null ? 0 : c * p });
        pts += p == null ? 0 : c * p;
      });
      parts.sort(function (a, b) { return b.total - a.total || b.count - a.count; });
      it.parts = parts; it.pieces = pieces; it.kinds = parts.filter(function (p) { return p.count > 0; }).length;
      it.points = it.override != null ? it.override : pts;
      var oP = setting('O needs points', it.team, 110), oK = setting('O needs work types', it.team, 3), aP = setting('A needs points', it.team, 45);
      it.rule = { oP: oP, oK: oK, aP: aP };
      var list = parts.slice(0, 6).map(function (p) { return p.count + ' ' + p.type; }).join(', ') + (parts.length > 6 ? ' and more' : '');
      if (it.status === 'Inactive' || it.status === 'Dropped') {
        it.suggested = 'B';
        it.why = 'Marked ' + it.status.toLowerCase() + ' for this batch' + (pieces ? ', with ' + plural(pieces, 'recorded piece') + ' of work.' : ' with no recorded work.');
      } else if (!pieces && it.override == null) {
        it.suggested = 'B'; it.why = 'No work recorded yet.';
      } else {
        it.suggested = it.points >= oP && it.kinds >= oK ? 'O' : it.points >= aP ? 'A' : 'B';
        var head = fmt(it.points) + ' points from ' + plural(pieces, 'piece') + ' of work in ' + plural(it.kinds, 'work type') + (list ? ' (' + list + ').' : '.');
        var rule = it.suggested === 'O' ? ' That meets the O mark of ' + oP + ' points across ' + oK + ' or more work types.'
          : it.suggested === 'A' ? (it.points >= oP ? ' O also needs at least ' + oK + ' different work types; this is ' + it.kinds + '.' : ' A needs ' + aP + ' points; O needs ' + oP + ' points across ' + oK + ' work types.')
          : ' A needs ' + aP + ' points.';
        it.why = head + rule;
      }
      if (batch.archived) { it.grade = it.leadGrade; it.source = 'final'; }
      else if (it.leadGrade) { it.grade = it.leadGrade; it.source = it.leadGrade === it.suggested ? 'agreed' : 'differs'; }
      else { it.grade = it.suggested; it.source = 'suggested'; }
      if (!batch.archived && it.source === 'differs' && !it.leadReason) issues.push(it.name + ': lead grade ' + it.leadGrade + ' differs from the suggested ' + it.suggested + ' but has no reason.');
    });
    Object.keys(unscored).forEach(function (k) { issues.push('Work type "' + k + '" is not in the Work Types tab, so it earns no points.'); });
    // ranks: overall and within each team (inactive and dropped interns are not ranked)
    function rankList(list) {
      list.sort(function (a, b) { return b.points - a.points || b.pieces - a.pieces || a.name.localeCompare(b.name); });
      var r = 0, prev = null;
      return list.map(function (it, i) { if (prev === null || it.points !== prev) { r = i + 1; prev = it.points; } return r; });
    }
    var rankable = interns.filter(function (it) { return (it.status === 'Active' || it.status === 'On break') && it.points > 0; });
    var ranks = rankList(rankable);
    rankable.forEach(function (it, i) { it.rank = ranks[i]; });
    TEAMS.forEach(function (t) {
      var tl = rankable.filter(function (it) { return it.team === t.name; }), tr = rankList(tl);
      tl.forEach(function (it, i) { it.teamRank = tr[i]; });
    });
    // time on duty: batch dates, personal start/end dates and the Leaves tab
    var today = todayNum(), anchor0 = parseDay(S['batch start']) || today;
    var bStart = parseNear(S['batch start'], anchor0), bEnd = parseNear(S['batch end'], anchor0);
    if (S['batch start'] && bStart == null) issues.push('Settings: could not read the Batch start date "' + S['batch start'] + '". Write it like 1 Dec 2026.');
    if (S['batch end'] && bEnd == null) issues.push('Settings: could not read the Batch end date "' + S['batch end'] + '". Write it like 28 Feb 2027.');
    var need = (num(S['active % needed']) || 75) / 100, anchor = bStart || today, leaves = {};
    tabs[TAB.leaves].rows.forEach(function (r) {
      if (!r.name) return;
      var a = parseNear(r.from, anchor), b = r.to ? parseNear(r.to, anchor) : a;
      if (a == null || b == null) { issues.push('Leaves: could not read the dates for ' + r.name + ' ("' + (r.from || '') + '" to "' + (r.to || '') + '"). Write them like 27 Nov 2026.'); return; }
      if (b < a) { issues.push('Leaves: for ' + r.name + ' the "To" date is before the "From" date.'); return; }
      (leaves[key(r.name.replace(/\s+/g, ' '))] = leaves[key(r.name.replace(/\s+/g, ' '))] || []).push({ a: a, b: b, name: r.name });
    });
    var used = {};
    function personDuty(name, sRaw, eRaw, what) {
      var s = sRaw ? parseNear(sRaw, anchor) : bStart, e = eRaw ? parseNear(eRaw, anchor) : bEnd;
      if (sRaw && s == null) issues.push(name + ': could not read the ' + what + ' start date "' + sRaw + '".');
      if (eRaw && e == null) issues.push(name + ': could not read the ' + what + ' end date "' + eRaw + '".');
      used[key(name)] = 1;
      return dutyOf(s, e, leaves[key(name)] || [], need, today);
    }
    interns.forEach(function (it) { it.duty = personDuty(it.name, it.startRaw, it.endRaw, 'internship'); });
    var ecRows = tabs[TAB.ec].rows.filter(function (r) { return r.name; });
    ecRows.forEach(function (r) { r.duty = personDuty(r.name, r['tenure start'], r['tenure end'], 'tenure'); });
    Object.keys(leaves).forEach(function (k) {
      if (used[k]) return;
      var l = leaves[k][0], inBatch = bStart == null || bEnd == null || leaves[k].some(function (x) { return x.b >= bStart && x.a <= bEnd; });
      if (inBatch) issues.push('Leaves: "' + l.name + '" is not in any team tab or the EC tab.');
    });

    var ordered = rankable.concat(interns.filter(function (it) { return rankable.indexOf(it) < 0; }).sort(function (a, b) { return a.name.localeCompare(b.name); }));
    return {
      S: S, types: types, interns: ordered, issues: issues,
      ec: ecRows, need: need, today: today, bStart: bStart, bEnd: bEnd,
      events: tabs[TAB.events].rows.filter(function (r) { return r.event; }),
      winners: tabs[TAB.winners].rows.filter(function (r) { return r.name && r.activity; }),
      stories: tabs[TAB.stories].rows.filter(function (r) { return r.title || r.details; })
    };
  }

  // ------------------------------------------------------------------ drawing
  function chip(team) { var t = teamOf(team); return '<span class="tchip" style="--tc:' + t.color + '">' + esc(t.short) + '</span>'; }
  function avatar(it, big) { return '<span class="av' + (big ? ' big' : '') + '" style="--tc:' + teamOf(it.team).color + '" aria-hidden="true">' + esc(initials(it.name)) + '</span>'; }
  function badge(g, small) { return g ? '<span class="grade g' + g + (small ? ' sm' : '') + '" title="' + esc(GRADE[g]) + '">' + g + '</span>' : '<span class="grade gP' + (small ? ' sm' : '') + '" title="Pending">–</span>'; }
  function medal(r) { return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : ''; }

  function drawHero(m, batch) {
    var S = m.S, n = m.interns.length;
    $('heroTitle').textContent = (S['batch name'] || batch.label) + ' Leaderboard';
    $('eyebrow').textContent = C.orgName + (S.period ? ' · ' + S.period : '');
    $('heroSub').textContent = S.tagline || 'Every intern\'s work, points and grade in one place, with the reasons behind them.';
    var act = m.interns.filter(function (i) { return i.status === 'Active' || i.status === 'On break'; }).length;
    var pieces = m.interns.reduce(function (s, i) { return s + i.pieces; }, 0);
    var pts = m.interns.reduce(function (s, i) { return s + i.points; }, 0);
    var o = m.interns.filter(function (i) { return i.grade === 'O'; }).length;
    var stats = [[n, 'Interns'], [act, 'Active'], pieces ? [fmt(pieces), 'Pieces of work'] : [fmt(pts), 'Total points'], [o, 'Outstanding (O)']];
    if (m.events.length) stats.push([m.events.length, 'Events']);
    if (m.ec.length) stats.push([m.ec.length, 'EC members']);
    $('stats').innerHTML = stats.map(function (s) { return '<div class="stat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join('');
    document.title = (S['batch name'] || batch.label) + ' Leaderboard | ' + C.orgName;
  }

  function drawPodium(m) {
    var top = m.interns.filter(function (i) { return i.rank && i.rank <= 3 && i.points > 0; }).slice(0, 3);
    $('podiumSec').hidden = !top.length;
    var order = [top[1], top[0], top[2]].filter(Boolean);
    $('podium').innerHTML = order.map(function (it) {
      return '<div class="pod p' + it.rank + '" style="--tc:' + teamOf(it.team).color + '">' +
        '<div class="medal" aria-label="Rank ' + it.rank + '">' + medal(it.rank) + '</div>' + avatar(it, true) +
        '<h3>' + esc(it.name) + '</h3><p class="inst">' + esc(it.institution || teamOf(it.team).name) + '</p>' +
        '<div class="pod-row">' + chip(it.team) + badge(it.grade, true) + '</div>' +
        '<div class="pod-pts"><b>' + fmt(it.points) + '</b> points</div></div>';
    }).join('');
  }

  function workHtml(it) {
    if (!it.parts.length) return it.summary ? '<p class="summary">' + esc(it.summary) + '</p>' : '<p class="muted">No work recorded.</p>';
    return '<ul class="work">' + it.parts.map(function (p) {
      return '<li><span class="wc">' + fmt(p.count) + '×</span><span class="wt">' + esc(p.type) + '</span><span class="wp">' +
        (p.each == null ? 'not scored' : fmt(p.total) + ' pts') + '</span></li>';
    }).join('') + '</ul>';
  }
  function gradeHtml(it, batch) {
    var h = '<div class="gbox">' + badge(it.grade) + '<div><b>' + esc(it.grade ? GRADE[it.grade] : 'Grade pending') + '</b>';
    if (batch.archived) h += '<span>Final grade for this batch</span></div></div>' + (it.leadReason || it.summary ? '<p>' + esc(it.leadReason || it.summary) + '</p>' : '');
    else if (it.source === 'suggested') h += '<span>Suggested by the points system. Awaiting the team lead\'s review.</span></div></div><p>' + esc(it.why) + '</p>';
    else if (it.source === 'agreed') h += '<span>Given by the team lead, matching the points system.</span></div></div><p>' + esc(it.why) + '</p>' + (it.leadReason ? '<p class="lead-note"><b>Lead\'s note:</b> ' + esc(it.leadReason) + '</p>' : '');
    else h += '<span>Given by the team lead. The points system suggested ' + it.suggested + '.</span></div></div>' +
      '<p class="lead-note"><b>Lead\'s reason:</b> ' + (it.leadReason ? esc(it.leadReason) : '<i>No reason given yet.</i>') + '</p><p class="muted">Points system: ' + esc(it.why) + '</p>';
    if (it.highlight) h += '<p class="hl">★ ' + esc(it.highlight) + '</p>';
    if (it.certId && safeUrl(C.credentialHubUrl)) h += '<a class="btn" target="_blank" rel="noopener" href="' + esc(C.credentialHubUrl + '?id=' + encodeURIComponent(it.certId.toUpperCase())) + '">Verify certificate ↗</a>';
    return h;
  }
  function linksHtml(it) {
    if (!it.links.length) return '';
    return '<div class="links"><h4>Logged work</h4><ul>' + it.links.slice(-12).reverse().map(function (l) {
      var label = esc((l.date ? l.date + ' · ' : '') + l.type + (l.note ? ': ' + l.note : ''));
      return '<li>' + (l.link ? '<a href="' + esc(l.link) + '" target="_blank" rel="noopener">' + label + ' ↗</a>' : label) + '</li>';
    }).join('') + '</ul></div>';
  }

  function drawBoard() {
    var m = state.model, batch = state.batch;
    var counts = {}; m.interns.forEach(function (i) { counts[i.team] = (counts[i.team] || 0) + 1; });
    $('teamTabs').innerHTML = [['', 'All teams', m.interns.length, '#24407f']].concat(TEAMS.map(function (t) { return [t.name, t.short, counts[t.name] || 0, t.color]; }))
      .map(function (t) { return '<button type="button" role="tab" class="chipbtn" style="--tc:' + t[3] + '" aria-selected="' + (state.team === t[0]) + '" data-team="' + esc(t[0]) + '">' + esc(t[1]) + ' <small>' + t[2] + '</small></button>'; }).join('');
    var q = key(state.q);
    var list = m.interns.filter(function (i) {
      return (!state.team || i.team === state.team) && (!state.grade || i.grade === state.grade) &&
        (!q || key(i.name).indexOf(q) >= 0 || key(i.institution).indexOf(q) >= 0);
    });
    $('count').textContent = 'Showing ' + list.length + ' of ' + m.interns.length + ' interns' + (state.team ? ', ranked within ' + teamOf(state.team).short : ', ranked across all teams');
    if (!list.length) { $('board').innerHTML = '<div class="empty">No interns match.</div>'; return; }
    var wasOpen = Array.prototype.map.call(document.querySelectorAll('#board details[open]'), function (d) { return d.getAttribute('data-name'); });
    var max = Math.max.apply(null, m.interns.map(function (i) { return i.points; }).concat([1]));
    $('board').innerHTML = '<div class="rows">' + list.map(function (it) {
      var r = state.team ? it.teamRank : it.rank;
      var rankCell = r ? (r <= 3 ? '<span class="rk m">' + medal(r) + '</span>' : '<span class="rk">' + r + '</span>') : '<span class="rk na" title="Not ranked">–</span>';
      var tag = it.status !== 'Active' ? '<span class="st">' + esc(it.status) + '</span>' : '';
      var src = batch.archived ? '' : it.source === 'suggested' ? '<span class="src">suggested</span>' : it.source === 'differs' ? '<span class="src warn">lead</span>' : '';
      return '<details class="row" data-name="' + esc(it.name) + '"' + (wasOpen.indexOf(it.name) >= 0 ? ' open' : '') + ' style="--tc:' + teamOf(it.team).color + '"><summary>' + rankCell + avatar(it) +
        '<span class="who"><b>' + esc(it.name) + '</b>' + tag + '<small>' + esc(it.institution || teamOf(it.team).name) + '</small></span>' +
        '<span class="tc">' + chip(it.team) + '</span>' +
        '<span class="pts"><b>' + fmt(it.points) + '</b><small>pts</small><i style="width:' + Math.max(2, it.points / max * 100).toFixed(1) + '%"></i></span>' +
        '<span class="gr">' + badge(it.grade) + src + '</span><span class="chev" aria-hidden="true">›</span></summary>' +
        '<div class="detail"><div><h4>Work counted</h4>' + workHtml(it) + linksHtml(it) + (it.duty ? '<h4>Time on duty</h4><div class="mini">' + ring(it.duty, teamOf(it.team).color) + '<div>' + dutyText(it.duty, true) + '</div></div>' : '') + '</div><div><h4>Grade</h4>' + gradeHtml(it, batch) + '</div></div></details>';
    }).join('') + '</div>';
  }

  function drawTeams() {
    var m = state.model;
    $('teamCards').innerHTML = TEAMS.map(function (t) {
      var l = m.interns.filter(function (i) { return i.team === t.name; });
      if (!l.length) return '';
      var g = { O: 0, A: 0, B: 0, P: 0 }; l.forEach(function (i) { g[i.grade || 'P']++; });
      var pieces = l.reduce(function (s, i) { return s + i.pieces; }, 0), pts = l.reduce(function (s, i) { return s + i.points; }, 0);
      var mix = {}; l.forEach(function (i) { i.parts.forEach(function (p) { mix[p.type] = (mix[p.type] || 0) + p.count; }); });
      var top = Object.keys(mix).sort(function (a, b) { return mix[b] - mix[a]; }).slice(0, 5), mm = top.length ? mix[top[0]] : 1;
      var best = l.filter(function (i) { return i.teamRank === 1; }).map(function (i) { return i.name; });
      var bar = ['O', 'A', 'B', 'P'].filter(function (k) { return g[k]; }).map(function (k) {
        return '<i class="s' + k + '" style="flex:' + g[k] + '" title="' + (k === 'P' ? 'Pending' : k) + ': ' + g[k] + '"></i>';
      }).join('');
      return '<article class="tcard" style="--tc:' + t.color + '"><header><h3>' + esc(t.name) + '</h3><span>' + plural(l.length, 'intern') + '</span></header>' +
        '<div class="tnums"><div><b>' + fmt(pts) + '</b><span>points</span></div>' + (pieces ? '<div><b>' + fmt(pieces) + '</b><span>pieces of work</span></div>' : '') +
        '<div><b>' + g.O + '</b><span>O grades</span></div></div>' +
        '<div class="gbar" aria-label="Grades: ' + g.O + ' O, ' + g.A + ' A, ' + g.B + ' B' + (g.P ? ', ' + g.P + ' pending' : '') + '">' + bar + '</div>' +
        '<div class="glegend"><span><i class="sO"></i>O ' + g.O + '</span><span><i class="sA"></i>A ' + g.A + '</span><span><i class="sB"></i>B ' + g.B + '</span>' + (g.P ? '<span><i class="sP"></i>Pending ' + g.P + '</span>' : '') + '</div>' +
        (top.length ? '<h4>Most work</h4><ul class="mix">' + top.map(function (k) {
          return '<li><span>' + esc(k) + '</span><span class="mb"><i style="width:' + (mix[k] / mm * 100).toFixed(1) + '%"></i></span><b>' + fmt(mix[k]) + '</b></li>';
        }).join('') + '</ul>' : '') +
        (best.length ? '<p class="best">🏆 Top of the team: <b>' + esc(best.join(', ')) + '</b></p>' : '') + '</article>';
    }).join('');
  }

  function drawGrading() {
    var m = state.model, batch = state.batch, h = '';
    var r = m.interns[0] ? m.interns[0].rule : { oP: 110, oK: 3, aP: 45 };
    if (m.types.length) {
      h += '<div class="rules">' +
        '<div class="rule">' + badge('O') + '<div><b>Outstanding</b><span>' + r.oP + '+ points, from at least ' + r.oK + ' different work types</span></div></div>' +
        '<div class="rule">' + badge('A') + '<div><b>Good</b><span>' + r.aP + '+ points</span></div></div>' +
        '<div class="rule">' + badge('B') + '<div><b>Average / below average</b><span>under ' + r.aP + ' points, or inactive</span></div></div></div>';
      h += '<p class="lead">Every piece of work earns points based on the effort it takes, so teams with longer projects are not at a disadvantage: a podcast episode takes a week or two, a graphic a day. The points system suggests a grade; the team lead gives the final grade and writes a reason whenever it differs.</p>';
      if (batch.archived) h += '<p class="note">This is a finished batch. Its grades are the final grades given at the time; points and ranks are worked out with the table below.</p>';
      h += '<div class="types">' + TEAMS.map(function (t) {
        var own = m.types.filter(function (w) { return key(w.team) === key(t.name) || key('team ' + w.team) === key(t.name); });
        if (!own.length) return '';
        return '<div class="tcol" style="--tc:' + t.color + '"><h3>' + esc(t.short) + '</h3><table><tbody>' + own.map(function (w) {
          return '<tr><td>' + esc(w.name) + (w.why ? '<small>' + esc(w.why) + '</small>' : '') + '</td><td class="n">' + fmt(w.points) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      }).join('') + (function () {
        var all = m.types.filter(function (w) { return /^(all|all teams|everyone)?$/i.test(w.team.trim()); });
        return all.length ? '<div class="tcol" style="--tc:#24407f"><h3>All teams</h3><table><tbody>' + all.map(function (w) {
          return '<tr><td>' + esc(w.name) + (w.why ? '<small>' + esc(w.why) + '</small>' : '') + '</td><td class="n">' + fmt(w.points) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '';
      })() + '</div>';
    } else if (m.S['scoring note']) {
      h += '<p class="lead">Points for this batch were scored with this key:</p><p class="keynote">' + esc(m.S['scoring note']) + '</p>' +
        '<p class="note">This is a finished batch. Grades shown are the final grades given at the time.</p>';
    } else h += '<p class="lead">The points table for this batch has not been added yet.</p>';
    $('gradingBody').innerHTML = h;
  }

  function dateBits(d) {
    var mm = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})/.exec(d || '');
    return mm ? '<b>' + esc(mm[1]) + '</b><span>' + esc(mm[2].slice(0, 3)) + '</span>' : '<span class="tx">' + esc(d || 'TBD') + '</span>';
  }
  function drawJourney() {
    var m = state.model, h = '', ev = m.events;
    if (ev.length) {
      var kinds = []; ev.forEach(function (e) { var s = e.status || 'Completed'; if (kinds.indexOf(s) < 0) kinds.push(s); });
      if (kinds.indexOf(state.evFilter) < 0) state.evFilter = '';
      var show = ev.filter(function (e) { return !state.evFilter || (e.status || 'Completed') === state.evFilter; });
      h += '<h3 class="sub">Events</h3>' + (kinds.length > 1 ? '<div class="chips ev" id="evTabs">' + [''].concat(kinds).map(function (k) {
        return '<button type="button" class="chipbtn" aria-selected="' + (state.evFilter === k) + '" data-ev="' + esc(k) + '">' + esc(k || 'All') + '</button>';
      }).join('') + '</div>' : '');
      h += '<ol class="timeline">' + show.map(function (e) {
        var st = e.status || 'Completed', link = safeUrl(e.link);
        return '<li><div class="dt">' + dateBits(e.date) + '</div><div class="ev-body"><h4>' + esc(e.event) + '</h4>' +
          '<div class="tags">' + (e.type ? '<span class="tag">' + esc(e.type) + '</span>' : '') + '<span class="tag s-' + esc(key(st).replace(/[^a-z]/g, '')) + '">' + esc(st) + '</span></div>' +
          (e.description ? '<p>' + esc(e.description) + '</p>' : '') + (e.people ? '<p class="people">👥 ' + esc(e.people) + '</p>' : '') +
          (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">More ↗</a>' : '') + '</div></li>';
      }).join('') + '</ol>';
    }
    if (m.winners.length) {
      var groups = {}, order = [];
      m.winners.forEach(function (w) { var g = w.event || 'Winners'; if (!groups[g]) { groups[g] = {}; order.push(g); } (groups[g][w.activity] = groups[g][w.activity] || []).push(w); });
      var rankOf = function (p) { var k = key(p); return /^(1|1st|first|winner|gold)/.test(k) ? 1 : /^(2|2nd|second|silver|runner)/.test(k) ? 2 : /^(3|3rd|third|bronze)/.test(k) ? 3 : 4; };
      var icon = ['', '🥇', '🥈', '🥉', '🏅'];
      h += order.map(function (g) {
        return '<h3 class="sub">🏆 ' + esc(g) + '</h3><div class="awards">' + Object.keys(groups[g]).map(function (a) {
          return '<div class="award"><h4>' + esc(a) + '</h4>' + groups[g][a].slice().sort(function (x, y) { return rankOf(x.position) - rankOf(y.position); }).map(function (w) {
            return '<div class="win"><span aria-hidden="true">' + icon[rankOf(w.position)] + '</span><div><b>' + esc(w.name) + '</b><small>' + esc([w.position, w.team, w.note].filter(Boolean).join(' · ')) + '</small></div></div>';
          }).join('') + '</div>';
        }).join('') + '</div>';
      }).join('');
    }
    if (m.stories.length) {
      var sec = {}, so = [];
      m.stories.forEach(function (s) { var k = s.section || 'Highlights'; if (!sec[k]) { sec[k] = []; so.push(k); } sec[k].push(s); });
      h += so.map(function (k) {
        return '<h3 class="sub">' + esc(k) + '</h3><div class="stories">' + sec[k].map(function (s) {
          var link = safeUrl(s.link);
          return '<article class="story">' + (s.date ? '<span class="sdate">' + esc(s.date) + '</span>' : '') + '<h4>' + esc(s.title || k) + '</h4>' +
            (s.details ? '<p>' + esc(s.details) + '</p>' : '') + (s.people ? '<p class="people">👥 ' + esc(s.people) + '</p>' : '') +
            (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Open ↗</a>' : '') + '</article>';
        }).join('') + '</div>';
      }).join('');
    }
    $('journey').hidden = !h && state.batch.archived;
    $('journeyBody').innerHTML = h || '<div class="empty">Nothing added yet. Events, winners and stories appear here as soon as they are added to the sheet\'s Events, Winners and Stories tabs.</div>';
  }

  function drawEC() {
    var m = state.model;
    $('council').hidden = !m.ec.length;
    var groups = {}, order = [];
    m.ec.forEach(function (e) { var r = e.role || 'Council'; if (!groups[r]) { groups[r] = []; order.push(r); } groups[r].push(e); });
    $('ecBody').innerHTML = order.map(function (r) {
      return '<h3 class="sub">' + esc(r) + '</h3><div class="ecs">' + groups[r].map(function (e) {
        return '<div class="ec"><span class="av" style="--tc:#24407f" aria-hidden="true">' + esc(initials(e.name)) + '</span><div><b>' + esc(e.name) + '</b><small>' + esc([e.area, e.note].filter(Boolean).join(' · ')) + '</small></div></div>';
      }).join('') + '</div>';
    }).join('');
  }

  // ------------------------------------------------------------------ time on duty
  function ring(d, color, big) {
    var r = 50, c = 2 * Math.PI * r, w = d.active / d.total, l = d.leaveTotal / d.total;
    var arc = function (frac, off, cls, col) {
      if (frac <= 0) return '';
      return '<circle class="arc ' + cls + '" cx="60" cy="60" r="' + r + '" stroke="' + col + '" stroke-dasharray="' + (frac * c).toFixed(2) + ' ' + c.toFixed(2) + '" stroke-dashoffset="' + (-off * c).toFixed(2) + '"/>';
    };
    return '<svg class="ring' + (big ? ' big' : '') + '" viewBox="0 0 120 120" role="img" aria-label="' + plural(d.active, 'active day') + ' out of ' + d.total + ', ' + plural(d.leaveTotal, 'day') + ' on leave">' +
      '<circle class="track" cx="60" cy="60" r="' + r + '"/>' + arc(w, 0, 'work', color) + arc(l, w, 'leave', '#f0a43a') +
      '<text x="60" y="58" class="rn">' + d.active + '</text><text x="60" y="76" class="rl">of ' + d.total + ' days</text></svg>';
  }
  function dutyText(d, full) {
    var phase = d.phase === 'upcoming' ? 'Starts ' + fmtDay(d.start) : d.phase === 'done' ? 'Tenure completed' : 'Day ' + d.elapsed + ' of ' + d.total;
    var h = '<p class="dline"><b>' + phase + '</b>' + (d.pct != null ? ' · ' + Math.round(d.pct * 100) + '% of days so far active' : '') + '</p>' +
      '<p class="dline muted">' + fmtDay(d.start) + ' – ' + fmtDay(d.end) + '</p>' +
      '<p class="dline">' + (d.leaveTotal ? '🏖️ ' + plural(d.leaveTotal, 'day') + ' on leave in ' + plural(d.breaks.length, 'break') : '✅ No leave taken') + '</p>';
    if (full && d.breaks.length) h += '<div class="breaks">' + d.breaks.map(function (b) {
      return '<span class="brk ' + b.when + '">' + esc(fmtDay(b.a, true) + (b.b > b.a ? ' – ' + fmtDay(b.b, true) : '')) + (b.when === 'now' ? ' · on leave now' : b.when === 'future' ? ' · planned' : '') + '</span>';
    }).join('') + '</div>';
    if (d.flag) h += '<p class="flag">⚠️ ' + esc(d.flag) + ': ' + Math.round(d.projPct * 100) + '% of the tenure is active days</p>';
    return h;
  }
  function drawDuty() {
    var m = state.model, people = [];
    m.ec.forEach(function (e) { if (e.duty) people.push({ name: e.name, sub: [e.role, e.area].filter(Boolean).join(' · '), group: 'EC', color: '#24407f', d: e.duty }); });
    TEAMS.forEach(function (t) {
      m.interns.filter(function (i) { return i.team === t.name && i.duty; }).forEach(function (i) {
        people.push({ name: i.name, sub: t.name + (i.institution ? ' · ' + i.institution : ''), group: t.name, color: t.color, d: i.duty });
      });
    });
    $('duty').hidden = !people.length;
    if (!people.length) return;
    var groups = [['', 'Everyone']].concat(people.some(function (p) { return p.group === 'EC'; }) ? [['EC', 'EC']] : [])
      .concat(TEAMS.filter(function (t) { return people.some(function (p) { return p.group === t.name; }); }).map(function (t) { return [t.name, t.short]; }))
      .concat([['!', 'Needs attention']]);
    if (!groups.some(function (g) { return g[0] === state.dutyFilter; })) state.dutyFilter = '';
    var flagged = people.filter(function (p) { return p.d.flag; }).length, away = people.filter(function (p) { return p.d.onLeave; }).length;
    var list = people.filter(function (p) { return !state.dutyFilter || (state.dutyFilter === '!' ? p.d.flag : p.group === state.dutyFilter); });
    $('dutyStats').innerHTML = [[people.length, 'people tracked'], [away, 'on leave today'], [flagged, 'may need an extension'], [Math.round(m.need * 100) + '%', 'active days needed']]
      .map(function (s) { return '<div class="dstat"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></div>'; }).join('');
    $('dutyTabs').innerHTML = groups.map(function (g) { return '<button type="button" class="chipbtn" aria-selected="' + (state.dutyFilter === g[0]) + '" data-duty="' + esc(g[0]) + '">' + esc(g[1]) + '</button>'; }).join('');
    $('dutyGrid').innerHTML = list.length ? list.map(function (p) {
      return '<article class="dcard' + (p.d.flag ? ' flagged' : '') + '" style="--tc:' + p.color + '"><header><span class="av" style="--tc:' + p.color + '" aria-hidden="true">' + esc(initials(p.name)) + '</span>' +
        '<div><b>' + esc(p.name) + '</b><small>' + esc(p.sub) + '</small></div>' + (p.d.onLeave ? '<span class="away">On leave</span>' : '') + '</header>' +
        '<div class="dbody">' + ring(p.d, p.color, true) + '<div>' + dutyText(p.d, true) + '</div></div></article>';
    }).join('') : '<div class="empty">Nobody here.</div>';
  }

  function drawCheck() {
    var m = state.model;
    if (!state.check) return '';
    return '<section class="check"><h2>Sheet check</h2>' + (m.issues.length ? '<ul>' + m.issues.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '<p>No problems found. 👍</p>') + '</section>';
  }

  function drawAll() {
    var m = state.model, b = state.batch;
    drawHero(m, b); drawPodium(m); drawBoard(); drawTeams(); drawGrading(); drawJourney(); drawEC(); drawDuty();
    $('notice').innerHTML = drawCheck();
    $('content').hidden = false;
    $('foot').innerHTML = '<b>' + esc(C.orgName) + '</b> · ' + esc((m.S['batch name'] || b.label) + ' internship') +
      '<br>Grades come from the team leads, with the points system\'s suggestion and reasons shown for transparency.' +
      (safeUrl(C.credentialHubUrl) ? ' Certificates can be checked on the <a href="' + esc(C.credentialHubUrl) + '" target="_blank" rel="noopener">ANON Credential Hub</a>.' : '');
  }

  // ------------------------------------------------------------------ batch handling
  function notice(html) { $('notice').innerHTML = html; }
  function others(batch) {
    return C.batches.filter(function (b) { return b !== batch; }).map(function (b) { return '<button type="button" class="btn" data-go="' + esc(b.id) + '">View ' + esc(b.label) + '</button>'; }).join(' ');
  }
  function open(batch, quiet) {
    state.batch = batch;
    TEAMS = batch.teams ? ALL_TEAMS.filter(function (t) { return batch.teams.indexOf(t.name) >= 0; }) : ALL_TEAMS;
    if (!quiet && state.timer) { clearInterval(state.timer); state.timer = null; }
    if (!quiet) {
      $('content').hidden = true; $('stats').innerHTML = ''; $('updated').textContent = '';
      $('heroTitle').textContent = batch.label + ' Leaderboard'; $('heroSub').textContent = 'Loading…';
      notice('');
    }
    return load(batch).then(function (res) {
      if (state.batch !== batch) return;
      state.model = build(res.tabs, batch, res.warnings);
      state.loadedAt = new Date();
      drawAll();
      $('updated').textContent = batch.archived ? 'Final results' : (batch.sheet ? 'Live from the team sheet · ' : 'Updated ') + timeNow(state.loadedAt);
      if (!state.timer && !batch.archived && (batch.sheet || batch.csv)) {
        state.timer = setInterval(function () { open(batch, true); }, Math.max(1, C.refreshMinutes || 5) * 60000);
      }
    }).catch(function (err) {
      if (state.batch !== batch) return;
      if (quiet && state.model) { $('updated').textContent = 'Could not refresh just now · showing data from ' + timeNow(state.loadedAt); return; }
      $('heroSub').textContent = '';
      if (err.message === 'not-connected') {
        notice('<div class="setup"><h2>' + esc(batch.label) + ' is not connected yet</h2><p>Once the ' + esc(batch.label) + ' Google Sheet is linked in <code>assets/config.js</code>, its leaderboard appears here and updates by itself.</p><div class="row-btns">' + others(batch) + '</div></div>');
      } else {
        notice('<div class="setup bad"><h2>Could not read the ' + esc(batch.label) + ' sheet</h2><p>' +
          (err.message === 'not-shared' ? 'The sheet is not shared for viewing. In Google Sheets choose <b>Share → General access → Anyone with the link → Viewer</b>.' :
            'Check your internet connection and that the sheet is shared as <b>Anyone with the link → Viewer</b>, then reload.') +
          '</p><div class="row-btns">' + others(batch) + '</div></div>');
      }
    });
  }
  function pick(id, push) {
    var b = C.batches.filter(function (x) { return x.id === id; })[0] || C.batches.filter(function (x) { return x.id === C.defaultBatch; })[0] || C.batches[0];
    $('batch').value = b.id;
    if (push) {
      var u = new URL(location.href); u.searchParams.set('batch', b.id); history.pushState(null, '', u);
    }
    state.team = ''; state.q = ''; state.grade = ''; state.evFilter = ''; state.dutyFilter = ''; $('q').value = ''; $('fg').value = '';
    open(b);
  }

  // ------------------------------------------------------------------ events
  $('batch').innerHTML = C.batches.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(b.label) + '</option>'; }).join('');
  $('batch').addEventListener('change', function () { pick(this.value, true); });
  $('q').addEventListener('input', function () { state.q = this.value; drawBoard(); });
  $('fg').addEventListener('change', function () { state.grade = this.value; drawBoard(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-team]'); if (t && t.closest('#teamTabs')) { state.team = t.getAttribute('data-team'); drawBoard(); return; }
    var v = e.target.closest('[data-ev]'); if (v) { state.evFilter = v.getAttribute('data-ev'); drawJourney(); return; }
    var du = e.target.closest('[data-duty]'); if (du) { state.dutyFilter = du.getAttribute('data-duty'); drawDuty(); return; }
    var g = e.target.closest('[data-go]'); if (g) { pick(g.getAttribute('data-go'), true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  var menu = $('menu'), nav = $('nav');
  menu.addEventListener('click', function () { var o = nav.classList.toggle('open'); menu.setAttribute('aria-expanded', o); });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); } });
  window.addEventListener('popstate', function () { pick(new URLSearchParams(location.search).get('batch'), false); });
  var params = new URLSearchParams(location.search);
  state.check = params.has('check');
  pick(params.get('batch'), false);
})();
