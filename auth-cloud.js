/* ========================================================================
   auth-cloud.js (add-on, non-destructive)
   - Do NOT edit your existing app.js.
   - Include this file AFTER app.js in index.html.
   - It wires Supabase auth (Discord/Google/Magic Link) and per-user cloud save/load.
=========================================================================== */

(() => {
  // Stable redirect for GitHub Pages
  if (!window.REDIRECT_URL) window.REDIRECT_URL = 'https://granatos.github.io/planer-web/';

  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log('[auth+cloud]', ...a);
  const warn = (...a) => console.warn('[auth+cloud]', ...a);
  const err = (...a) => console.error('[auth+cloud]', ...a);

  // Initialize Supabase client if keys + library exist
  (function initSupabase(){
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (typeof window.supabase === 'object' && url && key) {
      try { window.sb = window.supabase.createClient(url, key); log('supabase client ready'); }
      catch(e){ err('supabase init failed', e); window.sb = null; }
    } else {
      if (typeof window.sb === 'undefined') window.sb = null;
      warn('supabase not ready', { hasLib: typeof window.supabase, hasUrl: !!url, hasKey: !!key });
    }
  })();

  // UI references (optional)
  const emailEl   = $('auth-email');
  const statusEl  = $('auth-status');
  const btnMagic  = $('btn-magic');
  const btnGoogle = $('btn-google');
  const btnDiscord= $('btn-discord');
  const btnLogout = $('btn-logout');
  const btnSaveCloud = $('btn-save-cloud');

  function setStatus(user){
    const meta = user?.user_metadata || {};
    const label = user?.email || meta.full_name || meta.name || meta.user_name || 'Konto';
    if (statusEl) statusEl.textContent = user ? label : 'Nie zalogowano';
    if (btnLogout)  btnLogout.hidden  = !user;
    if (btnMagic)   btnMagic.hidden   = !!user;
    if (btnGoogle)  btnGoogle.hidden  = !!user;
    if (btnDiscord) btnDiscord.hidden = !!user;
    if (emailEl)    emailEl.hidden    = !!user;
  }

  // Cloud save/load
  let cloudSaveTimer = null;

  async function savePlannerData() {
    if (!window.sb || !window.currentUser) return;
    try {
      const payload = (typeof window.state !== 'undefined') ? window.state : {};
      const { error } = await window.sb.from('plans').insert({ user_id: window.currentUser.id, payload });
      if (error) err('[cloud save] error', error); else log('[cloud save] OK');
    } catch (e) { err('[cloud save] exception', e); }
  }

  function scheduleSaveCloud() {
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(savePlannerData, 2500);
  }

  async function loadPlannerData() {
    if (!window.sb || !window.currentUser) return;
    try {
      const { data, error } = await window.sb
        .from('plans')
        .select('payload')
        .eq('user_id', window.currentUser.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') { err('[cloud load] error', error); return; }
      if (data?.payload) {
        window.state = data.payload;
        if (typeof window.renderAll === 'function') window.renderAll();
        if (typeof window.STORAGE_KEY === 'string') {
          try { localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.state)); } catch {}
        }
        log('[cloud load] applied');
      } else {
        log('[cloud load] no snapshot (ok)');
      }
    } catch (e) { err('[cloud load] exception', e); }
  }

  // Non-destructive patch: wrap existing save() if present; otherwise create a stub
  (function patchSave(){
    const orig = window.save;
    window.save = function(){
      try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ err('orig save error', e); }
      try { scheduleSaveCloud(); } catch(e){ err('scheduleSaveCloud error', e); }
    };
    log('save() patched for cloud (non-destructive)');
  })();

  // Optional: profile upsert
  async function upsertProfile(user){
    try {
      if (!window.sb || !user) return;
      const nick = user.user_metadata?.user_name || (user.email||'').split('@')[0] || 'User';
      await window.sb.from('profiles').upsert({ id: user.id, display_name: nick });
    } catch(e){ warn('upsertProfile', e); }
  }

  // Wire buttons (idempotent)
  function wire(){
    if (btnMagic && !btnMagic.dataset.wired){
      btnMagic.dataset.wired = '1';
      btnMagic.addEventListener('click', async () => {
        const sb = window.sb;
        if (!sb) return alert('Brak konfiguracji logowania');
        const email = (emailEl?.value || '').trim();
        if (!email) return alert('Podaj e-mail');
        try{
          const { error } = await sb.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.REDIRECT_URL, shouldCreateUser: true }
          });
          if (error) { console.error(error); return alert(error.message); }
          alert('Wysłano link logowania (sprawdź skrzynkę/spam).');
        }catch(e){ console.error(e); alert('Błąd logowania (szczegóły w konsoli).'); }
      });
    }

    if (btnGoogle && !btnGoogle.dataset.wired){
      btnGoogle.dataset.wired = '1';
      btnGoogle.addEventListener('click', async () => {
        const sb = window.sb;
        if (!sb) return alert('Brak konfiguracji logowania');
        const { error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.REDIRECT_URL }});
        if (error) alert(error.message);
      });
    }

    if (btnDiscord && !btnDiscord.dataset.wired){
      btnDiscord.dataset.wired = '1';
      btnDiscord.addEventListener('click', async () => {
        const sb = window.sb;
        if (!sb) return alert('Brak konfiguracji logowania');
        const { error } = await sb.auth.signInWithOAuth({
          provider:'discord',
          options:{ redirectTo: window.REDIRECT_URL, scopes:'identify email' }
        });
        if (error) alert(error.message);
      });
    }

    if (btnLogout && !btnLogout.dataset.wired){
      btnLogout.dataset.wired = '1';
      btnLogout.addEventListener('click', async () => {
        try{ await window.sb?.auth?.signOut(); setStatus(null); }catch(e){ console.error(e); }
      });
    }

    if (btnSaveCloud && !btnSaveCloud.dataset.wired){
      btnSaveCloud.dataset.wired = '1';
      btnSaveCloud.addEventListener('click', async () => {
        if (!window.currentUser) return alert('Zaloguj się');
        await savePlannerData();
        alert('Zapisano w chmurze');
      });
    }

    if (window.sb){
      window.sb.auth.onAuthStateChange(async (_e, session) => {
        const user = session?.user || null;
        window.currentUser = user;
        setStatus(user);
        if (user) { await upsertProfile(user); await loadPlannerData(); }
      });
      window.sb.auth.getSession().then(async ({data}) => {
        const user = data?.session?.user || null;
        window.currentUser = user;
        setStatus(user);
        if (user) { await upsertProfile(user); await loadPlannerData(); }
      });
    } else {
      setStatus(null);
    }

    log('wired', { magic: !!btnMagic, google: !!btnGoogle, discord: !!btnDiscord, logout: !!btnLogout });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
