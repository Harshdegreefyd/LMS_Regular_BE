import nodemailer from 'nodemailer';



const sendMail = async (htmlContent, subject, to, user = process.env.email, pass = process.env.passkey) => {
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user,
        pass,
      },
    });

    const mailOptions = {
      from: user || 'product@degreefyd.com',
      to,
      subject,
      html: htmlContent,
    };

    // await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export default sendMail;
