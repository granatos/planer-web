// auth-ui.js — lekkie podpięcie przycisków logowania (Discord/Google/Magic) + status.
// Nie dotyka Twojej logiki, tylko korzysta z istniejącego window.sb i window.REDIRECT_URL.
// Wczytaj TEN plik po app.js i po auth-cloud.js (compat/sync5).

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

  function guardSb(){
    if (!window.sb || !window.sb.auth) {
      alert('Brak konfiguracji Supabase (sprawdź SUPABASE_URL/ANON_KEY i skrypt supabase-js).');
      return false;
    }
    return true;
  }

  // Podpięcie przycisków (idempotentne)
  btnMagic && !btnMagic.dataset.wired && (btnMagic.dataset.wired = '1',
    btnMagic.addEventListener('click', async () => {
      if (!guardSb()) return;
      const email = (emailEl?.value || '').trim();
      if (!email) return alert('Podaj e-mail');
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.REDIRECT_URL || location.origin, shouldCreateUser: true }
      });
      if (error) return alert(error.message);
      alert('Wysłano link logowania (sprawdź skrzynkę/spam).');
    })
  );

  btnGoogle && !btnGoogle.dataset.wired && (btnGoogle.dataset.wired = '1',
    btnGoogle.addEventListener('click', async () => {
      if (!guardSb()) return;
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.REDIRECT_URL || location.origin }
      });
      if (error) alert(error.message);
    })
  );

  btnDiscord && !btnDiscord.dataset.wired && (btnDiscord.dataset.wired = '1',
    btnDiscord.addEventListener('click', async () => {
      if (!guardSb()) return;
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: window.REDIRECT_URL || location.origin, scopes: 'identify email' }
      });
      if (error) alert(error.message);
    })
  );

  btnLogout && !btnLogout.dataset.wired && (btnLogout.dataset.wired = '1',
    btnLogout.addEventListener('click', async () => {
      try { await sb?.auth?.signOut(); } catch (e) { console.error(e); }
    })
  );

  // Reakcja na zmiany sesji (tylko status + widoczność guzików)
  if (window.sb?.auth) {
    sb.auth.onAuthStateChange((_e, session) => setStatus(session?.user || null));
    sb.auth.getSession().then(({data}) => setStatus(data?.session?.user || null));
  } else {
    setStatus(null);
  }

  console.log('[auth-ui] wired', {
    magic: !!btnMagic, google: !!btnGoogle, discord: !!btnDiscord, logout: !!btnLogout
  });
})();
