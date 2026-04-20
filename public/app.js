// TERRAIN — Experience Revenue Intelligence
// Interactive JS

document.addEventListener('DOMContentLoaded', async () => {
  await loadLodgeData();
  buildDemandHeatmap();
  initBundleBuilder();
  animateEntrance();
});

// ---- Load Real Lodge Data into inner pages ----
async function loadLodgeData() {
  try {
    const me = await fetch('/api/auth/me').then(r => r.json());
    if (me.user) {
      const lodgeData = await fetch('/api/lodge').then(r => r.json());
      if (lodgeData.lodge) {
        const lodge = lodgeData.lodge;
        const name = lodge.name || 'Your Lodge';
        const type = lodge.property_type || 'Safari Lodge';
        const suites = lodge.suites || '—';
        const country = lodge.country || '';
        const region = lodge.region || '';

        // Update sidebar property name wherever it appears
        document.querySelectorAll('.prop-name').forEach(el => el.textContent = name);
        document.querySelectorAll('.prop-type').forEach(el => {
          el.textContent = `${type} · ${suites} Suites · ${region ? region + ', ' : ''}${country}`;
        });

        // Update page title if it references the lodge
        const pageTitle = document.querySelector('.page-title');
        if (pageTitle && pageTitle.textContent.includes('Ridgeline')) {
          pageTitle.textContent = pageTitle.textContent.replace('Ridgeline Safari Lodge', name);
        }

        // Update weather based on country
        const weatherMap = {
          'Kenya': ['24°C', '☀️ Dry season · High demand'],
          'Tanzania': ['26°C', '☀️ Clear · Migration season'],
          'South Africa': ['18°C', '🌤️ Mild · Shoulder season'],
          'Botswana': ['29°C', '☀️ Dry · Peak wildlife'],
          'Zimbabwe': ['25°C', '☀️ Clear · High season'],
        };
        const w = weatherMap[country] || ['22°C', '🌤️ Favorable conditions'];
        document.querySelectorAll('.weather-temp').forEach(el => el.textContent = w[0]);
        document.querySelectorAll('.weather-loc').forEach(el => el.textContent = region || country);
        document.querySelectorAll('.weather-info').forEach(el => el.textContent = w[1]);

        // Update user avatar — use email username not lodge initials
        const emailUser = (me.user.email || '').split('@')[0] || name;
        const initials = emailUser.slice(0,2).toUpperCase();
        document.querySelectorAll('.avatar').forEach(el => el.textContent = initials);
        document.querySelectorAll('.user-name').forEach(el => el.textContent = emailUser);
      }
    }
  } catch (e) {
    // Guest mode — use localStorage
    try {
      const raw = localStorage.getItem('terrainConfig');
      if (raw) {
        const cfg = JSON.parse(raw);
        document.querySelectorAll('.prop-name').forEach(el => el.textContent = cfg.name || 'Your Lodge');
        document.querySelectorAll('.prop-type').forEach(el => {
          el.textContent = `${cfg.type || 'Safari Lodge'} · ${cfg.suites || '—'} Suites · ${cfg.country || ''}`;
        });
      }
    } catch {}
  }
}

// ---- Demand Heatmap ----
function buildDemandHeatmap() {
  const grid = document.getElementById('demandHeatmap');
  if (!grid) return;

  // Apr 16 is a Thursday (day index 4 in Sun=0 week)
  // Pad with empty cells for Sun–Wed
  const occupancies = [
    // Week 1: Thu Apr 17 – Sat Apr 19
    88, 91, 95,
    // Week 2: Sun Apr 20 – Sat Apr 26
    72, 74, 78, 82, 85, 94, 100,
    // Week 3: Sun Apr 27 – Sat May 3
    91, 82, 79, 75, 71, 55, 48,
    // Week 4: Sun May 4 – Sat May 10
    62, 68, 74, 79, 83, 88, 92,
    // Week 5: Sun May 11 – Fri May 16
    86, 84, 80, 77, 73, 70,
  ];

  const dates = [];
  const start = new Date(2026, 3, 17); // Apr 17
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(`${d.getMonth()+1}/${d.getDate()}`);
  }

  // Pad start (Apr 17 is Friday = index 5)
  const startPad = 5; // Friday
  for (let p = 0; p < startPad; p++) {
    const empty = document.createElement('div');
    empty.style.cssText = 'aspect-ratio:1;';
    grid.appendChild(empty);
  }

  occupancies.forEach((occ, i) => {
    const cell = document.createElement('div');
    cell.className = 'dhm-cell';
    cell.style.background = getOccColor(occ);
    cell.innerHTML = `<span class="dhm-date">${dates[i]}</span><span class="dhm-val">${occ}%</span>`;
    cell.title = `${dates[i]}: ${occ}% projected occupancy`;
    cell.addEventListener('click', () => showOccupancyTip(dates[i], occ));
    grid.appendChild(cell);
  });
}

