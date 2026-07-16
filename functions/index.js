const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const nodemailer = require('nodemailer')

// ---------------------------------------------------------------------------
// Email notification when a `eval-pre-registration/{docId}` document is created
// or updated. Scoped to that ONE collection only — no other Firestore writes
// fire this function.
//
// SMTP credentials are stored as Firebase secrets (never in source). Set them
// once with:
//   firebase functions:secrets:set SMTP_HOST   (e.g. smtp.gmail.com)
//   firebase functions:secrets:set SMTP_PORT   (e.g. 465)
//   firebase functions:secrets:set SMTP_USER   (the sending account / login)
//   firebase functions:secrets:set SMTP_PASS   (app password or API key)
// Works with Gmail (smtp.gmail.com : 465, an App Password), SendGrid SMTP
// (smtp.sendgrid.net : 465, user "apikey", pass = API key), or an institutional
// SMTP server.
// ---------------------------------------------------------------------------

// Where the notification is sent. Change this to your address.
const NOTIFY_TO = 'twyoo@yonsei.ac.kr'

// IMPORTANT: this region MUST match your Firestore database's location
// (Firebase console → Firestore Database → the region shown at the top).
//   Seoul = 'asia-northeast3', us multi-region default = 'us-central1'.
const FUNCTION_REGION = 'asia-northeast3'

const SMTP_HOST = defineSecret('SMTP_HOST')
const SMTP_PORT = defineSecret('SMTP_PORT')
const SMTP_USER = defineSecret('SMTP_USER')
const SMTP_PASS = defineSecret('SMTP_PASS')

exports.notifyPreRegistration = onDocumentWritten(
  {
    document: 'eval-pre-registration/{docId}',
    region: FUNCTION_REGION,
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS],
  },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after) return // document was deleted — nothing to notify about
    const isNew = !event.data?.before?.exists

    const port = Number(SMTP_PORT.value()) || 465
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST.value(),
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
    })

    const email = after.email || event.params.docId
    const times = Array.isArray(after.availabilityLabels) ? after.availabilityLabels : []
    const count = after.availabilityCount != null ? after.availabilityCount : times.length

    const body = [
      `A pre-registration was just ${isNew ? 'submitted' : 'updated'}.`,
      '',
      `Email:        ${email}`,
      `Type:         ${isNew ? 'NEW registration' : 'Update to an existing registration'}`,
      `Submitted at: ${after.submittedAt || after.updatedAt || '(unknown)'}`,
      `Availability: ${count} slot(s) selected`,
      '',
      'Available times:',
      ...(times.length ? times.map((t) => `  • ${t}`) : ['  (none provided)']),
      '',
      '— Automated notification from the prj-vis-exp study.',
    ].join('\n')

    await transporter.sendMail({
      from: SMTP_USER.value(),
      to: NOTIFY_TO,
      subject: `[Pre-registration] ${isNew ? 'New' : 'Updated'}: ${email}`,
      text: body,
    })

    logger.info('Pre-registration notification sent', { docId: event.params.docId, isNew, to: NOTIFY_TO })
  },
)
