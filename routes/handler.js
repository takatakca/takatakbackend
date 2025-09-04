const express = require('express');
const {register, requestNewCode, verifyOtp, login, getJwks} = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');
const { isLoggedIn } = require('../middleware/validateToken');


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.get('/well-known/jwks.json', getJwks);
router.post('/resend-code', requestNewCode);
router.get('/dashboard', isLoggedIn, getUserDashboard)

module.exports = router;