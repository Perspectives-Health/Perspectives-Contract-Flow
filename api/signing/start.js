import {
  getConfig,
  methodNotAllowed,
  readJson,
  requireConfig,
  sendError,
  sendJson,
  verifySigningToken,
  boldSignFetch,
} from "../_boldsign.js"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"])
    return
  }

  try {
    const config = getConfig()
    requireConfig(config, ["apiKey", "publicAppUrl", "signingLinkSecret"])
    const { token } = await readJson(req)
    const payload = verifySigningToken(token, config.signingLinkSecret)
    const redirectUrl = `${config.publicAppUrl}/sign/complete`
    const params = new URLSearchParams({
      DocumentId: payload.documentId,
      SignerEmail: payload.signerEmail,
      RedirectUrl: redirectUrl,
    })
    const result = await boldSignFetch(config, `/document/getEmbeddedSignLink?${params.toString()}`)
    const signUrl = result.signLink || result.signUrl || result.embeddedSignLink || result.url

    if (!signUrl) {
      const error = new Error("BoldSign response did not include a signing URL")
      error.statusCode = 502
      throw error
    }

    sendJson(res, 200, {
      signUrl,
      mode: "embedded",
      redirectUrl,
    })
  } catch (error) {
    sendError(res, error)
  }
}
