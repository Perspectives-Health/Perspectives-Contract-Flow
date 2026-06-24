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
    monthlyPrice?: string | null
    priceTerms?: string | null
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

const demoContext: SigningContext = {
  documentId: "demo-document",
  client: {
    slug: "summit-therapy",
    displayName: "Summit Therapy Group",
    logoUrl: null,
    primaryColor: null,
    accentColor: null,
    supportEmail: null,
  },
  signer: {
    displayName: "Jordan Lee",
    emailHint: "j***@summittherapy.example",
  },
  document: {
    title: "Summit Therapy Group Clinic Services Agreement",
    description: "Please review and sign this clinic services agreement.",
    monthlyPrice: "$2,500",
    priceTerms:
      "Up to 250 patients/month. Price locked through 250 patients/month — no increases as you grow within this tier.",
  },
  status: "sent",
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
}

const contractSections = [
  {
    icon: "list",
    title: "Initial Comprehensive Audit",
    tag: "Included Free",
    intro:
      "A full review of your charts, delivered before anything else starts, so you can see exactly what problems may be costing you money.",
    bullets: [
      "We surface documentation issues that put your revenue and compliance at risk.",
      "You get specific findings and what to do about them.",
      "Most clinics find problems they did not know existed.",
      "Yours to keep. This kind of analysis normally costs thousands from a billing consultant.",
    ],
  },
  {
    icon: "clock",
    title: "Perspectives AI",
    tag: "30 Days Free",
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
    tag: "No Questions Asked",
    intro: "We'll take on the risk.",
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
  const isDemoMode = useMemo(() => isLocalDemoMode(), [])
  const token = useMemo(() => readSigningToken(), [])

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      if (isDemoMode) {
        setContext(demoContext)
        setIsLoading(false)
        return
      }

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
  }, [isDemoMode, token])

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
      if (isDemoMode) {
        setSignUrl("demo")
        return
      }

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

    const maxScrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight
    const firstFeatureSection = scrollContainer.querySelector<HTMLElement>(
      ".contract-section-list .contract-section:nth-of-type(2)",
    )
    const firstStopTop = firstFeatureSection
      ? Math.max(firstFeatureSection.offsetTop - scrollContainer.clientHeight * 0.18, 0)
      : scrollContainer.clientHeight * 0.72
    const nextScrollTop = scrollContainer.scrollTop < firstStopTop - 24 ? firstStopTop : maxScrollTop

    scrollContainer.scrollTo({
      top: nextScrollTop,
      behavior: "smooth",
    })

    setIsContractAtBottom(nextScrollTop >= maxScrollTop - 4)
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
          {isDemoMode ? (
            <DemoSigningFrame />
          ) : (
            <iframe className="signing-frame" src={signUrl} title="Secure document signing" />
          )}
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
            <div className="welcome-letter">
              <p>
                We built Perspectives to help clinics protect their revenue, save time for their clinicians, and
                deliver only the best care for their patients.
              </p>
              <p>
                Thank you for joining us on this journey. We look forward to entering this partnership with the goal of
                changing the behavioral health space, little by little.
              </p>
              <p>With gratitude,</p>
              <div className="welcome-signature" aria-label="Eshan Dosani, CEO">
                <span>Eshan Dosani</span>
                <small>CEO, Perspectives Health</small>
              </div>
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
          <NavIcon type="left" />
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
          {isStarting ? (
            <span className="nav-label">Opening</span>
          ) : step === 3 && !isContractAtBottom ? (
            <NavIcon type="down" />
          ) : step === 3 ? (
            <>
              <span className="nav-label">Sign</span>
              <NavIcon type="right" small />
            </>
          ) : (
            <NavIcon type="right" />
          )}
        </button>
      </nav>
    </main>
  )
}

function CompletePage() {
  return (
    <main className="complete-shell">
      <section className="complete-paper">
        <PerspectivesLogo />
        <div className="complete-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1>Complete!</h1>
        <p>
          You will soon receive a copy with our CEO&apos;s signature, and the Perspectives Health team will follow up with
          next steps. Looking forward to a new chapter.
        </p>
      </section>
    </main>
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
        <h2>{context.client.displayName}</h2>
        <span>{context.document.title}</span>
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
        <CommercialTerms context={context} />
      </div>
    </ContractPage>
  )
}

