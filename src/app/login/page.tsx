"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightCircle,
  AtSign,
  BadgeCheck,
  Database,
  FileText,
  Loader2,
  LockKeyhole,
  MapPin,
  MessageSquareText,
  Network,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Emblem } from "@/components/Emblem";
import {
  beginCatalystSignIn,
  getClientUser,
  mountCatalystSignIn,
  replaceAppRoute,
  registerCatalystOfficer,
} from "@/lib/auth-client";
import statistics from "@/data/login-statistics.json";
import styles from "./login.module.css";
import { LoginNetwork } from "./LoginNetwork";

const BASE =
  process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true" ? "/app" : "";
const CAPABILITIES = [
  {
    icon: MessageSquareText,
    label: "Natural Language",
    description:
      "Query cases, evidence and criminal records in English and Kannada",
    tone: "blue",
  },
  {
    icon: Network,
    label: "Criminal Networks",
    description: "Discover hidden relationships and cross-district links",
    tone: "teal",
  },
  {
    icon: FileText,
    label: "Explainable AI",
    description: "Cited sources, transparent insights and auditable results",
    tone: "violet",
  },
];
const CITIES = [
  { name: "Belagavi", x: 47.6, y: 25.8 },
  { name: "Kalaburagi", x: 57.6, y: 21.8 },
  { name: "Dharwad", x: 42.7, y: 37.1 },
  { name: "Bengaluru", x: 57.9, y: 57.7 },
  { name: "Mysuru", x: 46.8, y: 65.5 },
  { name: "Mangaluru", x: 44.6, y: 73.6 },
];
type AuthView = "checking" | "embedded" | "redirect" | "error";

