const SADE_FIREBASE = (() => {
  let auth = null;
  let ready = false;
  let initPromise = null;

  async function initialise() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const config = window.SADE_FIREBASE_CONFIG;
      if (!config || String(config.apiKey || '').startsWith('YOUR_')) return false;
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
      const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');
      const app = initializeApp(config);
      auth = getAuth(app);
      onAuthStateChanged(auth, () => {});
      ready = true;
      return true;
    })();
    return initPromise;
  }

  async function signIn() {
    const configured = await initialise();
    if (!configured) throw new Error('Firebase web configuration is not installed.');
    const { GoogleAuthProvider, signInWithPopup } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js');
    await signInWithPopup(auth, new GoogleAuthProvider());
    return auth.currentUser;
  }

  async function getIdToken() {
    const configured = await initialise();
    if (!configured || !auth?.currentUser) return null;
    return auth.currentUser.getIdToken();
  }

  function isReady() { return ready && Boolean(auth?.currentUser); }

  return { initialise, signIn, getIdToken, isReady };
})();
SADE_FIREBASE.initialise().catch(console.warn);
