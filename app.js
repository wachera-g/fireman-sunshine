/* ---------- App Boot ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // Personalization: ask once, then remember
    const nameKey = 'ps_name';
  let hisName = localStorage.getItem(nameKey);

// Always use a fixed name
  hisName = "My Darling Ramen";
  localStorage.setItem(nameKey, hisName);


  // Houston time greeting + clock
  const TZ = 'America/Chicago';
  const greetingEl = document.getElementById('greeting');
  const clockEl = document.getElementById('clock');

  function formatTime(d) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: true
    }).format(d);
  }
  function getHour(d) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value;
    return Number(h);
  }
  function greetingForHour(h) {
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 18) return 'Good afternoon';
    return 'Good evening';
  }
  function tick() {
    const d = new Date();
    const greet = greetingForHour(getHour(d));
    if (greetingEl) greetingEl.textContent = `${greet}, ${hisName}`;
    if (clockEl) clockEl.textContent =
      new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d)
      + ' • ' + formatTime(d) + ' (Houston)';
  }
  tick();
  setInterval(tick, 60_000);

  // Footer year
  (() => {
    const el = document.getElementById('yr');
    if (el) el.textContent = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(new Date());
  })();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.error('SW registration failed:', err));
  }
});

// ----- Daily limits (tweak anytime) -----
const DAILY_LIMIT_NOTES = 2;      // Flipbook: notes per day
const DAILY_LIMIT_ENVELOPES = 1;  // Envelopes: new unlocks per day
const DAILY_LIMIT_PLANT = 1;      // Plant page: notes per day

/* ---------- Flipbook (Home) with per-day limit ---------- */
(function setupFlipbook(){
  if (!document.getElementById('flip-card')) return; // only on index.html

  const TZ = 'America/Chicago';
  const frontEl = document.getElementById('note-front');
  const backEl  = document.getElementById('note-back');
  const card    = document.getElementById('flip-card');
  const btnFlip = document.getElementById('flip-btn');
  const btnPrev = document.getElementById('prev-btn');
  const btnNext = document.getElementById('next-btn');
  const btnToday = document.getElementById('day-today');
  const btnYesterday = document.getElementById('day-yesterday');

  let notes = [];
  let pool = [];
  let idx = 0;
  let dayOffset = 0; // 0=today, -1=yesterday

  fetch('./data/notes.json')
    .then(r => r.json())
    .then(list => { notes = Array.isArray(list) ? list : []; selectDay(0); render(); })
    .catch(()=> { notes = ["(Couldn’t load notes yet—try online once)"]; pool=[0]; render(); });

  function dayKey(offset=0) {
    const d = new Date(); d.setDate(d.getDate()+offset);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  }
  function pickPool(n, limit, offset=0) {
    if (!n) return [];
    const key = dayKey(offset);
    let h = 0; for (let i=0;i<key.length;i++) h = (h*31 + key.charCodeAt(i)) >>> 0;
    const start = h % n;
    const out = [];
    for (let i=0; i<Math.min(limit, n); i++) out.push((start + i) % n);
    return out;
  }
  function selectDay(offset) {
    dayOffset = offset;
    pool = pickPool(notes.length, DAILY_LIMIT_NOTES, offset);
    idx = 0;
    card.classList.remove('is-flipped');
    updateDayButtons();
    render();
  }
  function updateDayButtons() {
    if (btnToday && btnYesterday) {
      if (dayOffset === 0) { btnToday.classList.remove('secondary'); btnYesterday.classList.add('secondary'); }
      else { btnToday.classList.add('secondary'); btnYesterday.classList.remove('secondary'); }
    }
  }
  function render() {
    if (!pool.length) { frontEl.textContent = '(No notes yet)'; backEl.textContent = ''; return; }
    const cur = notes[ pool[idx] ] || '';
    const next = notes[ pool[(idx+1) % pool.length] ] || '';
    frontEl.textContent = cur;
    backEl.textContent = next;
  }

  btnFlip?.addEventListener('click', () => card.classList.toggle('is-flipped'));
  btnPrev?.addEventListener('click', () => { idx = (idx - 1 + pool.length) % pool.length; card.classList.remove('is-flipped'); render(); });
  btnNext?.addEventListener('click', () => { idx = (idx + 1) % pool.length; card.classList.remove('is-flipped'); render(); });
  btnToday?.addEventListener('click', () => selectDay(0));
  btnYesterday?.addEventListener('click', () => selectDay(-1));
})();

