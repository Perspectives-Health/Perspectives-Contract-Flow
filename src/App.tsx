import type { CSSProperties, FormEvent } from "react"
import { useEffect, useMemo, useState } from "react"

type SigningContext = {
  documentId: string
  client: {
    slug: string
    displayName: string
    logoUrl: string | null
    primaryColor: string | null
    accentColor: string | null
    supportEmail: string | null
  }
  signer: {
    displayName: string
    emailHint: string | null
  }
  document: {
    title: string
    description: string | null
  }
  status: string
  expiresAt: string
}

type StartSigningResponse = {
  signUrl: string
  mode: string
  redirectUrl: string
}

type CreateContractResponse = {
  documentId: string
  signingLink: string
  tokenExpiresAt: string
}

type ContractStatusResponse = {
  documentId: string
  status: string
  completedAt: string | null
  signers: Array<{ name: string; email: string; status: string }>
}

const startableStatuses = new Set(["sent", "viewed", "started", "inprogress", "unknown"])

function App() {
  const path = window.location.pathname

  if (path === "/internal") {
    return <InternalDashboard />
  }

  if (path === "/sign/complete") {
    return <CompletePage />
  }

  return <SigningPage />
}

function SigningPage() {
  const [context, setContext] = useState<SigningContext | null>(null)
  const [signUrl, setSignUrl] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState("")
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", [])

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      if (!token) {
        setError("This signing link is missing its secure token.")
        setIsLoading(false)
        return
      }

      try {
        const nextContext = await postJson<SigningContext>("/api/signing/context", { token })

        if (!cancelled) {
          setContext(nextContext)
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(errorMessage(requestError, "This signing link could not be loaded."))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadContext()

    return () => {
      cancelled = true
    }
  }, [token])

  async function startSigning() {
    setIsStarting(true)
    setError("")

    try {
      const response = await postJson<StartSigningResponse>("/api/signing/start", { token })
      setSignUrl(response.signUrl)
    } catch (requestError) {
      setError(errorMessage(requestError, "The secure signing session could not be started."))
    } finally {
      setIsStarting(false)
    }
  }

  if (signUrl) {
    return (
      <main className="signing-frame-page">
        <header className="signing-frame-header">
          <div>
            <strong>{context?.document.title || "Signing agreement"}</strong>
            <span>Secure BoldSign signing ceremony</span>
          </div>
          <a className="secondary-button" href={signUrl} rel="noreferrer" target="_blank">
            Open in new tab
          </a>
        </header>
        <iframe className="signing-frame" src={signUrl} title="Secure document signing" />
      </main>
    )
  }

  if (isLoading) {
    return <CenteredState title="Opening your agreement" body="Loading the secure signing details." />
  }

  if (error || !context) {
    return (
      <CenteredState
        title="We could not open this link"
        body={error || "Please contact Perspectives for a fresh signing link."}
      />
    )
  }

  if (context.status === "completed") {
    return (
      <CenteredState
        title="Already completed"
        body="This agreement has already been signed and submitted."
      />
    )
  }

  if (!startableStatuses.has(context.status)) {
    return (
      <CenteredState
        title="This agreement is not available"
        body={`Current status: ${context.status}. Please contact Perspectives for help.`}
      />
    )
  }

  const primaryColor = context.client.primaryColor || "#111827"
  const accentColor = context.client.accentColor || "#18c9ef"

  return (
    <main className="contract-shell" style={{ "--primary": primaryColor, "--accent": accentColor } as CSSProperties}>
      <section className="lobby-panel">
        <BrandHeader context={context} />
        <p className="eyebrow">{context.client.displayName}</p>
        <h1>Welcome, {context.signer.displayName}.</h1>
        <p className="lobby-copy">
          Please review the agreement summary, then continue into the secure BoldSign signing session.
        </p>
        <div className="summary-card">
          <strong>{context.document.title}</strong>
          <span>{context.document.description || "Please review and sign this agreement."}</span>
          <div className="chips">
            <span>Secure embedded signing</span>
            <span>Expires {formatDate(context.expiresAt)}</span>
            {context.signer.emailHint ? <span>{context.signer.emailHint}</span> : null}
          </div>
        </div>
        <button className="primary-button" disabled={isStarting} onClick={startSigning} type="button">
          {isStarting ? "Starting..." : "Review and sign"}
        </button>
      </section>

      <section className="contract-preview">
        <div className="preview-label">Order form</div>
        <article className="paper">
          <PerspectivesLogo />
          <p className="paper-eyebrow">Based on our conversation</p>
          <ContractSection
            title="Clinical Audit"
            tag="included free"
            items={[
              "We surface documentation issues that put revenue and compliance at risk.",
              "You get a dashboard with specific findings and what to do about them.",
              "Most clinics find problems they did not know existed.",
            ]}
          />
          <ContractSection
            title="Perspectives AI"
            tag="30 days free"
            items={[
              "Every night we audit charts for compliance and medical necessity opportunities.",
              "Daily reports and follow-up help issues get fixed before they become denials.",
              "Unlimited seats of Perspectives Scribe included.",
            ]}
          />
          <ContractSection
            title="60-Day Money-Back Guarantee"
            tag="no questions asked"
            items={["If Perspectives is not delivering value within 60 days, we refund everything paid."]}
          />
          <div className="terms-note">
            By signing this order form, you agree to our Terms of Service and Business Associate Agreement.
          </div>
        </article>
      </section>
    </main>
  )
}

