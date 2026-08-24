/* Public GitHub App configuration. Never place a client secret or private key here. */
window.SADE_GITHUB_APP = Object.freeze({
  clientId: 'Iv23liwWLsUyHyCgAaD',
  appName: 'SADE AI Engineering Agent'
});

/* Load the real backend workspace bridge before app.js attaches its simulated submit handler. */
document.write('<script src="js/real-engineering.js"><\/script>');
