/* ---------- App Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // 1) Personalization: ask once, then remember
  const nameKey = 'ps_name';
  let hisName = localStorage.getItem(nameKey);
  if (!hisName) {
    // You can change the default prompt text if you prefer.
    const answer = prompt("What should I call him? (e.g., 'Jude', 'Babe')");
    hisName = (answer && answer.trim()) ? answer.trim() : 'Love';
    localStorage.setItem(nameKey, hisName);
  }

  // 2) Houston time greeting + clock
  const TZ = 'America/Chicago'; // Houston
  const greetingEl = document.getElementById('greeting');
  const clockEl = document.getElementById('clock');

  function houstonNow() {
    // Create a Date that we *format* in Houston time via Intl
    return new Date();
  }

  function formatTime(d) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(d);
  }

  function getHour(d) {
    // Get the hour number in Houston using a trick: format to parts
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      hour12: false
    }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value;
    return Number(h);
  }

  function greetingForHour(h) {
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function tick() {
    const d = houstonNow();
    const hour = getHour(d);
    const greet = greetingForHour(hour);

    if (greetingEl) greetingEl.textContent = `${greet}, ${hisName}`;
    if (clockEl) clockEl.textContent = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }).format(d) + ' • ' + formatTime(d) + ' (Houston)';
  }

  tick();                      // initial
  setInterval(tick, 60_000);   // update every minute

  // 3) Register service worker for offline + installability
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error('SW registration failed:', err));
  }
});

/* ---------- Flipbook (Home) ---------- */
(function setupFlipbook(){
  if (!document.getElementById('flip-card')) return; // only on index.html

  const TZ = 'America/Chicago';
  const frontEl = document.getElementById('note-front');
  const backEl  = document.getElementById('note-back');
  const card    = document.getElementById('flip-card');
  const btnFlip = document.getElementById('flip-btn');
  const btnPrev = document.getElementById('prev-btn');
  const btnNext = document.getElementById('next-btn');

  let notes = [];
  let idx = 0;

  fetch('./data/notes.json')
    .then(r => r.json())
    .then(list => {
      notes = Array.isArray(list) ? list : [];
      idx = pickTodayIndex(notes.length);
      render();
    })
    .catch(()=> { notes = ["(Couldn’t load notes yet—try online once)"]; render(); });

  function pickTodayIndex(n) {
    if (!n) return 0;
    const d = new Date();
    // Format to YYYY-MM-DD in Houston time
    const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
    // Simple hash
    let h = 0;
    for (let i=0;i<dayStr.length;i++) h = (h*31 + dayStr.charCodeAt(i)) >>> 0;
    return h % n;
  }

  function render() {
    const cur = notes[idx] || '';
    const next = notes[(idx+1) % notes.length] || '';
    frontEl.textContent = cur;
    backEl.textContent = next;
  }

  btnFlip?.addEventListener('click', () => card.classList.toggle('is-flipped'));
  btnPrev?.addEventListener('click', () => { idx = (idx - 1 + notes.length) % notes.length; card.classList.remove('is-flipped'); render(); });
  btnNext?.addEventListener('click', () => { idx = (idx + 1) % notes.length; card.classList.remove('is-flipped'); render(); });
})();

