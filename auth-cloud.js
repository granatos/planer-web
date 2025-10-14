<script>
(() => {
  if (window.__AUTH_CLOUD_WIRED__) return; window.__AUTH_CLOUD_WIRED__ = true;

  // --- KONFIG ---
  if (!window.REDIRECT_URL) window.REDIRECT_URL = 'https://granatos.github.io/planer-web/';
  const DEBOUNCE_MS = 1000;

  // --- Helpers ---
  const $ = (id) => document.getElementById(id);
  const log = (...a) => console.log('[sync5]', ...a);
  const err = (...a) => console.error('[sync5]', ...a);
  const CLIENT_ID_KEY = 'planner_client_id';
  const CLIENT_ID = (() => {
    try {
      const k = localStorage.getItem(CLIENT_ID_KEY);
      if (k) return k;
      const n = crypto?.randomUUID?.() || (Math.random().toString(36).slice(2)+Date.now());
      localStorage.setItem(CLIENT_ID_KEY, n);
      return n;
    } catch { return 'anon_'+Date.now(); }
  })();

  // --- Supabase init (sesja trzymana automatycznie) ---
  (function initSupabase(){
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!url || !key || typeof supabase !== 'object') { err('Brak biblioteki/kluczy Supabase'); return; }
    window.sb = supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { headers: { 'x-client-id': CLIENT_ID } }
    });
    log('supabase client ready, clientId=', CLIENT_ID);
  })();

  // --- UI refs (opcjonalne) ---
  const emailEl   = $('auth-email');
  const statusEl  = $('auth-status');
  const btnMagic  = $('btn-magic');
  const btnGoogle = $('btn-google');
  const btnDiscord= $('btn-discord');
  const btnLogout = $('btn-logout');

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

  // --- Cache lokalny (tylko pomocniczo) ---
  function setLocal(st){
    try {
      if (typeof window.STORAGE_KEY === 'string') {
        localStorage.setItem(window.STORAGE_KEY, JSON.stringify(st));
      }
    } catch {}
  }
  function getLocal(){
    try {
      if (typeof window.STORAGE_KEY === 'string') {
        const raw = localStorage.getItem(window.STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    } catch {}
    return null;
  }

  // --- Stan subskrypcji realtime i debounce ---
  let cloudLoaded = false;       // pierwsze wczytanie z chmury wykonane
  let savingTimer = null;
  let realtimeChan = null;
  let lastCloudJSON = null;      // ostatni JSON z chmury (string) do szybkiego porównania

  function jsonStable(v){
    try { return JSON.stringify(v); } catch { return null; }
  }

  // --- Zapis do chmury (ONE-ROW-PER-USER, UPSERT) ---
  async function saveCloud(){
    if (!window.sb || !window.currentUser) return;
    if (!cloudLoaded) return; // dopiero po pierwszym wczytaniu
    try {
      const payload = window.state ?? {};
      // metadata żeby inne urządzenia mogły wykryć źródło
      payload.__last_saved_by = CLIENT_ID;
      payload.__last_saved_at = new Date().toISOString();

      const { data, error } = await window.sb
        .from('plans')
        .upsert({ user_id: window.currentUser.id, payload }, { onConflict: 'user_id' })
        .select('payload')
        .single();

      if (error) { err('save error', error); return; }
      // zapamiętaj co mamy w chmurze, żeby nie robić zbędnych re-renderów
      lastCloudJSON = jsonStable(data?.payload ?? {});
      log('cloud saved');
    } catch (e) { err('save exception', e); }
  }

  function scheduleSaveCloud(){
    clearTimeout(savingTimer);
    savingTimer = setTimeout(saveCloud, DEBOUNCE_MS);
  }

  // --- Wczytanie z chmury (cloud → UI → cache) ---
  async function loadCloud(){
    if (!window.sb || !window.currentUser) return;
    try {
      const { data, error } = await window.sb
        .from('plans')
        .select('payload')
        .eq('user_id', window.currentUser.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') { err('load error', error); return; }

      const cloud = data?.payload;
      if (cloud && typeof cloud === 'object') {
        // jeśli to nasz własny świeżo zapisany stan, i tak nadpisujemy (source of truth = cloud)
        const cloudJSON = jsonStable(cloud);
        if (cloudJSON !== lastCloudJSON) {
          lastCloudJSON = cloudJSON;
        }
        window.state = cloud;
        if (typeof window.renderAll === 'function') window.renderAll();
        setLocal(window.state);
        log('cloud loaded → applied');
      } else {
        // brak rekordu: jeśli masz lokalny, wypchnij go w górę; jeśli nie – zostaw pusty
        const local = getLocal();
        if (local) {
          window.state = local;
          if (typeof window.renderAll === 'function') window.renderAll();
          log('no cloud row, used LOCAL and push up');
          // wypchniemy go do chmury:
          await saveCloud();
        } else {
          log('no cloud row, no local; starting empty');
        }
      }

      cloudLoaded = true;
    } catch (e) { err('load exception', e); }
  }

  // --- Realtime: nasłuchuj zmian swojego wiersza z innych urządzeń ---
  async function subscribeRealtime(){
    try {
      // cleanup
      if (realtimeChan) { window.sb.removeChannel(realtimeChan); realtimeChan = null; }

      const uid = window.currentUser?.id;
      if (!uid) return;

      realtimeChan = window.sb
        .channel('plans_user_'+uid, { config: { broadcast: { ack: true }, presence: { key: CLIENT_ID } } })
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'plans', filter: `user_id=eq.${uid}` },
            (pay) => {
              try {
                const newPayload = pay?.new?.payload;
                if (!newPayload) return;
                // jeśli update pochodzi z nas (CLIENT_ID), ignoruj
                if (newPayload.__last_saved_by === CLIENT_ID) return;
                const incoming = jsonStable(newPayload);
                if (incoming && incoming !== lastCloudJSON) {
                  lastCloudJSON = incoming;
                  window.state = newPayload;
                  if (typeof window.renderAll === 'function') window.renderAll();
                  setLocal(window.state);
                  log('realtime → applied update from other device');
                }
              } catch(e){ err('realtime handler', e); }
            })
        .subscribe((status) => log('realtime status:', status));
    } catch (e) { err('subscribe exception', e); }
  }

  // --- Patch save() żeby auto-zapis działał z debounce ---
  (function patchSave(){
    const orig = window.save;
    window.save = function(){
      try { if (typeof orig === 'function') orig.apply(this, arguments); } catch(e){ err('orig save', e); }
      try { setLocal(window.state); } catch {}
      scheduleSaveCloud();
    };
    log('save() patched → auto cloud debounce');
  })();

  // --- Logowanie przyciski ---
  btnMagic?.addEventListener('click', async () => {
    if (!window.sb) return alert('Brak konfiguracji Supabase');
    const email = (emailEl?.value || '').trim();
    if (!email) return alert('Podaj e-mail');
    const { error } = await window.sb.auth.signInWithOtp({
      email, options: { emailRedirectTo: window.REDIRECT_URL, shouldCreateUser: true }
    });
    if (error) return alert(error.message);
    alert('Wysłano link logowania (sprawdź skrzynkę/spam).');
  });
  btnGoogle?.addEventListener('click', async () => {
    const { error } = await window.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.REDIRECT_URL }});
    if (error) alert(error.message);
  });
  btnDiscord?.addEventListener('click', async () => {
    const { error } = await window.sb.auth.signInWithOAuth({
      provider: 'discord', options: { redirectTo: window.REDIRECT_URL, scopes: 'identify email' }
    });
    if (error) alert(error.message);
  });
  btnLogout?.addEventListener('click', async () => { try { await window.sb?.auth?.signOut(); } catch(e){ err(e); } });

  // --- Sesja: po zalogowaniu 1) load z chmury 2) realtime 3) włącz auto-zapis ---
  if (window.sb){
    window.sb.auth.onAuthStateChange(async (_e, session) => {
      const user = session?.user || null;
      window.currentUser = user;
      setStatus(user);
      if (user) {
        cloudLoaded = false;
        await loadCloud();       // nadpisz lokalny stan chmurą
        await subscribeRealtime();
        // auto-zapis już włączony przez patch save(), cloudLoaded=true po loadCloud()
      } else {
        // logout: wyczyść subskrypcję
        if (realtimeChan) { window.sb.removeChannel(realtimeChan); realtimeChan = null; }
      }
    });

    // przy pierwszym wejściu spróbuj przywrócić sesję
    window.sb.auth.getSession().then(async ({data}) => {
      const user = data?.session?.user || null;
      window.currentUser = user;
      setStatus(user);
      if (user) {
        cloudLoaded = false;
        await loadCloud();
        await subscribeRealtime();
      }
    });
  }
})();
</script>