function getOccColor(v) {
  if (v < 55) return `rgba(58,92,66,${0.15 + v/100*0.3})`;
  if (v < 70) return `rgba(184,146,42,${0.2 + v/100*0.4})`;
  if (v < 85) return `rgba(196,97,58,${0.3 + v/100*0.4})`;
  return `rgba(196,97,58,${0.55 + (v-85)/100})`;
}

function showOccupancyTip(date, occ) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const action = occ >= 90 ? 'Raise rates — demand is high' :
                 occ >= 75 ? 'Hold rates — healthy demand' :
                 occ >= 60 ? 'Consider a light promotion' :
                             'Reduce rate or bundle promotion';

  const color = occ >= 90 ? '#c4613a' : occ >= 75 ? '#3a5c42' : occ >= 60 ? '#b8922a' : '#7ab0d4';

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Occupancy Signal · ${date}</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:36px;color:${color};line-height:1;margin-bottom:4px;">${occ}%</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:14px;">Projected suite occupancy</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.8);padding:10px;background:rgba(255,255,255,0.06);border-radius:6px;margin-bottom:14px;">${action}</div>
    <button onclick="this.closest('.toast').remove()" style="background:#c4613a;border:none;border-radius:6px;padding:8px 18px;font-size:12px;font-weight:600;cursor:pointer;color:#fff;font-family:'Syne',sans-serif;">Adjust Pricing</button>
    <button onclick="this.closest('.toast').remove()" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:12px;cursor:pointer;margin-left:8px;font-family:'Syne',sans-serif;">Dismiss</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

// ---- Bundle Builder ----
function initBundleBuilder() {
  if (!document.getElementById('bb_total')) return;
  updateBundle();
}

function updateBundle() {
  const accom = parseInt(document.getElementById('s_accom')?.value || 520);
  const drive = parseInt(document.getElementById('s_drive')?.value || 150);
  const board = parseInt(document.getElementById('s_board')?.value || 120);
  const spa   = parseInt(document.getElementById('s_spa')?.value || 200);
  const trans = parseInt(document.getElementById('s_transfer')?.value || 0);

  document.getElementById('v_accom').textContent = '$' + accom;
  document.getElementById('v_drive').textContent = '$' + drive;
  document.getElementById('v_board').textContent = '$' + board;
  document.getElementById('v_spa').textContent   = '$' + spa;
  document.getElementById('v_transfer').textContent = '$' + trans;

  // 3-night bundle: accom×3, drive×3, board×3, spa once, transfer once
  const cost = (accom * 3) + (drive * 3) + (board * 3) + spa + trans;
  const perceivedValue = cost * 1.28; // guests over-value bundles ~28%
  const suggestedPrice = Math.round(perceivedValue / 100) * 100;
  const margin = Math.round((1 - (cost / suggestedPrice)) * 100);

  document.getElementById('bb_total').textContent = '$' + suggestedPrice.toLocaleString();
  document.getElementById('bb_margin').textContent = `Margin: est. ${margin}%`;

  const rec = document.getElementById('bb_rec');
  if (spa > 0 && rec) {
    rec.textContent = 'Spa credit increases perceived value and justifies a premium rate. Consider adding a private sundowner for high-season bookings.';
  } else if (trans > 0 && rec) {
    rec.textContent = 'Including transfers simplifies the guest journey and captures spend that would otherwise go to third parties. Strong conversion driver.';
  } else if (rec) {
    rec.textContent = 'Add spa credit or transfers to increase perceived value and command a meaningful rate premium without proportional cost increases.';
  }
}