export default function LoginPage() {
  const [authView, setAuthView] = useState<AuthView>("checking");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [authMode, setAuthMode] = useState<"providers" | "email" | "signup">(
    "providers",
  );
  const [registering, setRegistering] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState("");
  const [email, setEmail] = useState("");

  async function mountProvider(
    mode: "providers" | "email" = authMode === "email" ? "email" : "providers",
  ) {
    setAuthView("checking");
    setError("");
    try {
      const mounted = await mountCatalystSignIn("netra-catalyst-signin", mode);
      setAuthView(mounted ? "embedded" : "redirect");
    } catch {
      setAuthView("error");
      setError(
        "Secure sign-in could not be loaded. Please continue using the hosted sign-in.",
      );
    }
  }

  function selectMode(mode: "providers" | "email" | "signup") {
    setAuthMode(mode);
    setError("");
    if (mode !== "signup") void mountProvider(mode);
  }

  async function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMode("email");
    setAuthView("checking");
    setError("");
    try {
      const mounted = await mountCatalystSignIn(
        "netra-catalyst-signin",
        "email",
      );
      if (!mounted)
        throw new Error(
          "Catalyst sign-in is unavailable. Please retry or use secure hosted sign-in.",
        );
      const frame = document.querySelector<HTMLIFrameElement>(
        "#netra-catalyst-signin iframe",
      );
      const input = frame?.contentDocument?.getElementById(
        "login_id",
      ) as HTMLInputElement | null;
      const next = frame?.contentDocument?.getElementById(
        "nextbtn",
      ) as HTMLButtonElement | null;
      if (!input || !next)
        throw new Error("The email sign-in form did not load. Please retry.");
      input.value = email.trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      next.click();
      setAuthView("embedded");
    } catch (error) {
      setAuthView("error");
      setError(
        error instanceof Error
          ? error.message
          : "Email sign-in could not be started.",
      );
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = String(values.get("email") || "");
    setRegistering(true);
    setError("");
    try {
      await registerCatalystOfficer(
        String(values.get("firstName") || ""),
        String(values.get("lastName") || ""),
        email,
      );
      setRegistrationEmail(email);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Account creation failed. Please try again.",
      );
    } finally {
      setRegistering(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getClientUser()
      .then(async (user) => {
        if (!active) return;
        if (user) {
          replaceAppRoute("/dashboard");
          return;
        }
        try {
          const mounted = await mountCatalystSignIn("netra-catalyst-signin");
          if (active) setAuthView(mounted ? "embedded" : "redirect");
        } catch {
          if (active) {
            setAuthView("error");
            setError(
              "Secure sign-in could not be loaded. Please continue using the hosted sign-in.",
            );
          }
        }
      })
      .catch(() => {
        if (active) {
          setAuthView("error");
          setError("Your session could not be verified. Please sign in again.");
        }
      });
    const controller = new AbortController();
    if (window.location.hostname.endsWith(".catalystserverless.in")) {
      void fetch("/server/ai_quickml/", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ mode: "ping" }),
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (active) setOnline(result?.ok === true);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return (
    <main className={styles.page} data-theme="daylight">
      <div className={styles.scene} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE}/login/intelligence-backdrop.webp`}
          alt=""
          fetchPriority="high"
        />
        <LoginNetwork />
        {CITIES.map((city) => (
          <span
            key={city.name}
            className={city.name === "Bengaluru" ? styles.capital : styles.city}
            style={{ left: `${city.x}%`, top: `${city.y}%` }}
          >
            {city.name}
          </span>
        ))}
      </div>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Emblem size={68} glass={false} />
          <div>
            <strong>KARNATAKA STATE POLICE</strong>
            <span>Crime Intelligence</span>
          </div>
        </div>
        <div className={styles.restriction}>
          <span>
            <LockKeyhole size={16} /> RESTRICTED
          </span>
          <b>NETRA v1.1</b>
        </div>
      </header>
      <div className={styles.content}>
        <section className={styles.introduction}>
          <p className={styles.eyebrow}>
            NETRA | INTELLIGENCE • ANALYSIS • ACTION
          </p>
          <h1>
            Advanced Criminal
            <br className={styles.titleBreak} /> Intelligence Platform
          </h1>
          <p className={styles.tagline}>
            One unified intelligence workspace for a safer Karnataka.
          </p>
          <p className={styles.description}>
            Investigate FIRs, uncover criminal networks, analyse evidence,
            <br className={styles.desktopBreak} /> and leverage AI to accelerate
            investigations across the state.
          </p>
          <div className={styles.capabilities}>
            {CAPABILITIES.map((item) => (
              <article
                key={item.label}
                className={`${styles.capability} ${styles[item.tone]}`}
              >
                <span className={styles.featureIcon}>
                  <item.icon size={25} />
                </span>
                <h2>{item.label}</h2>
                <p>{item.description}</p>
                <ArrowRightCircle
                  className={styles.featureArrow}
                  size={22}
                  aria-hidden="true"
                />
              </article>
            ))}
          </div>
          <div
            className={styles.statistics}
            aria-label="Imported database statistics"
          >
            {[
              {
                icon: Database,
                value: statistics.firs,
                label: "FIR Records",
                sub: "Integrated",
              },
              {
                icon: Users,
                value: statistics.accused,
                label: "Accused Profiles",
                sub: "Linked",
              },
              {
                icon: MapPin,
                value: statistics.districts,
                label: "Districts with",
                sub: "FIR Records",
              },
              {
                icon: ShieldCheck,
                value: statistics.stations,
                label: "Police Stations",
                sub: "Linked",
              },
            ].map((stat) => (
              <div key={stat.label} className={styles.stat}>
                <stat.icon size={30} />
                <div>
                  <strong>{stat.value.toLocaleString("en-IN")}</strong>
                  <span>
                    {stat.label}
                    <br />
                    {stat.sub}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section
          className={styles.gateway}
          aria-labelledby="officer-access-title"
        >
          <div className={styles.gatewayTitle}>
            <Emblem size={100} glass={false} />
            <p>KARNATAKA STATE POLICE</p>
            <h2 id="officer-access-title">Secure Officer Access</h2>
            <span>Sign in to NETRA Crime Intelligence Gateway</span>
          </div>
          <div className={styles.verification}>
            <ShieldCheck size={19} />
            <strong>Catalyst verified</strong>
            <i />
            <span>Federated identity enabled</span>
            <b className={online ? styles.online : ""}>
              <span />
              {online ? "Online" : "Secure"}
            </b>
          </div>
          {authMode === "providers" && (
            <>
              <form className={styles.emailEntry} onSubmit={continueWithEmail}>
                <label htmlFor="officer-email">OFFICIAL EMAIL ADDRESS</label>
                <div className={styles.emailInput}>
                  <AtSign size={22} />
                  <input
                    id="officer-email"
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="name@ksp.gov.in"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    maxLength={254}
                  />
                </div>
                <button type="submit" disabled={authView === "checking"}>
                  Continue <ArrowRight size={19} />
                </button>
              </form>
              <div className={styles.divider}>
                <span />
                Or sign in with
                <span />
              </div>
            </>
          )}
          {authMode === "email" && (
            <div className={styles.emailBack}>
              <button
                type="button"
                disabled={authView === "checking"}
                onClick={() => selectMode("providers")}
              >
                ← Use another sign-in method
              </button>
            </div>
          )}
          <div
            id={authMode === "providers" ? "sso-panel" : "email-panel"}
            aria-label={
              authMode === "providers" ? "Identity providers" : "Email sign-in"
            }
            className={`${styles.providers} ${authMode === "email" ? styles.manualProvider : ""}`}
            style={{ display: authMode === "signup" ? "none" : undefined }}
          >
            <div
              id="netra-catalyst-signin"
              aria-label="Catalyst identity providers"
              className={`catalyst-signin-frame ${authView === "checking" || authView === "embedded" ? "is-mounted" : ""}`}
            />
            {authView === "checking" && (
              <div className={styles.checking}>
                <Loader2 size={18} className="animate-spin" /> Connecting secure
                sign-in…
              </div>
            )}
            {(authView === "redirect" || authView === "error") && (
              <button
                className={styles.hostedSignIn}
                onClick={beginCatalystSignIn}
                type="button"
              >
                <LockKeyhole size={18} /> Open secure sign-in{" "}
                <ArrowRight size={18} />
              </button>
            )}
          </div>
          {authMode === "signup" &&
            (registrationEmail ? (
              <div className={styles.registrationSuccess} role="status">
                <BadgeCheck size={28} />
                <h3>Check your email</h3>
                <p>
                  Catalyst has sent account verification and password setup
                  instructions to <strong>{registrationEmail}</strong>.
                </p>
                <button type="button" onClick={() => selectMode("providers")}>
                  Return to sign-in <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <form
                className={styles.registrationForm}
                onSubmit={createAccount}
              >
                <h3>Create your account</h3>
                <div className={styles.nameFields}>
                  <label>
                    First name
                    <input
                      name="firstName"
                      autoComplete="given-name"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Last name
                    <input
                      name="lastName"
                      autoComplete="family-name"
                      required
                      maxLength={100}
                    />
                  </label>
                </div>
                <label>
                  Email address
                  <input
                    type="email"
                    name="email"
                    defaultValue={email}
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
                <p>
                  Verify your email with Catalyst to set your password and
                  activate your account.
                </p>
                <button type="submit" disabled={registering}>
                  {registering ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                  {registering ? "Creating account…" : "Create account"}
                </button>
              </form>
            ))}
          {error && (
            <div role="alert" className={styles.error}>
              <AlertTriangle size={17} />
              <span>
                {error}{" "}
                {authMode !== "signup" && (
                  <button onClick={() => void mountProvider()} type="button">
                    Retry
                  </button>
                )}
              </span>
            </div>
          )}
          <div className={styles.accountLinks}>
            {authMode === "signup" ? (
              <button
                type="button"
                disabled={registering}
                onClick={() => selectMode("providers")}
              >
                Already have an account? Sign in
              </button>
            ) : (
              <>
                <span>New to NETRA?</span>
                <button
                  type="button"
                  disabled={authView === "checking"}
                  onClick={() => selectMode("signup")}
                >
                  Create an account <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
          <div className={styles.security}>
            <LockKeyhole size={18} />
            <span>SSO protected</span>
            <i />
            <span>Role controlled</span>
            <i />
            <span>Audit logged</span>
          </div>
        </section>
      </div>
      <footer className={styles.footer}>
        <span className={styles.connection}>
          <span className={online ? styles.connected : ""} />
          {online ? "Cloud Scale Connected" : "Catalyst Authentication"}
          <i />
          <small style={{ font: "inherit" }}>{statistics.source}</small>
        </span>
        <span className={styles.authorized}>
          <BadgeCheck size={20} />
          Authorized personnel only. Access and intelligence operations are
          monitored and audited.
        </span>
      </footer>
    </main>
  );
}
