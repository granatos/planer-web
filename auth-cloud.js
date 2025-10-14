/* ======================================================================
   auth-cloud.js  —  add-on (nie nadpisuje Twojego app.js)
   Funkcje:
   - Inicjalizacja Supabase jako window.sb (wymaga kluczy w <head>)
   - Logowanie: Magic link / Discord / Google
   - Status UI
   - Synchronizacja stanu per użytkownik (UPSERT po user_id)
   - Auto-zapis z debounce + przyciski "Załaduj z chmury" / "Zapisz w chmurze"
   - Patchuje lokalne save() nieinwazyjnie
   Jak użyć:
   1) W <head> index.html:
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        window.SUPABASE_URL = "https://TWÓJ-REF.supabase.co";
        window.SUPABASE_ANON_KEY = "ANON_KEY_Z_SUPABASE";
      </script>
   2) Wstaw ZA app.js:
      <script src="app.js"></script>
      <script src="auth-cloud.js?v=upsert1"></script>
   3) W Supabase → Auth → URL Configuration:
      Site URL:     https://granatos.github.io/planer-web/
      Redirect URLs: https://granatos.github.io/planer-web/
   4) Discord (opcjonalnie) → Redirect: https://TWÓJ-PROJEKT.supabase.co/auth/v1/callback
====================================================================== */

(() => {
  if (window.__AUTH_CLOUD_WIRED__) return; window.__AUTH_CLOUD_WIRED__ = true;

  // Stały redirect
  if (!window.REDIRECT_URL) window.REDIRECT_URL = 'https://granatos.github.io/planer-web/';

  // --- Helpers
  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log('[auth-cloud]', ...a);
  const warn = (...a) => console.warn('[auth-cloud]', ...a);
  const err = (...a) => console.error('[auth-cloud]', ...a);

  // --- Supabase init (global: window.sb)
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

  // --- UI refs (opcjonalne)
  const emailEl   = $('auth-email');
  const statusEl  = $('auth-status');
  const btnMagic  = $('btn-magic');
  const btnGoogle = $('btn-google');
  const btnDiscord= $('btn-discord');
  const btnLogout = $('btn-logout');
  const btnLoad   = $('btn-load-cloud');
  const btnSave   = $('btn-save-cloud');

  // --- Status UI
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

  // --- Cloud storage (1 wiersz per user_id; UPSERT)
  let cloudSaveTimer = null;

  async function savePlannerData() {
    if (!window.sb || !window.currentUser) return;
    try {
      const payload = (typeof window.state !== 'undefined') ? window.state : {};
      const { error } = await window.sb
        .from('plans')
        .upsert(
          { user_id: window.currentUser.id, payload, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
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
        .select('payload, updated_at')
        .eq('user_id', window.currentUser.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') { err('[cloud load] error', error); return; }
      if (data?.payload) {
        window.state = data.payload;
        if (typeof window.renderAll === 'function') window.renderAll();
        if (typeof window.STORAGE_KEY === 'string') {
          try { localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.state)); } catch {}
        }
        log('[cloud load] applied @', data.updated_at);
      } else {
        log('[cloud load] no row yet (first login)');
      }
    } catch (e) { err('[cloud load] exception', e); }
  }

  // --- Patch local save() (non-destructive)
  (function patchSave(){
    const orig = window.save;
    window.save = function(){
      try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ err('orig save error', e); }
      try { scheduleSaveCloud(); } catch(e){ err('scheduleSaveCloud error', e); }
    };
    log('save() patched → cloud debounce');
  })();

  // --- Optional profile
  async function upsertProfile(user){
    try {
      if (!window.sb || !user) return;
      const nick = user.user_metadata?.user_name || (user.email||'').split('@')[0] || 'User';
      await window.sb.from('profiles').upsert({ id: user.id, display_name: nick });
    } catch(e){ warn('upsertProfile', e); }
  }

  // --- Wire buttons (idempotent)
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

    if (btnLoad && !btnLoad.dataset.wired){
      btnLoad.dataset.wired = '1';
      btnLoad.addEventListener('click', async () => {
        if (!window.currentUser) return alert('Zaloguj się');
        await loadPlannerData();
        alert('Wczytano z chmury');
      });
    }

    if (btnSave && !btnSave.dataset.wired){
      btnSave.dataset.wired = '1';
      btnSave.addEventListener('click', async () => {
        if (!window.currentUser) return alert('Zaloguj się');
        await savePlannerData();
        alert('Zapisano w chmurze');
      });
    }

    // Sesja → status + wczytanie stanu
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

    log('wired', { magic: !!btnMagic, google: !!btnGoogle, discord: !!btnDiscord, logout: !!btnLogout, load: !!btnLoad, save: !!btnSave });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
