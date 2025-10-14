/* ======================================================================
   auth-cloud.js  —  add-on (NIE nadpisuje Twojego app.js)
   Wersja: sync3 (persistSession + retry na iOS/Safari)
   Funkcje:
   • Inicjalizacja Supabase (window.sb) – wymagane klucze w <head>
   • Logowanie: Magic link / Discord / Google
   • Status w UI
   • Synchronizacja multi-device:
       - 1 wiersz per user_id w `plans` (UPSERT onConflict:user_id)
       - Cloud-wins po zalogowaniu (z porównaniem dat)
       - Debounce zapisu ~1.2s i blokada zapisu przed pierwszym loadem
       - Retry wczytania, gdy sesja „dogania” (Safari/iOS)
   • Patchuje save(): timestamp + auto-zapis do chmury
====================================================================== */

(() => {
  if (window.__AUTH_CLOUD_WIRED__) return; window.__AUTH_CLOUD_WIRED__ = true;

  // --- Stały redirect (GitHub Pages) ---
  if (!window.REDIRECT_URL) window.REDIRECT_URL = 'https://granatos.github.io/planer-web/';

  // --- Narzędzia ---
  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log('[auth-cloud]', ...a);
  const warn = (...a) => console.warn('[auth-cloud]', ...a);
  const err = (...a) => console.error('[auth-cloud]', ...a);
  const nowIso = () => new Date().toISOString();

  function getLocal(){
    try {
      if (typeof window.STORAGE_KEY === 'string') {
        const raw = localStorage.getItem(window.STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } catch {}
    return null;
  }
  function setLocal(st){
    try {
      if (typeof window.STORAGE_KEY === 'string') {
        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(st));
      }
    } catch {}
  }

  // --- Supabase init (global: window.sb) z persistSession ---
  (function initSupabase(){
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (typeof window.supabase === 'object' && url && key) {
      try {
        window.sb = window.supabase.createClient(url, key, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        log('supabase client ready');
      } catch(e){
        err('supabase init failed', e); window.sb = null;
      }
    } else {
      if (typeof window.sb === 'undefined') window.sb = null;
      warn('supabase not ready', { hasLib: typeof window.supabase, hasUrl: !!url, hasKey: !!key });
    }
  })();

  // --- UI refs ---
  const emailEl   = $('auth-email');
  const statusEl  = $('auth-status');
  const btnMagic  = $('btn-magic');
  const btnGoogle = $('btn-google');
  const btnDiscord= $('btn-discord');
  const btnLogout = $('btn-logout');
  const btnLoad   = $('btn-load-cloud');
  const btnSave   = $('btn-save-cloud');

  // --- Status UI ---
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

  // ==== SYNC FLAGS ====
  let cloudReady = false;   // pierwsze wczytanie z chmury zakończone
  let syncingNow = false;   // aktualnie trwa wczytywanie (blokuj zapisy)

  // --- Zapis do chmury (UPSERT 1 wiersz per user_id) ---
  async function savePlannerData() {
    if (!window.sb || !window.currentUser) return;
    if (!cloudReady || syncingNow) return; // nie zapisuj zanim nie wczytasz chmury
    try {
      const payload = (typeof window.state !== 'undefined') ? window.state : {};
      const { error } = await window.sb
        .from('plans')
        .upsert(
          { user_id: window.currentUser.id, payload, updated_at: nowIso() },
          { onConflict: 'user_id' }
        );
      if (error) err('[cloud save] error', error); else log('[cloud save] OK');
    } catch (e) { err('[cloud save] exception', e); }
  }

  let cloudSaveTimer = null;
  function scheduleSaveCloud() {
    if (!cloudReady) return;                 // blokada do czasu pierwszego loadu
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(savePlannerData, 1200);
  }

  // --- Wczytanie z chmury (cloud-wins z porównaniem dat) + RETRY ---
  async function loadPlannerData() {
    if (!window.sb || !window.currentUser) return;
    try {
      syncingNow = true;
      const { data, error } = await window.sb
        .from('plans')
        .select('payload, updated_at')
        .eq('user_id', window.currentUser.id)
        .maybeSingle();

      const local = getLocal();
      const cloud = data?.payload || null;
      const cloudAt = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
      const localAt = local?.__updated_at ? new Date(local.__updated_at).getTime() : 0;

      let chosen = null;
      if (cloud && (!local || cloudAt >= localAt)) {
        chosen = cloud;
        log('[cloud load] using CLOUD', data?.updated_at);
      } else if (local) {
        chosen = local;
        log('[cloud load] using LOCAL', local.__updated_at || '(no ts)');
        // wypchnij lokalny do chmury jako najnowszy
        cloudReady = true;  // pozwól na zapis
        await savePlannerData();
      }

      if (chosen){
        if (!chosen.__updated_at) chosen.__updated_at = nowIso(); // znacznik dla porównań
        window.state = chosen;
        if (typeof window.renderAll === 'function') window.renderAll();
        setLocal(window.state);
      }

      cloudReady = true;
    } catch (e) {
      err('[cloud load] exception', e);
    } finally {
      syncingNow = false;
    }
  }

  // --- Patch lokalnego save() (timestamp + debounce do chmury) ---
  (function patchSave(){
    const orig = window.save;
    window.save = function(){
      try { if (typeof orig === 'function') orig.apply(this, arguments); }
      catch(e){ err('orig save error', e); }
      try {
        if (typeof window.state === 'object' && window.state) {
          window.state.__updated_at = nowIso();
          setLocal(window.state);
        }
      } catch {}
      scheduleSaveCloud();
    };
    log('[sync] save() patched with timestamp + cloud debounce');
  })();

  // --- (Opcjonalnie) Upsert profilu (display_name) ---
  async function upsertProfile(user){
    try {
      if (!window.sb || !user) return;
      const nick = user.user_metadata?.user_name || (user.email||'').split('@')[0] || 'User';
      await window.sb.from('profiles').upsert({ id: user.id, display_name: nick });
    } catch(e){ warn('upsertProfile', e); }
  }

  // --- Przyciski (idempotent) ---
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
        cloudReady = false;
        await loadPlannerData();
        // szybki retry: czasem sesja dojdzie chwilę później (iOS/Safari)
        if (!window.state || Object.keys(window.state||{}).length === 0) {
          await new Promise(r => setTimeout(r, 800));
          await loadPlannerData();
        }
        cloudReady = true;
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

    // Sesja → najpierw WYCZYTAJ z chmury, dopiero potem pozwól zapisywać
    if (window.sb){
      window.sb.auth.onAuthStateChange(async (_e, session) => {
        const user = session?.user || null;
        window.currentUser = user;
        setStatus(user);
        cloudReady = false;
        if (user) {
          await upsertProfile(user);
          await loadPlannerData();   // najpierw cloud
          if (!window.state || Object.keys(window.state||{}).length === 0) {
            await new Promise(r => setTimeout(r, 800)); // RETRY
            await loadPlannerData();
          }
          cloudReady = true;         // teraz można zapisywać
        }
      });
      window.sb.auth.getSession().then(async ({data}) => {
        const user = data?.session?.user || null;
        window.currentUser = user;
        setStatus(user);
        cloudReady = false;
        if (user) {
          await upsertProfile(user);
          await loadPlannerData();
          if (!window.state || Object.keys(window.state||{}).length === 0) {
            await new Promise(r => setTimeout(r, 800)); // RETRY
            await loadPlannerData();
          }
          cloudReady = true;
        }
      });
    } else {
      setStatus(null);
    }

    log('wired', {
      magic: !!btnMagic, google: !!btnGoogle, discord: !!btnDiscord, logout: !!btnLogout, load: !!btnLoad, save: !!btnSave
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') wire();
  else document.addEventListener('DOMContentLoaded', wire);
})();
