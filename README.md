# Perspectives Contract Flow

Small Vite + Vercel app for the public BoldSign clinic-contract signing experience.

## Routes

- `/sign?token=...` public signer lobby and embedded BoldSign signing
- `/sign/complete` public completion page

## Serverless API

- `POST /api/signing/context`
- `POST /api/signing/start`

Secrets are read only by serverless functions. Do not prefix secret env vars with `VITE_`.

Contract creation and status checks are owned by the authenticated Internal Dashboard app. That app creates the BoldSign document and generates a signed `use.perspectiveshealth.ai/sign?token=...` link for this public signer app.

## Required Production Env

```env
SIGNING_LINK_SECRET=
PUBLIC_APP_URL=https://use.perspectiveshealth.ai
```

`BOLDSIGN_API_KEY` is optional for the v1 flow when Internal Dashboard includes the embedded signing URL in the signed token. Keep BoldSign calls in Internal Dashboard for contract creation and signing-link generation.

## Local

```bash
npm install
npm run dev
```
