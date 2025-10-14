// auth-cloud-lite.js — Non-intrusive sync & auth for existing apps.
// - No DOM dependencies, no HTML IDs, no UI.
// - Does NOT override your DOM or logic. Optional hook to your save().
// - Cloud = source of truth. Auto-save (debounced) optional.
// Usage:
//   1) Include AFTER your app.js
//   2) (optional) cloud.hookSave(1000)  // wrap window.save and auto-save to cloud
//   3) cloud.setGetState(()=>window.state); cloud.setSetState(st=>{window.state=st; window.renderAll?.();});
//   4) Login via cloud.signInDiscord()/signInGoogle()/signInWithEmail(email); or your own buttons.
//   5) On login it auto: load from cloud + subscribe realtime.
//
// Requires in <head>:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script>window.SUPABASE_URL="..."; window.SUPABASE_ANON_KEY="..."; window.REDIRECT_URL="...";</script>
(function(){
  if (window.cloud) return;
  const log = (...a)=>console.log('[cloud-lite]',...a);
  const err = (...a)=>console.error('[cloud-lite]',...a);

  const CLIENT_ID_KEY='planner_client_id';
  const CLIENT_ID = (()=>{
    try{let k=localStorage.getItem(CLIENT_ID_KEY); if(k) return k;
      k=(crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now()); localStorage.setItem(CLIENT_ID_KEY,k); return k;
    }catch{ return 'anon_'+Date.now(); }
  })();

  const state = {
    getState: ()=>window.state,
    setState: (st)=>{ window.state=st; window.renderAll?.(); },
    debounceMs: 1000,
    savingTimer: null,
    cloudLoaded: false,
    lastCloudJSON: null,
    chan: null
  };

  function init(){
    const url=window.SUPABASE_URL, key=window.SUPABASE_ANON_KEY;
    if (!url || !key || typeof window.supabase!=='object'){ err('Missing Supabase or keys'); return; }
    window.sb = window.supabase.createClient(url, key, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
      global:{ headers:{ 'x-client-id': CLIENT_ID } }
    });
    // Session bootstrap
    window.sb.auth.onAuthStateChange(async (_e, session)=>{
      window.currentUser = session?.user || null;
      if (window.currentUser){
        state.cloudLoaded=false;
        await load(); await subscribe();
      }else{
        if (state.chan){ window.sb.removeChannel(state.chan); state.chan=null; }
      }
    });
    window.sb.auth.getSession().then(async ({data})=>{
      window.currentUser = data?.session?.user || null;
      if (window.currentUser){ state.cloudLoaded=false; await load(); await subscribe(); }
    });
    log('ready, clientId=', CLIENT_ID);
  }

  function jsonStable(v){ try{ return JSON.stringify(v); }catch{ return null; } }
  function setLocal(st){
    try{ if (typeof window.STORAGE_KEY === 'string') localStorage.setItem(window.STORAGE_KEY, JSON.stringify(st)); }catch{}
  }
  function getLocal(){
    try{ if (typeof window.STORAGE_KEY === 'string'){ const raw=localStorage.getItem(window.STORAGE_KEY); return raw?JSON.parse(raw):null; } }catch{}
    return null;
  }

  async function save(){
    if (!window.sb || !window.currentUser || !state.cloudLoaded) return;
    try{
      const payload = state.getState() ?? {};
      payload.__last_saved_by = CLIENT_ID;
      payload.__last_saved_at = new Date().toISOString();
      const { data, error } = await window.sb.from('plans')
        .upsert({ user_id: window.currentUser.id, payload }, { onConflict:'user_id' })
        .select('payload').single();
      if (error) { err('save', error); return; }
      state.lastCloudJSON = jsonStable(data?.payload ?? {});
      log('saved');
    }catch(e){ err('save ex', e); }
  }
  function scheduleSave(){
    clearTimeout(state.savingTimer);
    state.savingTimer = setTimeout(save, state.debounceMs);
  }

  async function load(){
    if (!window.sb || !window.currentUser) return;
    try{
      const { data, error } = await window.sb.from('plans')
        .select('payload').eq('user_id', window.currentUser.id).maybeSingle();
      if (error && error.code!=='PGRST116'){ err('load', error); return; }
      const cloud = data?.payload;
      if (cloud && typeof cloud==='object'){
        const js = jsonStable(cloud); if (js !== state.lastCloudJSON) state.lastCloudJSON = js;
        state.setState(cloud); setLocal(cloud); log('loaded');
      } else {
        const local=getLocal();
        if (local){ state.setState(local); log('no cloud row → used local & push'); await save(); }
        else { log('no cloud row, no local'); }
      }
      state.cloudLoaded = true;
    }catch(e){ err('load ex', e); }
  }

  async function subscribe(){
    if (!window.sb || !window.currentUser) return;
    try{
      if (state.chan){ window.sb.removeChannel(state.chan); state.chan=null; }
      const uid = window.currentUser.id;
      state.chan = window.sb
        .channel('plans_user_'+uid, { config:{ broadcast:{ack:true}, presence:{key:CLIENT_ID} } })
        .on('postgres_changes', { event:'*', schema:'public', table:'plans', filter:`user_id=eq.${uid}` }, (pay)=>{
          try{
            const p = pay?.new?.payload; if (!p) return;
            if (p.__last_saved_by === CLIENT_ID) return;
            const inc = jsonStable(p);
            if (inc && inc !== state.lastCloudJSON){
              state.lastCloudJSON = inc;
              state.setState(p); setLocal(p);
              log('realtime applied');
            }
          }catch(e){ err('rt handler', e); }
        })
        .subscribe((st)=>log('realtime:', st));
    }catch(e){ err('subscribe ex', e); }
  }

  // Public API
  window.cloud = {
    init,
    setGetState(fn){ if (typeof fn==='function') state.getState=fn; },
    setSetState(fn){ if (typeof fn==='function') state.setState=fn; },
    save, load, scheduleSave, subscribe,
    hookSave(ms){
      if (typeof window.save!=='function'){ err('hookSave: window.save not found'); return; }
      if (typeof ms==='number') state.debounceMs = ms;
      const orig = window.save;
      window.save = function(){
        try{ orig.apply(this, arguments); }catch(e){ err('orig save', e); }
        try{ setLocal(state.getState()); }catch{}
        scheduleSave();
      };
      log('hooked window.save with debounce=', state.debounceMs);
    },
    // Auth helpers (wire to your own buttons)
    async signInWithEmail(email){
      if (!window.sb) return err('no sb');
      if (!email) return err('email required');
      const { error } = await window.sb.auth.signInWithOtp({
        email, options:{ emailRedirectTo: window.REDIRECT_URL, shouldCreateUser: true }
      });
      if (error) err('otp', error); else log('otp sent');
    },
    async signInGoogle(){
      const { error } = await window.sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.REDIRECT_URL }});
      if (error) err('google', error);
    },
    async signInDiscord(){
      const { error } = await window.sb.auth.signInWithOAuth({ provider:'discord', options:{ redirectTo: window.REDIRECT_URL, scopes:'identify email' }});
      if (error) err('discord', error);
    },
    async signOut(){ try{ await window.sb?.auth?.signOut(); }catch(e){ err('signOut', e); } }
  };

  // Auto-init
  init();
})();