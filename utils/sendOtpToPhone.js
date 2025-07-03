const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const sendOtpToPhone = async (phone, otp) => {
    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

        // Send OTP via Twilio WhatsApp
        await twilio.messages.create({
            from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
            to: `whatsapp:${formattedPhone}`,
            body: `Your takatak login code is: ${otp}`
        });
        return otp; // Return it so it will be store in DB
}

module.exports = sendOtpToPhone;