function InternalDashboard() {
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem("contractFlow.internalApiKey") || "")
  const [form, setForm] = useState({
    clinicName: "",
    signerName: "",
    signerEmail: "",
    supportEmail: "",
    logoUrl: "",
    primaryColor: "#111827",
    accentColor: "#18c9ef",
  })
  const [created, setCreated] = useState<CreateContractResponse | null>(null)
  const [statusDocumentId, setStatusDocumentId] = useState("")
  const [contractStatus, setContractStatus] = useState<ContractStatusResponse | null>(null)
  const [error, setError] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    window.localStorage.setItem("contractFlow.internalApiKey", apiKey)
  }, [apiKey])

  async function createContract(event: FormEvent) {
    event.preventDefault()
    setIsCreating(true)
    setError("")
    setCreated(null)

    try {
      const response = await postJson<CreateContractResponse>(
        "/api/internal/create-clinic-contract",
        {
          clinicName: form.clinicName,
          signerName: form.signerName,
          signerEmail: form.signerEmail,
          supportEmail: form.supportEmail,
          brand: {
            logoUrl: form.logoUrl,
            primaryColor: form.primaryColor,
            accentColor: form.accentColor,
          },
        },
        apiKey,
      )
      setCreated(response)
      setStatusDocumentId(response.documentId)
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to create contract."))
    } finally {
      setIsCreating(false)
    }
  }

  async function checkStatus() {
    if (!statusDocumentId) return

    setIsChecking(true)
    setError("")

    try {
      const response = await getJson<ContractStatusResponse>(
        `/api/internal/contract-status?documentId=${encodeURIComponent(statusDocumentId)}`,
        apiKey,
      )
      setContractStatus(response)
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to check contract status."))
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-panel">
        <PerspectivesLogo />
        <h1>Contract flow</h1>
        <p>Create a BoldSign contract from the clinic agreement template and send the generated link manually.</p>
        <label>
          Internal API key
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" />
        </label>
        <form className="form-grid" onSubmit={createContract}>
          <label>
            Clinic name
            <input required value={form.clinicName} onChange={(event) => setForm({ ...form, clinicName: event.target.value })} />
          </label>
          <label>
            Signer name
            <input required value={form.signerName} onChange={(event) => setForm({ ...form, signerName: event.target.value })} />
          </label>
          <label>
            Signer email
            <input required type="email" value={form.signerEmail} onChange={(event) => setForm({ ...form, signerEmail: event.target.value })} />
          </label>
          <label>
            Support email
            <input type="email" value={form.supportEmail} onChange={(event) => setForm({ ...form, supportEmail: event.target.value })} />
          </label>
          <label>
            Logo URL
            <input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} />
          </label>
          <label>
            Primary color
            <input value={form.primaryColor} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} />
          </label>
          <label>
            Accent color
            <input value={form.accentColor} onChange={(event) => setForm({ ...form, accentColor: event.target.value })} />
          </label>
          <button className="primary-button" disabled={isCreating} type="submit">
            {isCreating ? "Creating..." : "Create contract"}
          </button>
        </form>
        {error ? <p className="error-box">{error}</p> : null}
        {created ? (
          <div className="result-box">
            <strong>Contract created</strong>
            <span>Document ID: {created.documentId}</span>
            <textarea readOnly value={created.signingLink} />
            <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(created.signingLink)} type="button">
              Copy signing link
            </button>
          </div>
        ) : null}
      </section>

      <section className="dashboard-panel compact">
        <h2>Check status</h2>
        <label>
          Document ID
          <input value={statusDocumentId} onChange={(event) => setStatusDocumentId(event.target.value)} />
        </label>
        <button className="secondary-button" disabled={isChecking || !statusDocumentId} onClick={checkStatus} type="button">
          {isChecking ? "Checking..." : "Check status"}
        </button>
        {contractStatus ? (
          <div className="result-box">
            <strong>{contractStatus.status}</strong>
            <span>Document ID: {contractStatus.documentId}</span>
            {contractStatus.completedAt ? <span>Completed: {contractStatus.completedAt}</span> : null}
            {contractStatus.signers.map((signer) => (
              <span key={`${signer.email}-${signer.status}`}>
                {signer.name || signer.email}: {signer.status}
              </span>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}

function CompletePage() {
  return (
    <CenteredState
      title="Signed and submitted"
      body="Thanks. The agreement has been completed, and the Perspectives team will follow up with next steps."
    />
  )
}

function CenteredState({ title, body }: { title: string; body: string }) {
  return (
    <main className="centered-shell">
      <PerspectivesLogo />
      <div className="status-mark">✓</div>
      <h1>{title}</h1>
      <p>{body}</p>
    </main>
  )
}

function BrandHeader({ context }: { context: SigningContext }) {
  if (context.client.logoUrl) {
    return <img className="client-logo" src={context.client.logoUrl} alt={context.client.displayName} />
  }

  return <PerspectivesLogo />
}

function ContractSection({ title, tag, items }: { title: string; tag: string; items: string[] }) {
  return (
    <section className="contract-section">
      <div className="offer-icon">→</div>
      <div>
        <div className="section-heading">
          <h3>{title}</h3>
          <span>{tag}</span>
        </div>
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function PerspectivesLogo() {
  return (
    <svg className="perspectives-logo" viewBox="0 0 1153.56 197.12" aria-label="Perspectives">
      <path fill="currentColor" d="M221.28,161.44V39.78h47.97c12.05,0,21.69,3.3,28.94,9.91,7.23,6.61,10.86,15.41,10.86,26.41s-3.63,19.82-10.86,26.42c-7.25,6.6-16.89,9.91-28.94,9.91h-27.46v49.01h-20.51ZM241.79,94.7h26.07c6.37,0,11.39-1.65,15.04-4.96,3.65-3.3,5.47-7.84,5.47-13.64s-1.82-10.34-5.47-13.64c-3.65-3.3-8.66-4.95-15.04-4.95h-26.07v37.19Z" />
      <path fill="currentColor" d="M394.73,114.34c0,3.13-.12,5.74-.35,7.82h-66.91c.81,7.53,3.5,13.5,8.08,17.9,4.57,4.41,10.34,6.61,17.29,6.61,5.79,0,10.6-1.3,14.42-3.91,3.83-2.61,6.32-6.28,7.48-11.03l17.9,4.51c-2.32,8.46-7.02,15.01-14.08,19.64-7.07,4.63-15.76,6.95-26.07,6.95-13.32,0-23.93-4.44-31.81-13.29-7.88-8.87-11.82-19.5-11.82-31.9s3.8-23.17,11.38-31.98c7.59-8.8,18.05-13.21,31.37-13.21s23.98,4.11,31.63,12.34c7.64,8.23,11.47,18.08,11.47,29.55M328.34,107.73h46.23c-.58-6.14-2.86-11.06-6.87-14.77-4-3.7-9.36-5.56-16.08-5.56-6.02,0-11.07,1.77-15.12,5.3-4.06,3.54-6.78,8.55-8.17,15.03" />
      <path fill="currentColor" d="M459.73,92.27c-3.13-1.39-6.9-2.09-11.29-2.09-6.95,0-12.72,3.21-17.3,9.65-4.57,6.43-6.86,16.08-6.86,28.94v32.67h-18.95v-87.59h18.95v16.68c2.31-5.21,6.02-9.53,11.12-12.95,5.09-3.41,10.31-5.13,15.63-5.13,3.83,0,7.07.53,9.74,1.56l-1.05,18.25Z" />
      <path fill="currentColor" d="M502.13,162.83c-9.85,0-17.99-2.52-24.42-7.56-6.43-5.04-10.81-11.1-13.12-18.17l15.64-6.61c3.59,11.47,10.88,17.21,21.89,17.21,4.41,0,8.02-1.1,10.86-3.3,2.84-2.2,4.26-4.93,4.26-8.18,0-3.47-1.68-6.2-5.04-8.17-3.36-1.97-7.44-3.5-12.25-4.6-4.81-1.1-9.59-2.43-14.34-4-4.75-1.56-8.81-4.26-12.16-8.08-3.36-3.82-5.04-8.8-5.04-14.94,0-6.95,2.81-12.69,8.43-17.21,5.62-4.52,13.12-6.78,22.51-6.78,8.22,0,15.52,2,21.89,6,6.37,4,10.49,9.19,12.34,15.56l-15.64,6.6c-1.05-4.16-3.34-7.47-6.87-9.9-3.54-2.43-7.39-3.65-11.56-3.65s-7.47.78-9.9,2.35c-2.43,1.56-3.65,3.8-3.65,6.69s1.68,5.36,5.03,7.04c3.36,1.68,7.45,3.04,12.25,4.08,4.81,1.04,9.65,2.37,14.51,4,4.87,1.62,8.97,4.52,12.34,8.68,3.36,4.17,5.04,9.56,5.04,16.17,0,7.64-3.08,14.02-9.21,19.12-6.15,5.1-14.08,7.65-23.81,7.65" />
      <path fill="currentColor" d="M18.52,178.56h-7.92c-5.85,0-10.59-4.74-10.59-10.59V29.37c0-5.85,4.74-10.59,10.59-10.59h7.92c5.85,0,10.59,4.74,10.59,10.59v138.6c0,5.85-4.74,10.59-10.59,10.59" />
      <path fill="currentColor" d="M83.3,180.29l-24.33,4.95c-6.56,1.33-12.7-3.68-12.7-10.38V22.49c0-6.7,6.14-11.71,12.7-10.38l24.33,4.94c4.94,1,8.48,5.34,8.48,10.38v142.48c0,5.03-3.54,9.38-8.48,10.38" />
      <path fill="currentColor" d="M169.08,180.99l-46.15,15.57c-6.86,2.32-13.98-2.79-13.98-10.04V10.6c0-7.26,7.14-12.37,14.01-10.02l46.15,15.75c4.29,1.46,7.17,5.49,7.17,10.02v144.61c0,4.55-2.9,8.59-7.21,10.04" />
    </svg>
  )
}

async function postJson<T>(url: string, body: unknown, internalApiKey?: string) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(internalApiKey ? { Authorization: `Bearer ${internalApiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  return parseJsonResponse<T>(response)
}

async function getJson<T>(url: string, internalApiKey?: string) {
  const response = await fetch(url, {
    headers: internalApiKey ? { Authorization: `Bearer ${internalApiKey}` } : undefined,
  })

  return parseJsonResponse<T>(response)
}

async function parseJsonResponse<T>(response: Response) {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.detail || `Request failed with status ${response.status}`)
  }

  return payload as T
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export default App
