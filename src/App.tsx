import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

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

const startableStatuses = new Set(["sent", "viewed", "started", "inprogress", "unknown"])

const contractSections = [
  {
    icon: "list",
    title: "Clinical Audit",
    tag: "included free",
    intro:
      "A full review of your charts, delivered before anything else starts, so you can see exactly what problems may be costing you money.",
    bullets: [
      "We surface documentation issues that put your revenue and compliance at risk.",
      "You get a dashboard with specific findings and what to do about them.",
      "Most clinics find problems they did not know existed.",
      "Yours to keep. This kind of analysis normally costs thousands from a billing consultant.",
    ],
  },
  {
    icon: "clock",
    title: "Perspectives AI",
    tag: "30 days free",
    intro: "Full access starts the day your audit is delivered.",
    bullets: [
      "Every night we audit every chart for compliance issues and ways documentation can be strengthened for medical necessity.",
      "We send you a daily report of issues, and our agent emails clinicians to make sure things are fixed before they turn into issues.",
      "You have access to a dashboard with audit results, but you never need to log in if you do not want to.",
      "Unlimited seats of Perspectives Scribe included.",
    ],
  },
  {
    icon: "check",
    title: "60-Day Money-Back Guarantee",
    tag: "no questions asked",
    intro: "We take on all the risk so you do not have to.",
    bullets: ["If Perspectives is not delivering value within 60 days, we refund everything you have paid."],
  },
]

function App() {
  const path = window.location.pathname

  if (path === "/sign/complete") {
    return <CompletePage />
  }

  return <SigningPage />
}

function SigningPage() {
  const [context, setContext] = useState<SigningContext | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [isContractAtBottom, setIsContractAtBottom] = useState(false)
  const [signUrl, setSignUrl] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState("")
  const contractScrollRef = useRef<HTMLDivElement>(null)
  const token = useMemo(() => readSigningToken(), [])

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

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlHeight = document.documentElement.style.height
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyHeight = document.body.style.height
    const rootElement = document.getElementById("root")
    const previousRootHeight = rootElement?.style.height
    const previousRootOverflow = rootElement?.style.overflow

    document.documentElement.style.overflow = "hidden"
    document.documentElement.style.height = "100%"
    document.body.style.overflow = "hidden"
    document.body.style.height = "100%"

    if (rootElement) {
      rootElement.style.height = "100%"
      rootElement.style.overflow = "hidden"
    }

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.height = previousHtmlHeight
      document.body.style.overflow = previousBodyOverflow
      document.body.style.height = previousBodyHeight

      if (rootElement) {
        rootElement.style.height = previousRootHeight ?? ""
        rootElement.style.overflow = previousRootOverflow ?? ""
      }
    }
  }, [])

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

  function goNext() {
    if (step === 1) {
      setStep(2)
      return
    }

    if (step === 2) {
      setStep(3)
      setIsContractAtBottom(false)
      requestAnimationFrame(() => {
        contractScrollRef.current?.scrollTo({ top: 0 })
      })
      return
    }

    if (!isContractAtBottom) {
      scrollContractDown()
      return
    }

    void startSigning()
  }

  function goBack() {
    if (step === 3) {
      setStep(2)
      return
    }

    if (step === 2) {
      setStep(1)
    }
  }

  function scrollContractDown() {
    const scrollContainer = contractScrollRef.current

    if (!scrollContainer) {
      return
    }

    const nextScrollTop = Math.min(
      scrollContainer.scrollTop + scrollContainer.clientHeight * 0.82,
      scrollContainer.scrollHeight - scrollContainer.clientHeight,
    )
    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight

    scrollContainer.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    })

    if (nextScrollTop >= maxScrollTop - 4) {
      setIsContractAtBottom(true)
    }
  }

  function updateContractScrollState() {
    const scrollContainer = contractScrollRef.current

    if (!scrollContainer) {
      return
    }

    const distanceFromBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
    setIsContractAtBottom(distanceFromBottom < 160)
  }

  if (signUrl) {
    return (
      <main className="signing-frame-page">
        <header className="signing-frame-header">
          <PerspectivesLogo />
          <div>
            <strong>{context?.document.title || "Signing agreement"}</strong>
            <span>Secure BoldSign signing ceremony</span>
          </div>
        </header>
        <div className="signing-frame-wrap">
          <iframe className="signing-frame" src={signUrl} title="Secure document signing" />
        </div>
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
    return <CenteredState title="Already completed" body="This agreement has already been signed and submitted." />
  }

  if (!startableStatuses.has(context.status)) {
    return (
      <CenteredState
        title="This agreement is not available"
        body={`Current status: ${context.status}. Please contact Perspectives for help.`}
      />
    )
  }

  return (
    <main className="contract-onboarding-shell">
      {step === 1 ? (
        <section className="flow-step">
          <div className="welcome-panel">
            <h1>Welcome, {context.signer.displayName}.</h1>
            <div>
              <p>
                We built Perspectives for teams who are intentional about careful clinical work,
                thoughtful onboarding, and standards that hold up in practice.
              </p>
              <p>This is the first step before your onboarding agreement.</p>
            </div>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="flow-step">
          <div className="start-panel">
            <h1>Let's get started.</h1>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="flow-step contract-step">
          <div className="contract-scroll transparent-scrollbar" onScroll={updateContractScrollState} ref={contractScrollRef}>
            <div className="contract-pages">
              <ContractDetailsPage context={context} />
              <ContractTermsPage context={context} />
            </div>
          </div>
        </section>
      ) : null}

      <nav aria-label="Contract onboarding navigation" className="flow-nav">
        <button aria-label="Back" disabled={step === 1 || isStarting} onClick={goBack} type="button">
          Back
        </button>

        <div className="step-dots" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((stepNumber) => (
            <span className={step === stepNumber ? "active" : ""} key={stepNumber} />
          ))}
        </div>

        <button
          aria-label={step === 3 && !isContractAtBottom ? "Scroll contract down" : "Continue"}
          className={step === 3 && isContractAtBottom ? "wide" : ""}
          disabled={isStarting}
          onClick={goNext}
          type="button"
        >
          {isStarting ? "Opening" : step === 3 && !isContractAtBottom ? "Down" : step === 3 ? "Sign" : "Next"}
        </button>
      </nav>
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
      <div className="status-mark">OK</div>
      <h1>{title}</h1>
      <p>{body}</p>
    </main>
  )
}

