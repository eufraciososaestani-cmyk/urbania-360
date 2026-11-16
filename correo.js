const nodemailer = require('nodemailer');

// Envío de emails por SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_PORT opcional)
const emailConfigurado = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function transporte() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

module.exports = { emailConfigurado, transporte };