function CommercialTerms({ context }: { context: SigningContext }) {
  const monthlyPrice = context.document.monthlyPrice
  const priceTerms = context.document.priceTerms

  if (!monthlyPrice && !priceTerms) {
    return null
  }

  return (
    <section className="contract-section commercial-terms">
      <OfferIcon type="price" />
      <div>
        <div className="section-heading">
          <h3>Monthly Pricing</h3>
          {monthlyPrice ? <ContractTag>{monthlyPrice}/month</ContractTag> : null}
        </div>
        {priceTerms ? <p>{priceTerms}</p> : null}
        <div className="commercial-notes">
          <span>Cancel any time</span>
          <span>Unlimited standards and chart audits, 24hr customer support.</span>
        </div>
      </div>
    </section>
  )
}

function ContractTermsPage({ context }: { context: SigningContext }) {
  return (
    <ContractPage className="terms-page">
      <PerspectivesLogo />
      <div className="terms-callout">
        <p>
          By signing this order form, you agree to our Terms of Service and Business Associate Agreement,
          published at perspectiveshealth.ai/terms and perspectiveshealth.ai/baa respectively.
        </p>
      </div>

      <div className="signature-preview">
        <p>Customer</p>
        <SignatureLine label="Printed name" value={context.signer.displayName} />
        <SignatureLine label="Clinic" value={context.client.displayName} />
        <SignatureLine label="Signature" value="Completed in secure BoldSign ceremony" wide />
      </div>

      <ContractFooter />
    </ContractPage>
  )
}

function ContractPage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={["contract-page", className].filter(Boolean).join(" ")}>{children}</article>
}

function ContractTag({ children }: { children: ReactNode }) {
  return <span className="contract-tag">{children}</span>
}

function OfferIcon({ type }: { type: string }) {
  return (
    <div className={`offer-icon offer-icon-${type}`} aria-hidden="true">
      {type === "clock" ? (
        <svg className="perspectives-mark-icon" viewBox="0 0 143 160">
          <path d="M16.8091 144.916H9.61707C4.31112 144.916 0 141.06 0 136.314V23.8068C0 19.061 4.31112 15.2051 9.61707 15.2051H16.8091C22.1151 15.2051 26.4261 19.061 26.4261 23.8068V136.314C26.4261 141.06 22.1151 144.916 16.8091 144.916Z" />
          <path d="M67.0232 146.316L44.9496 150.338C39.0012 151.414 33.4258 147.354 33.4258 141.922V18.2547C33.4258 12.8231 39.0012 8.74468 44.9496 9.83843L67.0232 13.8427C71.5001 14.6583 74.7128 18.1805 74.7128 22.2774V137.918C74.7128 141.996 71.5001 145.518 67.0232 146.334" />
          <path d="M136.285 146.902L94.3974 159.545C88.1588 161.417 81.7129 157.283 81.7129 151.406V8.60773C81.7129 2.71263 88.2002 -1.43986 94.4389 0.469558L136.327 13.2608C140.223 14.4472 142.835 17.71 142.835 21.399V138.782C142.835 142.471 140.203 145.752 136.285 146.92" />
        </svg>
      ) : type === "check" ? (
        <svg viewBox="0 0 24 24">
          <path d="M12 3.5l7 3v5.2c0 4.3-2.7 7.2-7 8.8-4.3-1.6-7-4.5-7-8.8V6.5l7-3z" />
          <path d="M8.6 12.1l2.2 2.2 4.6-4.7" />
        </svg>
      ) : type === "price" ? (
        <svg viewBox="0 0 24 24">
          <path d="M4.8 5.8h7.4l7 7-6.4 6.4-8-8V5.8z" />
          <path d="M8 8.7h.01" />
          <path d="M10.3 12h5.2" />
          <path d="M10.3 14.8h3.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24">
          <path d="M7 4.5h7.5L18 8v11.5H7V4.5z" />
          <path d="M14.5 4.5V8H18" />
          <path d="M9.8 11h5.4" />
          <path d="M9.8 14h4.4" />
          <path d="M9.8 17h2.8" />
        </svg>
      )}
    </div>
  )
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

function NavIcon({ small = false, type }: { small?: boolean; type: "left" | "right" | "down" }) {
  const className = small ? "nav-icon nav-icon-small" : "nav-icon"

  if (type === "left") {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    )
  }

  if (type === "down") {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    )
  }

  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function DemoSigningFrame() {
  return (
    <div className="signing-frame signing-frame-demo">
      <div>
        <PerspectivesLogo />
        <p>Embedded signing preview</p>
        <h2>BoldSign ceremony loads here</h2>
        <span>This demo frame is local-only and does not create or sign a document.</span>
      </div>
    </div>
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

function isLocalDemoMode() {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "1"
}

export default App
