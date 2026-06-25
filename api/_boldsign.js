import { createHmac, timingSafeEqual } from "node:crypto"

const DEFAULT_BOLDSIGN_API_BASE_URL = "https://api.boldsign.com/v1"
const CONFIG_ENV_NAMES = {
  apiKey: "BOLDSIGN_API_KEY",
  publicAppUrl: "PUBLIC_APP_URL",
  signingLinkSecret: "SIGNING_LINK_SECRET",
}

export function getConfig() {
  return {
    apiKey: process.env.BOLDSIGN_API_KEY || "",
    apiBaseUrl: (process.env.BOLDSIGN_API_BASE_URL || DEFAULT_BOLDSIGN_API_BASE_URL).replace(/\/$/, ""),
    publicAppUrl: (process.env.PUBLIC_APP_URL || "").replace(/\/$/, ""),
    signingLinkSecret: process.env.SIGNING_LINK_SECRET || "",
  }
}

export function requireConfig(config, keys) {
  const missing = keys.filter((key) => !config[key])

  if (missing.length > 0) {
    const missingEnvNames = missing.map((key) => CONFIG_ENV_NAMES[key] || key)
    const error = new Error(`Missing server configuration: ${missingEnvNames.join(", ")}`)
    error.statusCode = 500
    error.exposeMessage = true
    throw error
  }
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") {
    return req.body
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}")
  }

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString("utf8")
  return rawBody ? JSON.parse(rawBody) : {}
}

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload))
}

export function sendError(res, error) {
  const statusCode = error.statusCode || 500
  console.error("[signing-api]", {
    message: error.message,
    statusCode,
    payload: summarizeErrorPayload(error.payload),
  })
  sendJson(res, statusCode, {
    detail: statusCode < 500 || error.exposeMessage ? error.message : "Unable to complete request.",
  })
}

export function methodNotAllowed(res, allowedMethods) {
  res.setHeader("Allow", allowedMethods.join(", "))
  sendJson(res, 405, { detail: "Method not allowed" })
}

export function badRequest(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

export function verifySigningToken(token, secret) {
  if (!secret) {
    const error = new Error("SIGNING_LINK_SECRET is not configured")
    error.statusCode = 500
    throw error
  }

  const [encodedPayload, signature] = String(token || "").split(".")

  if (!encodedPayload || !signature) {
    throw badRequest("Invalid signing token")
  }

  const expectedSignature = sign(encodedPayload, secret)

  if (!safeEqual(signature, expectedSignature)) {
    throw badRequest("Invalid signing token")
  }

  let payload

  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload))
  } catch {
    throw badRequest("Invalid signing token")
  }

  const now = Math.floor(Date.now() / 1000)

  if (!payload.exp || Number(payload.exp) <= now) {
    const error = new Error("Signing token expired")
    error.statusCode = 410
    throw error
  }

  return payload
}

export async function boldSignFetch(config, path, options = {}) {
  requireConfig(config, ["apiKey"])

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "X-API-KEY": config.apiKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  })

  const contentType = response.headers.get("content-type") || ""
  const responseText = await response.text()
  const payload =
    contentType.includes("application/json") && responseText
      ? JSON.parse(responseText)
      : responseText

  if (!response.ok) {
    const error = new Error(formatBoldSignError(response.status, payload))
    error.statusCode = response.status >= 500 ? 502 : response.status
    error.payload = payload
    error.exposeMessage = response.status < 500
    throw error
  }

  return payload
}

export function normalizeDocumentStatus(status) {
  const normalized = String(status || "").toLowerCase()

  if (normalized.includes("complete")) return "completed"
  if (normalized.includes("declin")) return "declined"
  if (normalized.includes("expir")) return "expired"
  if (normalized.includes("revoke")) return "revoked"
  if (normalized.includes("draft")) return "draft"
  if (normalized.includes("schedule")) return "scheduled"
  if (normalized.includes("progress")) return "sent"
  if (normalized.includes("sent")) return "sent"
  if (normalized.includes("view")) return "viewed"

  return normalized || "unknown"
}

export function buildSafeContext(payload, status = "sent") {
  return {
    documentId: payload.documentId,
    client: {
      slug: payload.clientSlug || slugify(payload.clinicName || "clinic"),
      displayName: payload.clinicName || "Clinic",
      logoUrl: payload.brand?.logoUrl || null,
      primaryColor: payload.brand?.primaryColor || null,
      accentColor: payload.brand?.accentColor || null,
      supportEmail: payload.supportEmail || null,
    },
    signer: {
      displayName: payload.signerName || "Signer",
      emailHint: maskEmail(payload.signerEmail),
    },
    document: {
      title: payload.documentTitle || "Clinic Services Agreement",
      description: payload.documentDescription || "Please review and sign this agreement.",
      monthlyPrice: payload.monthlyPrice || null,
      priceTerms: payload.priceTerms || null,
      trialDays: normalizeTrialDays(payload.trialDays),
      includeMoneyBackGuarantee:
        typeof payload.includeMoneyBackGuarantee === "boolean"
          ? payload.includeMoneyBackGuarantee
          : normalizeTrialDays(payload.trialDays) === 30,
    },
    status,
    expiresAt: new Date(Number(payload.exp) * 1000).toISOString(),
  }
}

function normalizeTrialDays(value) {
  return Number(value) === 90 ? 90 : 30
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function maskEmail(email) {
  const [name, domain] = String(email || "").split("@")

  if (!name || !domain) {
    return null
  }

  return `${name.slice(0, 1)}${name.length > 1 ? "***" : ""}@${domain}`
}

function sign(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url")
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }

  return timingSafeEqual(leftBuffer, rightBuffer)
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url")
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function summarizeErrorPayload(payload) {
  if (!payload) {
    return undefined
  }

  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload)
  return serialized.length > 1000 ? `${serialized.slice(0, 1000)}...` : serialized
}

function formatBoldSignError(status, payload) {
  const fallback = `BoldSign request failed with status ${status}`

  if (!payload) {
    return fallback
  }

  if (typeof payload === "string") {
    return payload.length > 240 ? `${fallback}: ${payload.slice(0, 240)}...` : `${fallback}: ${payload}`
  }

  const message =
    payload.message ||
    payload.Message ||
    payload.title ||
    payload.Title ||
    payload.error ||
    payload.Error ||
    payload.detail ||
    payload.Detail
  const validationMessage = extractValidationMessage(payload)

  if (message || validationMessage) {
    return `${fallback}: ${[message, validationMessage].filter(Boolean).join(" ")}`
  }

  return `${fallback}: ${summarizeErrorPayload(payload)}`
}

function extractValidationMessage(payload) {
  const errors = payload.errors || payload.Errors

  if (!errors || typeof errors !== "object") {
    return ""
  }

  const messages = Object.entries(errors)
    .flatMap(([field, value]) => {
      const fieldMessages = Array.isArray(value) ? value : [value]
      return fieldMessages.map((message) => `${field}: ${String(message)}`)
    })
    .filter(Boolean)

  return messages.join(" ")
}
