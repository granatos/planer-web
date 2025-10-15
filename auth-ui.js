// auth-ui.js — podpina przyciski logowania i status (bez ingerencji w logikę app)
(() => {
  if (window.__AUTH_UI_WIRED__) return; window.__AUTH_UI_WIRED__ = true;

  const $ = (id) => document.getElementById(id);
  const statusEl  = $('auth-status');
  const emailEl   = $('auth-email');
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

  function ok(){ return window.sb?.auth || (alert('Brak Supabase (URL/KEY).'),0); }

  btnMagic?.addEventListener('click', async () => {
    if (!ok()) return;
    const email=(emailEl?.value||'').trim(); if (!email) return alert('Podaj e-mail');
    const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.REDIRECT_URL, shouldCreateUser:true }});
    if (error) alert(error.message); else alert('Wysłano link (sprawdź skrzynkę/spam).');
  });

  btnGoogle?.addEventListener('click', async () => {
    if (!ok()) return;
    const { error } = await sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: window.REDIRECT_URL }});
    if (error) alert(error.message);
  });

  btnDiscord?.addEventListener('click', async () => {
    if (!ok()) return;
    const { error } = await sb.auth.signInWithOAuth({ provider:'discord', options:{ redirectTo: window.REDIRECT_URL, scopes:'identify email' }});
    if (error) alert(error.message);
  });

  btnLogout?.addEventListener('click', async () => { try{ await sb?.auth?.signOut(); } catch(e){ console.error(e); } });

  sb?.auth?.onAuthStateChange?.((_e, s)=>setStatus(s?.user||null));
  sb?.auth?.getSession?.().then(({data})=>setStatus(data?.session?.user||null));

  console.log('[auth-ui] wired', {
    magic: !!btnMagic, google: !!btnGoogle, discord: !!btnDiscord, logout: !!btnLogout
  });
})();
