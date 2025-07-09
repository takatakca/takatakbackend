const express = require('express');
const {register, requestNewCode, verifyOtp, login} = require('../controller/Auth');
const { getUserDashboard } = require('../controller/userDashboard');


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-code', requestNewCode);
router.get('/dashboard', getUserDashboard)

module.exports = router;