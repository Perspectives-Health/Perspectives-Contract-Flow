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
    requireConfig(config, ["publicAppUrl", "signingLinkSecret"])
    const { token } = await readJson(req)
    const payload = verifySigningToken(token, config.signingLinkSecret)
    const redirectUrl = `${config.publicAppUrl}/sign/complete`

    if (payload.signUrl) {
      sendJson(res, 200, {
        signUrl: payload.signUrl,
        mode: "embedded",
        redirectUrl: payload.redirectUrl || redirectUrl,
      })
      return
    }

    requireConfig(config, ["apiKey"])
    const params = new URLSearchParams({
      documentId: payload.documentId,
      signerEmail: payload.signerEmail,
      redirectUrl: redirectUrl,
    })
    const result = await getEmbeddedSignLinkWithRetry(config, params)
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

async function getEmbeddedSignLinkWithRetry(config, params) {
  let lastError

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await boldSignFetch(config, `/document/getEmbeddedSignLink?${params.toString()}`)
    } catch (error) {
      lastError = error

      if (!isRetryableBoldSignReadinessError(error) || attempt === 3) {
        throw error
      }

      await wait(1000 * (attempt + 1))
    }
  }

  throw lastError
}

function isRetryableBoldSignReadinessError(error) {
  return error?.statusCode === 400 || error?.statusCode === 404 || error?.statusCode === 409
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
