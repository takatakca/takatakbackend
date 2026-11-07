const express = require('express');
const { register, requestNewCode, verifyOtp, login, getJwks, createUpmindSession } = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');
const { refreshTokenHandler } = require('../controller/refreshController');
const { logoutHandler } = require('../controller/logoutController');
const authMiddleware = require('../middleware/authMiddleware');
const router = express.Router();
// A source merge must not cut off consumers before the coordinated Auth migration.
// Read once at startup; only the exact opt-in value enables retirement.
const legacyAuthRetired = process.env.TAKATAK_LEGACY_AUTH_RETIRED === 'true';

function retiredLogin(_req, res) {
  res.set('Cache-Control', 'no-store');
  res.status(410).json({
    error: "retired",
    message:
      "This legacy TAKATAK login is retired. Continue at https://takatak.ca/login. Existing accounts were not deleted.",
  });
}

/**
 * After the explicit cutover, entry routes cannot create another legacy identity.
 * JWKS stays so tokens that were already issued can still be checked.
 */
router.post('/auth/register', legacyAuthRetired ? retiredLogin : register);
router.post('/auth/login', legacyAuthRetired ? retiredLogin : login);
router.post('/auth/verify-otp', legacyAuthRetired ? retiredLogin : verifyOtp);
router.post('/auth/resend-code', legacyAuthRetired ? retiredLogin : requestNewCode);
router.get('/auth/well-known/jwks.json', getJwks);

// Existing sessions retain their normal expiry, revocation and ownership checks.
router.post('/auth/refresh', refreshTokenHandler);
router.post('/auth/logout', authMiddleware, logoutHandler);

router.get('/user/dashboard', authMiddleware, getUserDashboard);
router.get('/user/upmindClientId', authMiddleware, legacyAuthRetired ? retiredLogin : createUpmindSession);

module.exports = router;
