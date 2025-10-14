/* ======================================================================
   auth-cloud.js  —  add-on (NIE nadpisuje Twojego app.js)
   Wersja: sync4 (poprawione porównanie czasu: local_changed vs cloud_updated)
   Zmiany vs sync3:
     • NIE nadpisujemy lokalnego znacznika przy wczytywaniu z chmury
     • Trzymamy dwa znaczniki w localStorage:
         __local_changed_at   – kiedy użytkownik ZMIENIŁ stan (ustawiane w save())
         __cloud_synced_at    – kiedy ostatnio zsynchronizowano z serwerem (z updated_at)
     • Wybór stanu:
         if (cloudAt >= max(localChangedAt, localCloudAt)) → CLOUD wygrywa
         else if (localChangedAt > cloudAt) → LOCAL wygrywa i jest wypychany do chmury
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

  function getTs(s){ try { return s ? new Date(s).getTime() : 0; } catch { return 0; } }

  // --- Supabase init (global: window.sb) z persistSession ---
  (function initSupabase(){
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (typeof window.supabase === 'object' && url && key) {
      try {
        window.sb = window.supabase.createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
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
      // Nie dotykaj __cloud_synced_at tutaj – nadamy go na podstawie odpowiedzi
      const { data, error } = await window.sb
        .from('plans')
        .upsert(
          { user_id: window.currentUser.id, payload, updated_at: nowIso() },
          { onConflict: 'user_id' }
        )
        .select('updated_at')
        .single(); // po upsercie dostaniemy 1 wiersz

      if (error) { err('[cloud save] error', error); }
      else {
        // Zaktualizuj lokalny znacznik zsynchronizowania z chmurą
        if (data?.updated_at && window.state && typeof window.state === 'object') {
          window.state.__cloud_synced_at = data.updated_at;
          setLocal(window.state);
        }
        log('[cloud save] OK @', data?.updated_at);
      }
    } catch (e) { err('[cloud save] exception', e); }
  }

  let cloudSaveTimer = null;
  function scheduleSaveCloud() {
    if (!cloudReady) return;                 // blokada do czasu pierwszego loadu
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(savePlannerData, 1200);
  }

  // --- Wczytanie z chmury (cloud-wins z porównaniem dat) ---
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

      const cloudAt = getTs(data?.updated_at);
      const localChangedAt = getTs(local?.__local_changed_at);   // kiedy user coś zmienił
      const localCloudAt   = getTs(local?.__cloud_synced_at);    // kiedy ostatnio zsynchronizowano

      // Decyzja:
      // 1) jeśli chmura jest >= wszystkiego lokalnego → bierz CLOUD
      // 2) jeśli lokalne zmiany są nowsze niż chmura → bierz LOCAL i wypchnij
      let chosen = null;
      if (cloud && (cloudAt >= Math.max(localChangedAt, localCloudAt))) {
        chosen = cloud;
        // Nie nadawaj __local_changed_at tutaj!
        if (chosen && typeof chosen === 'object') chosen.__cloud_synced_at = data.updated_at || nowIso();
        log('[cloud load] using CLOUD', data?.updated_at);
      } else if (local) {
        chosen = local;
        log('[cloud load] using LOCAL (changed_at=', local.__local_changed_at, ', cloud_at=', local.__cloud_synced_at, ')');
        // Jeżeli lokal jest nowszy -> wypchnij jako źródło prawdy
        if (localChangedAt > cloudAt) {
          cloudReady = true; // pozwól zapisać
          await savePlannerData();
        }
      } else {
        log('[cloud load] nothing to load yet');
      }

      if (chosen){
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

  // --- Patch lokalnego save() (USTAW tylko __local_changed_at + debounce) ---
  (function patchSave(){
    const orig = window.save;
    window.save = function(){
      try { if (typeof orig === 'function') orig.apply(this, arguments); }
      catch(e){ err('orig save error', e); }
      try {
        if (typeof window.state === 'object' && window.state) {
          window.state.__local_changed_at = nowIso(); // tylko lokalna zmiana!
          setLocal(window.state);
        }
      } catch {}
      scheduleSaveCloud();
    };
    log('[sync] save() patched (local_changed_at + cloud debounce)');
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
        // szybki retry po 800ms (na wypadek opóźnienia sesji, iOS/Safari)
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
