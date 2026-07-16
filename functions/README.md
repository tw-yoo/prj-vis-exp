# Pre-registration email notifications

A single Cloud Function (`notifyPreRegistration` in [`index.js`](./index.js)) that
sends an email whenever a document in the **`pre-registration`** collection is
created or updated in Firestore. It is scoped to that one collection only — no
other Firestore writes trigger it.

The code is ready; the steps below are the account/credential/deploy actions
that only you can do. **Nobody needs your email password in plain text** — it is
stored as a Firebase secret.

## One-time setup

### 1. Enable billing (Blaze plan)

Cloud Functions require the **Blaze** (pay-as-you-go) plan. For a low-traffic
notification like this you will stay inside the free monthly allotment.
→ Firebase console → ⚙️ → Usage and billing → Modify plan → Blaze.

### 2. Install the Firebase CLI and log in

```bash
npm install -g firebase-tools
firebase login
```

### 3. Confirm the function region matches your Firestore location

Open the Firebase console → **Firestore Database** and note the region shown at
the top. Then in [`index.js`](./index.js) set `FUNCTION_REGION` to match:

- Seoul → `asia-northeast3` (the current default)
- US multi-region → `us-central1`

Also set `NOTIFY_TO` in `index.js` to the address that should receive the alerts
(currently `twyoo@yonsei.ac.kr`).

### 4. Provide the SMTP credentials as secrets

Run each command and paste the value when prompted (values are stored encrypted
by Google, never in the repo):

```bash
cd functions
firebase functions:secrets:set SMTP_HOST   # e.g. smtp.gmail.com
firebase functions:secrets:set SMTP_PORT   # e.g. 465
firebase functions:secrets:set SMTP_USER   # the sending account / login
firebase functions:secrets:set SMTP_PASS   # app password or API key
```

**Yonsei (yonsei.ac.kr) — this is Gmail.** Yonsei Mail (연세 클라우드 메일) runs
on Google Workspace, so a `@yonsei.ac.kr` account uses the Gmail SMTP server:

| Secret | Value |
|--------|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your full address, e.g. `twyoo@yonsei.ac.kr` |
| `SMTP_PASS` | a **Google App Password** (see below) — NOT your portal password |

To get the App Password: sign in to the Yonsei Google account → Google Account →
Security → turn on **2-Step Verification** → **App passwords** → create one →
copy the 16-character code. The notification email is then sent *from* your
Yonsei address to `NOTIFY_TO`.

> If "App passwords" is missing, the Yonsei Workspace admin has disabled it. In
> that case use a personal Gmail account or SendGrid (below) as the sender
> instead — the notification can still be delivered to your Yonsei inbox.

**Any other Gmail account:** same as above with `SMTP_USER=<your@gmail.com>`.

**SendGrid:** `SMTP_HOST=smtp.sendgrid.net`, `SMTP_PORT=465`,
`SMTP_USER=apikey`, `SMTP_PASS=<your SendGrid API key>`, and change the `from:`
line in `index.js` to a verified sender address.

### 5. Install dependencies and deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Test it

Submit a pre-registration through the form (or edit any doc in the
`eval-pre-registration` collection in the Firestore console). Within a few seconds
an email should arrive at `NOTIFY_TO`. If it doesn't, check the logs:

```bash
firebase functions:log --only notifyPreRegistration
```

## Notes

- The function only **reads** the document and sends mail; it never writes back
  to Firestore, so there is no trigger loop.
- To change the recipient or the email wording later, edit `index.js` and
  re-run `firebase deploy --only functions` (no need to re-enter secrets).
