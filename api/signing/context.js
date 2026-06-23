import {
  boldSignFetch,
  buildSafeContext,
  getConfig,
  methodNotAllowed,
  normalizeDocumentStatus,
  readJson,
  requireConfig,
  sendError,
  sendJson,
  verifySigningToken,
} from "../_boldsign.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"])
    return
  }

  try {
    const config = getConfig()
    requireConfig(config, ["signingLinkSecret"])
    const { token } = await readJson(req)
    const payload = verifySigningToken(token, config.signingLinkSecret)
    let status = "sent"

    if (config.apiKey && payload.documentId) {
      try {
        const properties = await boldSignFetch(
          config,
          `/document/properties?documentId=${encodeURIComponent(payload.documentId)}`,
        )
        status = normalizeDocumentStatus(properties.status || properties.displayStatus)
      } catch {
        status = "sent"
      }
    }

    sendJson(res, 200, buildSafeContext(payload, status))
  } catch (error) {
    sendError(res, error)
  }
}
