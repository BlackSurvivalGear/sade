/* Public GitHub App configuration. Never place a client secret or private key here. */
window.SADE_GITHUB_APP = Object.freeze({
  clientId: 'Iv23liwWLsUyHyCgAaD',
  appName: 'SADE AI Engineering Agent'
});

/* Bootstrap Firebase/auth/backend modules before the main application script runs. */
document.write('<script src="config/firebase-config.js"></script>');
document.write('<script src="js/sade-firebase.js"></script>');
document.write('<script src="js/sade-backend.js"></script>');
document.write('<script src="js/real-engineering.js"></script>');
