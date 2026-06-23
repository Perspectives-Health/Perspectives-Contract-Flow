import {
  assertInternalAccess,
  badRequest,
  boldSignFetch,
  getConfig,
  methodNotAllowed,
  normalizeDocumentStatus,
  sendError,
  sendJson,
} from "../_boldsign.js"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"])
    return
  }

  try {
    const config = getConfig()
    assertInternalAccess(req, config)

    const documentId = String(req.query.documentId || "").trim()
    if (!documentId) throw badRequest("documentId is required")

    const properties = await boldSignFetch(
      config,
      `/document/properties?documentId=${encodeURIComponent(documentId)}`,
    )

    sendJson(res, 200, {
      documentId,
      status: normalizeDocumentStatus(properties.status || properties.displayStatus),
      completedAt: normalizeTimestamp(properties.completedDate || properties.activityDate),
      signers: Array.isArray(properties.signerDetails)
        ? properties.signerDetails.map((signer) => ({
            name: signer.signerName || signer.name || signer.signerRole || "",
            email: signer.signerEmail || signer.emailAddress || signer.email || "",
            status: normalizeDocumentStatus(signer.status || signer.signerStatus),
          }))
        : [],
    })
  } catch (error) {
    sendError(res, error)
  }
}

function normalizeTimestamp(value) {
  if (!value) return null
  if (typeof value === "number") return new Date(value).toISOString()
  return String(value)
}
