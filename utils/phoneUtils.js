// utils/phoneUtils.js
exports.normalizePhone = (phone) => {
  const cleaned = phone.trim().replace(/\s+/g, '');
  return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
};

exports.formatForWhatsApp = (phone) => {
  return phone.startsWith('+') ? phone : `+${phone}`;
};
