import {
  assertInternalAccess,
  badRequest,
  boldSignFetch,
  createSigningToken,
  getConfig,
  methodNotAllowed,
  readJson,
  requireConfig,
  sendError,
  sendJson,
  slugify,
} from "../_boldsign.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"])
    return
  }

  try {
    const config = getConfig()
    requireConfig(config, ["apiKey", "templateId", "publicAppUrl", "signingLinkSecret"])
    assertInternalAccess(req, config)

    const body = await readJson(req)
    const clinicName = cleanString(body.clinicName)
    const signerName = cleanString(body.signerName)
    const signerEmail = cleanString(body.signerEmail).toLowerCase()
    const supportEmail = cleanString(body.supportEmail)
    const brand = normalizeBrand(body.brand)

    if (!clinicName) throw badRequest("clinicName is required")
    if (!signerName) throw badRequest("signerName is required")
    if (!isLikelyEmail(signerEmail)) throw badRequest("A valid signerEmail is required")

    const documentTitle = `${clinicName} Clinic Services Agreement`
    const payload = {
      title: documentTitle,
      message: `Please review and sign the ${documentTitle}.`,
      roles: [
        {
          name: config.templateRoleName,
          index: config.templateRoleIndex,
          defaultSignerName: signerName,
          defaultSignerEmail: signerEmail,
        },
      ],
      disableEmails: config.disableBoldSignEmails,
      labels: ["clinic-contract"],
      metaData: {
        source: "perspectives-contract-flow",
        clinicName,
        signerEmail,
      },
    }

    const result = await boldSignFetch(
      config,
      `/template/send?templateId=${encodeURIComponent(config.templateId)}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    )

    const documentId = result.documentId || result.documentID || result.id

    if (!documentId) {
      const error = new Error("BoldSign response did not include a documentId")
      error.statusCode = 502
      throw error
    }

    const now = Math.floor(Date.now() / 1000)
    const tokenPayload = {
      documentId,
      signerEmail,
      signerName,
      clinicName,
      clientSlug: slugify(clinicName),
      supportEmail: supportEmail || undefined,
      brand,
      documentTitle,
      documentDescription: "Please review and sign this clinic services agreement.",
      iat: now,
      exp: now + config.signingLinkTtlSeconds,
    }
    const token = createSigningToken(tokenPayload, config.signingLinkSecret)
    const signingLink = `${config.publicAppUrl}/sign?token=${encodeURIComponent(token)}`

    sendJson(res, 201, {
      documentId,
      signingLink,
      tokenExpiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
    })
  } catch (error) {
    sendError(res, error)
  }
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBrand(value) {
  if (!value || typeof value !== "object") {
    return {}
  }

  return {
    logoUrl: cleanString(value.logoUrl) || undefined,
    primaryColor: cleanString(value.primaryColor) || undefined,
    accentColor: cleanString(value.accentColor) || undefined,
  }
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
