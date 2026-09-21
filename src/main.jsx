import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import App from "./App";

const INK = "#0C1014", PANEL = "#141A21", PANEL2 = "#1A222B", LINE = "#232C36", TXT = "#D7DEE6", MUTE = "#79858F", AMBER = "#E8B14C";

// --- Magic-link login screen -------------------------------------------------
function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.brandRow}><span style={s.mark} /><span style={s.brand}>SLC1</span><span style={s.brandThin}>QA / QC</span></div>
        <div style={s.sub}>Salt Lake City · SLC1 · Commissioning</div>
        {sent ? (
          <div style={s.sentBox}>
            <div style={s.sentTitle}>Check your email</div>
            <div style={s.sentMsg}>We sent a sign-in link to <b>{email}</b>. Open it on this device to enter the dashboard.</div>
            <button style={s.linkBtn} onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <>
            <label style={s.label}>Work email</label>
            <input style={s.input} type="email" value={email} placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} autoFocus />
            {err && <div style={s.err}>{err}</div>}
            <button style={{ ...s.btn, opacity: busy ? 0.6 : 1 }} onClick={send} disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
            <div style={s.hint}>No password. We email you a one-tap link.</div>
          </>
        )}
      </div>
    </div>
  );
}

function Gate() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div style={s.wrap}><div style={{ color: "#5BB98C", fontFamily: "monospace" }}>loading…</div></div>;
  if (!session) return <Login />;
  return <App />;
}

const s = {
  wrap: { minHeight: "100vh", background: INK, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif", padding: 20 },
  card: { width: "min(400px,100%)", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: "34px 30px" },
  brandRow: { display: "flex", alignItems: "center", gap: 9 },
  mark: { width: 12, height: 12, background: AMBER, borderRadius: 2, boxShadow: `0 0 12px ${AMBER}88` },
  brand: { fontSize: 22, fontWeight: 800, letterSpacing: "0.14em", color: "#F2F5F8" },
  brandThin: { fontSize: 22, fontWeight: 300, letterSpacing: "0.14em", color: MUTE },
  sub: { fontFamily: "monospace", fontSize: 11, color: MUTE, marginTop: 8, marginLeft: 21, marginBottom: 28 },
  label: { fontFamily: "monospace", fontSize: 11, color: MUTE, textTransform: "uppercase", display: "block", marginBottom: 8 },
  input: { width: "100%", background: PANEL2, border: `1px solid ${LINE}`, color: TXT, borderRadius: 8, padding: "12px 13px", fontSize: 14.5, fontFamily: "inherit", boxSizing: "border-box", outline: "none" },
  btn: { width: "100%", marginTop: 16, background: `${AMBER}1A`, border: `1px solid ${AMBER}`, color: AMBER, padding: "12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" },
  hint: { fontFamily: "monospace", fontSize: 10.5, color: MUTE, marginTop: 14, textAlign: "center" },
  err: { color: "#D96A6A", fontSize: 12.5, marginTop: 10 },
  sentBox: { textAlign: "center", padding: "10px 0" },
  sentTitle: { fontSize: 18, fontWeight: 700, color: "#F2F5F8", marginBottom: 10 },
  sentMsg: { fontSize: 13.5, color: TXT, lineHeight: 1.5 },
  linkBtn: { marginTop: 18, background: "none", border: "none", color: AMBER, cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", textDecoration: "underline" },
};

createRoot(document.getElementById("root")).render(<Gate />);