/* ---------- Envelopes Page (daily unlocks) ---------- */
(function setupEnvelopes(){
  const grid = document.getElementById('envelopes-grid');
  if (!grid) return;

  const TZ = 'America/Chicago';
  const modal = document.getElementById('env-modal');
  const closeBtn = document.getElementById('env-close');
  const titleEl = document.getElementById('env-title');
  const msgEl   = document.getElementById('env-message');

  const UNLOCK_KEY = 'ps_env_unlocked_ids';
  const LAST_DAY_KEY = 'ps_env_last_day';

  let items = [];

  fetch('./data/envelopes.json')
    .then(r => r.json())
    .then(list => { items = Array.isArray(list) ? list : []; dailyUnlock(); renderGrid(items); })
    .catch(() => renderGrid([]));

  function dayStr(offset=0){
    const d=new Date(); d.setDate(d.getDate()+offset);
    return new Intl.DateTimeFormat('en-CA',{ timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  }
  function loadUnlocked(){ try { return JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]'); } catch { return []; } }
  function saveUnlocked(arr){ localStorage.setItem(UNLOCK_KEY, JSON.stringify(arr)); }

  function dailyUnlock(){
    const today = dayStr(0);
    const last = localStorage.getItem(LAST_DAY_KEY);
    if (last === today) return;

    let unlocked = loadUnlocked();
    const remaining = items.filter(it => !unlocked.includes(it.id));
    const toUnlock = remaining.slice(0, DAILY_LIMIT_ENVELOPES).map(it => it.id);
    if (toUnlock.length) unlocked = unlocked.concat(toUnlock);

    saveUnlocked(unlocked);
    localStorage.setItem(LAST_DAY_KEY, today);
  }

  function renderGrid(list) {
    const unlocked = new Set(loadUnlocked());
    if (!list.length) { grid.innerHTML = `<p style="opacity:.7">No envelopes yet.</p>`; return; }

    grid.innerHTML = list.map(it => {
      const isLocked = !unlocked.has(it.id);
      const label = escapeHTML(it.label || it.id || 'Open when…');
      return `
        <button class="env-card ${isLocked ? 'locked':''}" data-id="${it.id}" ${isLocked?'disabled':''}>
          <span class="env-emoji">${isLocked ? '🔒' : '✉️'}</span>
          <div>${label}</div>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('.env-card:not(.locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = list.find(x => x.id === id);
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

/* ---------- Plant Page (streak + daily notes limit) ---------- */
(function setupPlant(){
  const pot = document.getElementById('plant-pot');
  if (!pot) return;

  const TZ = 'America/Chicago';
  const emojiEl = document.getElementById('plant-emoji');
  const streakEl = document.getElementById('streak-num');
  const barFill = document.getElementById('bar-fill');
  const stageLabel = document.getElementById('stage-label');

  const noteBox = document.getElementById('plant-note');
  const btnToday = document.getElementById('pday-today');
  const btnYesterday = document.getElementById('pday-yesterday');

  const eggModal = document.getElementById('egg-modal');
  const eggClose = document.getElementById('egg-close');

  let cfg = { stages: [], milestones: [], dailyNotes: [] };
  let dayOffset = 0; // 0=today, -1=yesterday

  Promise.all([
    fetch('./data/plant.json').then(r=>r.json()).catch(()=>({stages:[],milestones:[],dailyNotes:[]})),
  ]).then(([plantCfg]) => {
    cfg = plantCfg || { stages:[], milestones:[], dailyNotes:[] };
    const streak = updateStreak();
    render(streak);
    renderDailyNote();
    setupLongPress();
    btnToday?.addEventListener('click', ()=>{ dayOffset=0; updateDayButtons(); renderDailyNote(); });
    btnYesterday?.addEventListener('click', ()=>{ dayOffset=-1; updateDayButtons(); renderDailyNote(); });
    updateDayButtons();
  });

  function updateDayButtons(){
    if (!btnToday || !btnYesterday) return;
    if (dayOffset===0){ btnToday.classList.remove('secondary'); btnYesterday.classList.add('secondary'); }
    else { btnToday.classList.add('secondary'); btnYesterday.classList.remove('secondary'); }
  }

  function dayStr(offset=0) {
    const d=new Date(); d.setDate(d.getDate()+offset);
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
  }
  function pickFromArray(arr, limit, offset=0){
    const key = dayStr(offset);
    let h=0; for (let i=0;i<key.length;i++) h=(h*31+key.charCodeAt(i))>>>0;
    const start = arr.length ? h % arr.length : 0;
    const out=[]; for (let i=0;i<Math.min(limit, arr.length); i++) out.push(arr[(start+i)%arr.length]);
    return out;
  }
  function renderDailyNote(){
    const pool = pickFromArray(cfg.dailyNotes||[], DAILY_LIMIT_PLANT, dayOffset);
    noteBox.textContent = pool[0] || '—';
  }

  // ----- streak logic -----
  function updateStreak() {
    const kLast = 'ps_last_visit_chi';
    const kStreak = 'ps_streak';
    const today = dayStr(0);

    const last = localStorage.getItem(kLast);
    let streak = Number(localStorage.getItem(kStreak) || '0');

    if (!last) {
      streak = 1;
    } else if (last === today) {
      // already counted today
    } else {
      const diffDays = daysBetween(last, today);
      if (diffDays === 1) streak += 1;
      else streak = 1;
    }

    localStorage.setItem(kLast, today);
    localStorage.setItem(kStreak, String(streak));
    return streak;
  }
  function daysBetween(d1, d2) {
    const a = new Date(d1+'T00:00:00'); const b = new Date(d2+'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function stageForStreak(streak) {
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
      case 'thrive': return '🌳';
      default: return '🌱';
    }
  }
  function render(streak) {
    const stage = stageForStreak(streak);
    emojiEl.textContent = emojiForStage(stage.label);
    streakEl.textContent = String(streak);
    stageLabel.textContent = `Stage: ${stage.label || '—'}`;

    const stages = cfg.stages || [];
    const next = stages.find(s => s.day > (stage.day||0));
    const base = stage.day || 0;
    const target = next ? next.day : base + 1;
    const progress = Math.max(0, Math.min(1, (streak - base) / (target - base)));
    barFill.style.width = (progress*100).toFixed(0) + '%';

    const milestone = (cfg.milestones||[]).slice().reverse().find(m => streak === m.streak);
    if (milestone) console.log('Milestone:', milestone.message);
  }

  // Easter egg: long-press
  function setupLongPress() {
    let timer = null;
    const start = () => { clearTimeout(timer); timer = setTimeout(() => eggModal.showModal(), 2000); };
    const cancel = () => clearTimeout(timer);
    pot.addEventListener('mousedown', start);
    pot.addEventListener('touchstart', start);
    ['mouseup','mouseleave','touchend','touchcancel'].forEach(ev => pot.addEventListener(ev, cancel));
  }
  eggClose?.addEventListener('click', () => eggModal.close());
  eggModal?.addEventListener('click', (e) => { if (e.target === eggModal) eggModal.close(); });
})();