function ContractDetailsPage({ context }: { context: SigningContext }) {
  return (
    <ContractPage>
      <PerspectivesLogo />

      <div className="contract-title-block">
        <p>Based on our conversation</p>
        <h2>{context.document.title}</h2>
        <span>{context.signer.emailHint ? `Prepared for ${context.signer.emailHint}` : context.client.displayName}</span>
      </div>

      <div className="contract-section-list">
        {contractSections.map((section) => (
          <section className="contract-section" key={section.title}>
            <OfferIcon type={section.icon} />
            <div>
              <div className="section-heading">
                <h3>{section.title}</h3>
                <ContractTag>{section.tag}</ContractTag>
              </div>
              <p>{section.intro}</p>
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>
                    <span>-&gt;</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <div className="contract-footnote">
        <p>Cancel any time</p>
        <p>Unlimited standards and chart audits, 24hr customer support.</p>
      </div>
    </ContractPage>
  )
}

function ContractTermsPage({ context }: { context: SigningContext }) {
  return (
    <ContractPage>
      <PerspectivesLogo />
      <div className="terms-callout">
        <p>
          By signing this order form, you agree to our Terms of Service and Business Associate Agreement,
          published at perspectiveshealth.ai/terms and perspectiveshealth.ai/baa respectively.
        </p>
      </div>

      <div className="signature-preview">
        <p>Customer</p>
        <SignatureLine label="Date" value={formatDate(new Date().toISOString())} />
        <SignatureLine label="Printed name" value={context.signer.displayName} />
        <SignatureLine label="Clinic" value={context.client.displayName} />
        <SignatureLine label="Signature" value="Completed in secure BoldSign ceremony" wide />
      </div>

      <ContractFooter />
    </ContractPage>
  )
}

function ContractPage({ children }: { children: ReactNode }) {
  return <article className="contract-page">{children}</article>
}

function ContractTag({ children }: { children: ReactNode }) {
  return <span className="contract-tag">{children}</span>
}

function OfferIcon({ type }: { type: string }) {
  const label = type === "clock" ? "O" : type === "check" ? "OK" : "List"
  return <div className="offer-icon">{label}</div>
}

function SignatureLine({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "signature-line is-wide" : "signature-line"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ContractFooter() {
  return (
    <footer className="contract-footer">
      <p>perspectiveshealth.ai / eshan@perspectiveshealth.ai</p>
      <span>HIPAA Compliant</span>
    </footer>
  )
}

function PerspectivesLogo() {
  return <img className="perspectives-logo" src="/perspectives-logo.png" alt="Perspectives" />
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

function readSigningToken() {
  const queryToken = new URLSearchParams(window.location.search).get("token")

  if (queryToken) {
    return queryToken
  }

  const hash = window.location.hash.replace(/^#/, "")
  const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash
  return new URLSearchParams(hashQuery).get("token") || ""
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
