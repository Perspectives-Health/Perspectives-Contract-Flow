# Perspectives Contract Flow

Small Vite + Vercel app for creating and signing BoldSign clinic contracts.

## Routes

- `/sign?token=...` public signer lobby and embedded BoldSign signing
- `/sign/complete` public completion page

## Serverless API

- `POST /api/internal/create-clinic-contract`
- `GET /api/internal/contract-status?documentId=...`
- `POST /api/signing/context`
- `POST /api/signing/start`

BoldSign secrets are read only by serverless functions. Do not prefix secret env vars with `VITE_`.

Build the internal dashboard inside the existing authenticated internal app. That app should call its own serverless routes, and those routes should forward requests to this app's protected `/api/internal/*` routes using `INTERNAL_CONTRACT_API_KEY` from server-only env.

## Required Production Env

```env
BOLDSIGN_API_KEY=
BOLDSIGN_TEMPLATE_ID=
BOLDSIGN_API_BASE_URL=https://api.boldsign.com/v1
BOLDSIGN_TEMPLATE_ROLE_NAME=ClinicSigner
BOLDSIGN_TEMPLATE_ROLE_INDEX=1
BOLDSIGN_DISABLE_EMAILS=true
SIGNING_LINK_SECRET=
SIGNING_LINK_TTL_SECONDS=1209600
INTERNAL_CONTRACT_API_KEY=
PUBLIC_APP_URL=https://use.perspectiveshealth.ai
```

## Local

```bash
npm install
npm run dev
```