/* ---------- Envelopes Page ---------- */
(function setupEnvelopes(){
  const grid = document.getElementById('envelopes-grid');
  if (!grid) return;

  const modal = document.getElementById('env-modal');
  const closeBtn = document.getElementById('env-close');
  const titleEl = document.getElementById('env-title');
  const msgEl   = document.getElementById('env-message');

  fetch('./data/envelopes.json')
    .then(r => r.json())
    .then(list => renderGrid(Array.isArray(list) ? list : []))
    .catch(() => renderGrid([]));

  function renderGrid(items) {
    if (!items.length) {
      grid.innerHTML = `<p style="opacity:.7">No envelopes yet.</p>`;
      return;
    }
    grid.innerHTML = items.map(it => {
      const label = escapeHTML(it.label || it.id || 'Open when…');
      return `
        <button class="env-card" data-id="${it.id}">
          <span class="env-emoji">✉️</span>
          <div>${label}</div>
        </button>
      `;
    }).join('');
    grid.querySelectorAll('.env-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = items.find(x => x.id === id);
        titleEl.textContent = `Open ${item?.label || 'when…'}`;
        msgEl.textContent = item?.message || '';
        modal.showModal();
      });
    });
  }

  closeBtn?.addEventListener('click', () => modal.close());
  modal?.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  function escapeHTML(s=''){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();

/* ---------- Plant Page ---------- */
(function setupPlant(){
  const pot = document.getElementById('plant-pot');
  if (!pot) return;

  const TZ = 'America/Chicago';
  const emojiEl = document.getElementById('plant-emoji');
  const streakEl = document.getElementById('streak-num');
  const barFill = document.getElementById('bar-fill');
  const stageLabel = document.getElementById('stage-label');

  const eggModal = document.getElementById('egg-modal');
  const eggClose = document.getElementById('egg-close');

  let cfg = { stages: [], milestones: [] };

  Promise.all([
    fetch('./data/plant.json').then(r=>r.json()).catch(()=>({stages:[],milestones:[]})),
  ]).then(([plantCfg]) => {
    cfg = plantCfg || { stages:[], milestones:[] };
    const streak = updateStreak();
    render(streak);
    setupLongPress();
  });

  function dateStrHouston(d=new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  }

  function updateStreak() {
    const kLast = 'ps_last_visit_chi';
    const kStreak = 'ps_streak';
    const today = dateStrHouston();

    const last = localStorage.getItem(kLast);
    let streak = Number(localStorage.getItem(kStreak) || '0');

    if (!last) {
      streak = 1;
    } else if (last === today) {
      // already counted today
    } else {
      const diffDays = daysBetweenHouston(last, today);
      if (diffDays === 1) streak += 1;
      else streak = 1; // reset if missed a day
    }

    localStorage.setItem(kLast, today);
    localStorage.setItem(kStreak, String(streak));
    return streak;
  }

  function daysBetweenHouston(d1, d2) {
    // d1, d2 are 'YYYY-MM-DD' strings; compute whole-day difference
    const a = new Date(d1+'T00:00:00');
    const b = new Date(d2+'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function stageForStreak(streak) {
    // pick last stage where streak >= day
    const stages = cfg.stages || [];
    let chosen = stages[0] || { label:'Seed', day:0 };
    for (const s of stages) if (streak >= (s.day || 0)) chosen = s;
    return chosen;
  }

  function emojiForStage(label) {
    switch ((label||'').toLowerCase()) {
      case 'seed': return '🌰';
      case 'sprout': return '🌱';
      case 'leafy': return '🌿';
      case 'bud': return '🌷';
      case 'bloom': return '🌻';
      default: return '🌱';
    }
  }

  function render(streak) {
    const stage = stageForStreak(streak);
    emojiEl.textContent = emojiForStage(stage.label);
    streakEl.textContent = String(streak);
    stageLabel.textContent = `Stage: ${stage.label || '—'}`;

    // simple progress bar toward next stage
    const stages = cfg.stages || [];
    const next = stages.find(s => s.day > (stage.day||0));
    const base = stage.day || 0;
    const target = next ? next.day : base + 1;
    const progress = Math.max(0, Math.min(1, (streak - base) / (target - base)));
    barFill.style.width = (progress*100).toFixed(0) + '%';

    // milestone toast (console for simplicity; you can later add a cute popover)
    const milestone = (cfg.milestones||[]).slice().reverse().find(m => streak === m.streak);
    if (milestone) {
      console.log('Milestone:', milestone.message);
    }
  }

  // Easter egg: long-press the pot (2 seconds)
  function setupLongPress() {
    let timer = null;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => eggModal.showModal(), 2000);
    };
    const cancel = () => clearTimeout(timer);

    pot.addEventListener('mousedown', start);
    pot.addEventListener('touchstart', start);
    ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev => pot.addEventListener(ev, cancel));
  }

  eggClose?.addEventListener('click', () => eggModal.close());
  eggModal?.addEventListener('click', (e) => { if (e.target === eggModal) eggModal.close(); });
})();







































