import Link from "next/link";
import Logo from "@/components/Logo";

const PINK = "#FF3096";
const NAVY = "#152D5E";
const LIGHT_BG = "#F5F7FE";
const DARK_FOOTER = "#071434";
const TEXT_DARK = "#162D5E";
const TEXT_MUTED = "#4C618C";
const TEXT_LIGHT_MUTED = "#94A2BE";

const steps = [
  { num: "01", time: "30 SEC", title: "Create a free account", desc: "Sign up with your email. No credit card.", active: true },
  { num: "02", time: "~2 MIN", title: "Register Upwork API", desc: "It's free. Submit your app and wait for Upwork to approve it.", active: false },
  { num: "03", time: "~3 MIN", title: "Connect both apps", desc: "Paste your Upwork keys and your Notion integration token into the app.", active: false },
  { num: "04", time: "~2 MIN", title: "Set your filters", desc: "Choose category, rate range, experience level, etc.", active: false },
];

export default function Landing() {
  return (
    <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Navbar */}
      <nav style={{ background: "#F5F7FF" }}>
        <div className="flex items-center justify-between py-4" style={{ paddingLeft: "max(24px, calc(50% - 640px))", paddingRight: "max(24px, calc(50% - 640px))" }}>
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: NAVY }}>
              UpworkToNotion
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/auth/signin"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 500, fontSize: 16, color: TEXT_MUTED, opacity: 0.8 }}
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              style={{
                fontFamily: "'Roboto', sans-serif",
                fontWeight: 500,
                fontSize: 16,
                color: "white",
                background: PINK,
                border: `1px solid #EC4899`,
                borderRadius: 8,
                padding: "6px 16px",
                letterSpacing: "0.04em",
                display: "inline-block",
              }}
            >
              Start for Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: NAVY, minHeight: 647 }}
      >
        {/* Decorative blurred ellipses */}
        <div
          className="absolute pointer-events-none orb-pink"
          style={{
            right: -60,
            top: -200,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(240,0,184,0.55)",
            filter: "blur(140px)",
          }}
        />
        <div
          className="absolute pointer-events-none orb-blue"
          style={{
            left: -102,
            top: 240,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(59,130,246,0.45)",
            filter: "blur(140px)",
          }}
        />

        {/* Text — centered like a 1280px content area: padding = max(24px, 50% - 640px) */}
        <div className="hero-text-content relative z-10 flex flex-col justify-center">
          {/* heading + description: 24px gap (Figma Frame 14) */}
          <div className="hero-inner" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h1
                className="hero-heading"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(36px, 4.5vw, 64px)",
                  lineHeight: "120%",
                  color: "white",
                  margin: 0,
                }}
              >
                Your Upwork,
                <br />
                inside Notion.
              </h1>
              <span
                className="gradient-text-animated hero-heading"
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(36px, 4.5vw, 64px)",
                  lineHeight: "120%",
                  display: "block",
                }}
              >
                Automatically<span style={{ WebkitTextFillColor: "#fff", backgroundClip: "unset" }}>.</span>
              </span>
            </div>
            <p
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 300,
                fontSize: "clamp(16px, 1.5vw, 22px)",
                color: "white",
                opacity: 0.8,
                margin: 0,
                lineHeight: "150%",
              }}
            >
              Jobs sync to your feed, agents surface the best fits, proposals draft themselves — and your active contract hours log in real time.
            </p>
          </div>
          {/* button: 32px below description (Figma Frame 12) */}
          <Link
            href="/auth/signup"
            className="cta-btn"
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: "white",
              background: PINK,
              border: `1px solid #EC4899`,
              borderRadius: 8,
              padding: "14px 16px",
              letterSpacing: "0.04em",
              display: "inline-block",
              width: 180,
              textAlign: "center",
              marginTop: 32,
            }}
          >
            Start for Free →
          </Link>
        </div>

        {/* Illustration — absolutely positioned at x=574 within the centered 1280px content area */}
        {/* Formula: left = same centering offset (50% - 640px) + 574px = 50% - 66px, min 598px */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hidden lg:block absolute"
          src="/figma/hero-illustration.png"
          alt="App screenshot"
          style={{
            left: "max(598px, calc(50% - 66px))",
            top: 73,
            width: 765,
            height: 572,
            borderRadius: 8,
            boxShadow: "0px 4px 52.7px 0px rgba(87,32,121,0.74), 0px 4px 4px 0px rgba(0,0,0,0.25)",
            zIndex: 5,
          }}
        />
      </section>

      {/* How It Works */}
      <section style={{ background: LIGHT_BG }}>
        <div
          className="mx-auto flex flex-col items-center gap-16 px-6 xl:px-80 py-20"
          style={{ maxWidth: 1920 }}
        >
          {/* Header */}
          <div className="flex flex-col items-center gap-4">
            <span
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: "0.06em",
                color: "#EC4899",
                textTransform: "uppercase",
              }}
            >
              HOW IT WORKS
            </span>
            <div className="flex flex-col items-center gap-8">
              <h2
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(28px, 3vw, 40px)",
                  color: TEXT_DARK,
                  textAlign: "center",
                  margin: 0,
                }}
              >
                Set up in a few minutes.
                <br />
                Jobs + contract diaries live within 24 hours.
              </h2>
              <p
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 400,
                  fontSize: 20,
                  color: TEXT_MUTED,
                  opacity: 0.8,
                  textAlign: "center",
                  margin: 0,
                }}
              >
                Four steps. You&apos;re done in minutes — your job feed and work diary go live once Upwork approves your API access.
              </p>
            </div>
          </div>

          {/* Step cards row — badges sit above cards; connectors align with badge centers */}
          <div className="steps-row flex flex-col md:flex-row items-stretch justify-center w-full" style={{ gap: 8, paddingTop: 32 }}>
            {steps.map((step, i) => (
              <div key={step.num} style={{ display: "contents" }}>
                {/* Card column */}
                {/* Desktop card (hidden on mobile) */}
                <div className="hidden md:flex" style={{ flex: 1, minWidth: 0, flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 24, background: step.active ? PINK : "white", color: step.active ? "white" : TEXT_DARK, boxShadow: step.active ? "0px 8px 20px rgba(255,48,150,0.4)" : "0px 0px 0px 6px rgba(76,97,140,0.06), 0px 0px 10px rgba(76,97,140,0.2)", border: step.active ? "none" : "1.5px solid rgba(76,97,140,0.18)", position: "relative", zIndex: 2 }}>
                    {step.num}
                  </div>
                  <div style={{ flex: 1, marginTop: -30, width: "100%", background: "white", borderRadius: 16, paddingTop: 40, paddingBottom: 24, paddingLeft: 16, paddingRight: 16, boxShadow: "0px 0px 6px rgba(76,97,140,0.2)", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: 12, textTransform: "uppercase" as const, color: TEXT_LIGHT_MUTED, letterSpacing: "0.08em" }}>{step.time}</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: TEXT_DARK, textAlign: "center" as const }}>{step.title}</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: 14, color: TEXT_MUTED, opacity: 0.8, textAlign: "center" as const, lineHeight: "150%" }}>{step.desc}</span>
                  </div>
                </div>

                {/* Mobile card (hidden on desktop) */}
                <div className="flex md:hidden w-full items-center">
                  <div style={{ width: 60, height: 60, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 24, background: step.active ? PINK : "white", color: step.active ? "white" : TEXT_DARK, boxShadow: step.active ? "0px 8px 20px rgba(255,48,150,0.4)" : "0px 0px 0px 6px rgba(76,97,140,0.06), 0px 0px 10px rgba(76,97,140,0.2)", border: step.active ? "none" : "1.5px solid rgba(76,97,140,0.18)", position: "relative", zIndex: 2, marginRight: -30, flexShrink: 0 }}>
                    {step.num}
                  </div>
                  <div style={{ flex: 1, background: "white", borderRadius: 16, paddingTop: 16, paddingBottom: 16, paddingLeft: 46, paddingRight: 16, boxShadow: "0px 0px 6px rgba(76,97,140,0.2)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: 12, textTransform: "uppercase" as const, color: TEXT_LIGHT_MUTED, letterSpacing: "0.08em" }}>{step.time}</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: TEXT_DARK }}>{step.title}</span>
                    <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: 14, color: TEXT_MUTED, opacity: 0.8, lineHeight: "150%" }}>{step.desc}</span>
                  </div>
                </div>


                {/* Dashed connector — vertically centered within stretched column height */}
                {i < steps.length - 1 && (
                  <div className="hidden min-[1500px]:flex" style={{ flexShrink: 0, width: 56, alignItems: "center" }}>
                    <svg width="56" height="2">
                      <line x1="2" y1="1" x2="54" y2="1" stroke="#94A2BE" strokeWidth="1.5" strokeDasharray="4 4" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom CTA card */}
          <div
            className="flex flex-col sm:flex-row items-center justify-between gap-6 w-full"
            style={{ background: "white", borderRadius: 16, padding: "20px 32px", boxShadow: "0px 0px 4px rgba(76,97,140,0.3)" }}
          >
            <div className="flex items-center gap-4">
              {/* Green checkbox icon */}
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "#22C55E", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12l5 5L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex flex-col gap-1">
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: TEXT_DARK }}>
                  You&apos;re live.
                </span>
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 400, fontSize: 14, color: TEXT_MUTED, opacity: 0.8 }}>
                  Once your keys are in, your job feed and active contract work diaries sync 24/7 in the cloud — even when your laptop is closed.
                </span>
              </div>
            </div>
            <Link
              href="/auth/signup"
              className="cta-btn"
              style={{ fontFamily: "'Roboto', sans-serif", fontWeight: 700, fontSize: 18, color: "white", background: PINK, border: `1px solid #EC4899`, borderRadius: 8, padding: "14px 20px", letterSpacing: "0.04em", whiteSpace: "nowrap" as const, display: "inline-block" }}
            >
              Create free account →
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden" style={{ background: NAVY }}>
        {/* Decorative ellipses */}
        <div
          className="absolute pointer-events-none"
          style={{
            right: -60,
            top: -140,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(240,0,184,0.55)",
            filter: "blur(140px)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            left: -102,
            top: 140,
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "rgba(59,130,246,0.45)",
            filter: "blur(140px)",
          }}
        />
        <div
          className="relative mx-auto px-6 xl:px-80 py-24 flex justify-between items-center"
          style={{ maxWidth: 1920 }}
        >
          <div className="flex flex-col items-center gap-8 mx-auto text-center" style={{ maxWidth: 640 }}>
            <h2
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 800,
                fontSize: "clamp(36px, 5vw, 64px)",
                lineHeight: "120%",
                color: "white",
                margin: 0,
              }}
            >
              Everything Upwork.
              <br />
              <span style={{ color: PINK }}>Right inside Notion.</span>
            </h2>
            <p
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 300,
                fontSize: 22,
                color: "white",
                opacity: 0.8,
                margin: 0,
              }}
            >
              Your job feed. Your best fits. Your proposals. Your contract hours and earnings. All in one place — and free to start.
            </p>
            <Link
              href="/auth/signup"
              className="cta-btn"
              style={{
                fontFamily: "'Roboto', sans-serif",
                fontWeight: 700,
                fontSize: 18,
                color: "white",
                background: PINK,
                border: `1px solid #EC4899`,
                borderRadius: 8,
                padding: "14px 16px",
                letterSpacing: "0.04em",
                display: "inline-block",
                width: 180,
                textAlign: "center",
              }}
            >
              Start for Free →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="flex items-center justify-center"
        style={{ background: DARK_FOOTER, height: 85 }}
      >
        <span
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 300,
            fontSize: 18,
            color: "white",
          }}
        >
          🍌&nbsp;&nbsp;
          <span style={{ color: "#A9B4CB" }}>Big Banana Software. All rights reserved. © 2026</span>
        </span>
      </footer>
    </div>
  );
}
