const express = require('express');
const {register, requestNewCode, verifyOtp, login, getJwks, createUpmindSession} = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');
const { refreshTokenHandler } = require('../controller/refreshController');
const { logoutHandler } = require('../controller/logoutController');
const authMiddleware = require('../middleware/authMiddleware');


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.get('/well-known/jwks.json', getJwks);
router.post('/auth/refresh', refreshTokenHandler);
router.post('/auth/logout', logoutHandler);
router.post('/resend-code', requestNewCode);
router.get('/dashboard',  authMiddleware, getUserDashboard)
router.get('/upmindClientId', authMiddleware, createUpmindSession) 

module.exports = router;