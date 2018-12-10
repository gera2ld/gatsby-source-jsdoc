const crypto = require('crypto');

function digest(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function asCode(str) {
  const escaped = str.replace(/([`$])/g, '\\$1');
  return `\`${str}\``;
}

exports.digest = digest;
exports.asCode = asCode;
