const express = require('express');
const { getJwks } = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');
const { refreshTokenHandler } = require('../controller/refreshController');
const { logoutHandler } = require('../controller/logoutController');
const authMiddleware = require('../middleware/authMiddleware');


const router = express.Router();

function retiredLogin(_req, res) {
  res.status(410).json({
    error: "retired",
    message:
      "This TAKATAK login is retired. Sign in with your phone on the current TAKATAK app. Existing accounts were not deleted.",
  });
}

/**
 * Register, login, OTP, and resend no longer create a second identity.
 * JWKS stays so tokens that were already issued can still be checked.
 */
router.post('/auth/register', retiredLogin);
router.post('/auth/login', retiredLogin);
router.post('/auth/verify-otp', retiredLogin);
router.post('/auth/resend-code', retiredLogin);
router.get('/auth/well-known/jwks.json', getJwks);

router.post('/auth/refresh', authMiddleware, refreshTokenHandler);
router.post('/auth/logout', authMiddleware,  logoutHandler);


router.get('/user/dashboard', authMiddleware, getUserDashboard)
router.get('/user/upmindClientId', authMiddleware, retiredLogin)

module.exports = router;