// ---- Package Detail ----
function showPkgDetail(name, current, optimal) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const uplift = optimal - current;
  const pct = Math.round((uplift / current) * 100);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Package Pricing</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:20px;color:var(--cream);margin-bottom:12px;">${name}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:rgba(255,255,255,0.06);border-radius:6px;padding:10px;">
        <div style="font-size:9px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Current</div>
        <div style="font-family:'DM Mono',monospace;font-size:18px;color:var(--cream);">$${current.toLocaleString()}</div>
      </div>
      <div style="background:rgba(196,97,58,0.12);border:1px solid rgba(196,97,58,0.3);border-radius:6px;padding:10px;">
        <div style="font-size:9px;color:rgba(196,97,58,0.6);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Optimal</div>
        <div style="font-family:'DM Mono',monospace;font-size:18px;color:#e8896a;">$${optimal.toLocaleString()}</div>
      </div>
    </div>
    ${uplift !== 0 ? `<div style="font-size:12px;color:${uplift > 0 ? '#5a8c63' : '#e8896a'};margin-bottom:14px;">
      ${uplift > 0 ? '↑' : '↓'} ${uplift > 0 ? '+' : ''}$${Math.abs(uplift)} (${uplift > 0 ? '+' : ''}${pct}%) per booking
    </div>` : '<div style="font-size:12px;color:#5a8c63;margin-bottom:14px;">✓ At optimal pricing</div>'}
    <button onclick="this.closest('.toast').remove()" style="background:#c4613a;border:none;border-radius:6px;padding:8px 18px;font-size:12px;font-weight:600;cursor:pointer;color:#fff;font-family:'Syne',sans-serif;">Apply Optimal Rate</button>
    <button onclick="this.closest('.toast').remove()" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:12px;cursor:pointer;margin-left:8px;font-family:'Syne',sans-serif;">Close</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 7000);
}

// ---- Apply Recommendation ----
function applyRec(btn, label) {
  btn.textContent = '✓ Applied';
  btn.style.background = '#3a5c42';
  btn.disabled = true;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Recommendation Applied</div>
    <div style="font-size:13px;color:var(--cream);margin-bottom:12px;">${label}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);">Change will reflect across all booking channels within 60 seconds.</div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
}

// ---- Coming Soon Toast ----
function showComingSoon(feature, detail) {
  var existing = document.querySelector('.coming-soon-toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'coming-soon-toast';
  t.style.cssText = 'position:fixed;bottom:28px;right:28px;background:#1c1814;border:1px solid rgba(255,255,255,0.1);border-radius:9px;padding:20px 24px;z-index:1000;max-width:300px;font-family:Syne,sans-serif;box-shadow:0 10px 36px rgba(0,0,0,0.25);';
  t.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Coming Soon</div>'
    + '<div style="font-size:15px;color:#f5f0e8;font-weight:600;margin-bottom:6px;">' + feature + '</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:14px;line-height:1.6;">' + detail + '</div>'
    + '<div style="font-size:11px;color:#b8922a;margin-bottom:14px;">🗓 Expected: Q3 2026</div>'
    + '<button onclick="this.parentNode.remove()" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:7px 16px;font-size:11px;cursor:pointer;color:rgba(255,255,255,0.5);font-family:Syne,sans-serif;">Got it</button>';
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) t.remove(); }, 6000);
}

// Fix dead nav links across all pages
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('a.nav-item[href="#"]').forEach(function(link) {
    var text = link.textContent.trim();
    link.addEventListener('click', function(e) {
      e.preventDefault();
      if (text.includes('Competitor')) {
        showComingSoon('Competitor Radar', 'Live rate benchmarking against comparable lodges in your conservancy. Pulling data from OTA platforms and travel agent feeds.');
      } else if (text.includes('Guest')) {
        showComingSoon('Guest Segments', 'Nationality breakdown, repeat guest tracking, and spend-per-stay analysis. Requires PMS integration — coming in the next major update.');
      } else {
        showComingSoon(text, 'This feature is currently in development and will be available soon.');
      }
    });
  });
});


function animateEntrance() {
  const cards = document.querySelectorAll('.card, .kpi-card');
  cards.forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(16px)';
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    setTimeout(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 80 + i * 40);
  });
}
