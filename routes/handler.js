const express = require('express');
const {register, requestNewCode, verifyOtp, login, getJwks, createUpmindSession} = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');
const { refreshTokenHandler } = require('../controller/refreshController');
const { logoutHandler } = require('../controller/logoutController');
const authMiddleware = require('../middleware/authMiddleware');
const verifyApiKey = require('../middleware/verifyApiKey');


const router = express.Router();

/**
 * ======================
 * 🔓 Public Auth Routes
 * ======================
 */

router.post('/auth/register', verifyApiKey, register);
router.post('/auth/login', verifyApiKey, login);
router.post('/auth/verify-otp', verifyOtp);
router.post('/auth/resend-code', requestNewCode);
router.get('/auth/well-known/jwks.json', getJwks);

/**
 * ======================
 * 🔐 Authenticated Routes
 * ======================
 */
router.post('/auth/refresh', authMiddleware, refreshTokenHandler);
router.post('/auth/logout', authMiddleware,  logoutHandler);


router.get('/user/dashboard', authMiddleware, getUserDashboard)
router.get('/user/upmindClientId', authMiddleware, createUpmindSession) 

module.exports = router;