import nodemailer from 'nodemailer'

let transporter = null
let loggedFallbackWarning = false

const getTransporter = () => {
  if (!process.env.SMTP_HOST) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  }
  return transporter
}

const send = async ({ to, subject, html }) => {
  const t = getTransporter()
  if (!t) {
    if (!loggedFallbackWarning) {
      console.warn('📧 SMTP not configured — emails will be logged to console instead of sent')
      loggedFallbackWarning = true
    }
    console.log(`\n📧 [DEV EMAIL] To: ${to}\nSubject: ${subject}\n${html}\n`)
    return
  }
  await t.sendMail({ from: process.env.SMTP_FROM, to, subject, html })
}

export const sendPasswordResetEmail = async ({ to, name, resetLink }) => {
  await send({
    to,
    subject: 'Reset your NVOCC password',
    html: `
      <p>Hi ${name || ''},</p>
      <p>We received a request to reset your NVOCC password. This link expires soon and can only be used once.</p>
      <p><a href="${resetLink}">Reset your password</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    `,
  })
}

export const sendInvitationEmail = async ({ to, inviteeName, roleName, invitedByName, inviteLink }) => {
  await send({
    to,
    subject: 'You’ve been invited to NVOCC Ops',
    html: `
      <p>Hi ${inviteeName || ''},</p>
      <p>${invitedByName || 'An admin'} invited you to join NVOCC Ops as <strong>${roleName}</strong>.</p>
      <p><a href="${inviteLink}">Accept the invitation</a> to set your password and get started.</p>
      <p>This invitation expires in a few days.</p>
    `,
  })
}
