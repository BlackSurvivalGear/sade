const existingFunctions = require('./index');
const githubOAuth = require('./github-oauth');

module.exports = existingFunctions;
module.exports.githubOAuthExchange = githubOAuth.githubOAuthExchange;
