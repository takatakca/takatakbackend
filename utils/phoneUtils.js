// exports.normalizePhone = (phone) => phone.trim().replace(/\s+/g, '').replace(/^\+/, '');
// exports.formatE164 = (phone) => phone.startsWith('+') ? phone : `+${phone}`;


// normalize phone into +234... format
function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, ""); // remove non-digits
  if (cleaned.startsWith("0")) {
    cleaned = "234" + cleaned.slice(1);
  }
  if (!cleaned.startsWith("234")) {
    cleaned = "234" + cleaned;
  }
  return "+" + cleaned;
}

module.exports = { normalizePhone };


// exports.normalizePhone = (phone) => {
//   const cleaned = phone.trim().replace(/\s+/g, '');
//   return cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
// };

// exports.formatForWhatsApp = (phone) => {
//   return phone.startsWith('+') ? phone : `+${phone}`;
// };
