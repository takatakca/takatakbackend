const nodemailer = require('nodemailer');


        // Send OTP via email
        const mailTransporter = nodemailer.createTransport({
            service: 'gmail',
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: {
                user: `${process.env.EMAIL_USER}`,              
                pass: `${process.env.EMAIL_PASS}`

            },
        });

    const sendOtpToEmail = async (email, otp) => {
        if (!email) throw new Error('Missing email');
        await mailTransporter.sendMail({
            from: `"Takatak Team" <${process.env.EMAIL_USER}> `,
            to: email,
            subject: 'OTP from Takatak platform',
            text: `Your OTP is: ${otp}. It will expire in 5 minutes.\n \nDon't share this code with anyone;\n Our employees will never ask for this code`
        });
    };

    module.exports = sendOtpToEmail