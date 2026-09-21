import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";

// ============================================================================
// SEED DATA
// ============================================================================
const SEED = {
  week_start: "2026-08-17",
  week_labels: ["Wk 08/17","Wk 08/24","Wk 08/31","Wk 09/07","Wk 09/14","Wk 09/21","Wk 09/28","Wk 10/05","Wk 10/12","Wk 10/19","Wk 10/26","Wk 11/02","Wk 11/09","Wk 11/16","Wk 11/23","Wk 11/30","Wk 12/07","Wk 12/14","Wk 12/21","Wk 12/28"],
  people: [],
  skills: {},
  tasks: [],
  archivedWeeks: [],
  trainingFolders: [
    { id: "tf1", name: "Safety", links: [
      { id: "tl1", label: "LOTO / Energy Control", url: "" },
      { id: "tl2", label: "Arc Flash / NFPA 70E", url: "" },
    ] },
    { id: "tf2", name: "QA / QC Procedures", links: [] },
    { id: "tf3", name: "Onboarding", links: [] },
  ],
  contacts: [],
  suggestions: [],
  // Editable skill categories (add/rename/delete in the Skills tab). Starter set for QA/QC.
  skillGroups: [
    { id: "g1", group: "Inspection", accent: "#5BB98C", skills: [
      { id: "s1", name: "Document Control" }, { id: "s2", name: "Field Inspection" }, { id: "s3", name: "Punch List" },
    ] },
    { id: "g2", group: "Turnover", accent: "#6AA4D9", skills: [
      { id: "s4", name: "ITR / Checklists" }, { id: "s5", name: "Turnover Packages" },
    ] },
    { id: "g3", group: "Witnessing", accent: "#E8B14C", skills: [
      { id: "s6", name: "L2 Verification" }, { id: "s7", name: "L4 Witnessing" },
    ] },
  ],
  // DCR review tracker — L2 & L4, each: team updated + ready for mgmt review. Add/remove freely.
  dcrs: [
    { id: "dcr1", name: "DCR 1", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
    { id: "dcr2", name: "DCR 2", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
    { id: "dcr3", name: "DCR 3", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
    { id: "dcr4", name: "DCR 4", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
    { id: "dcr5", name: "DCR 5", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
    { id: "dcr6", name: "DCR 6", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false },
  ],
  links: [
    { id: "l1", label: "CxAlloy TQ", url: "" },
    { id: "l2", label: "Teams — QA/QC Channel", url: "" },
    { id: "l3", label: "Project SharePoint", url: "" },
  ],
};

const PROF = ["—", "Familiar", "Proficient", "Lead / SME"];

const STATUS = {
  ONSITE:   { key: "ONSITE",   label: "Onsite",     color: "#5BB98C" },
  HOME:     { key: "HOME",     label: "Home",       color: "#E0574F" },
  PTO:      { key: "PTO",      label: "PTO",        color: "#E8B14C" },
  ONBOARD:  { key: "ONBOARD",  label: "Onboarding", color: "#9B7FD4" },
  MILITARY: { key: "MILITARY", label: "Military",   color: "#C77DBB" },
  OTHER:    { key: "OTHER",    label: "Other Site", color: "#D98A4C" },
  UNKNOWN:  { key: "UNKNOWN",  label: "No entry",   color: "#39414B" },
};
const STATUS_ORDER = ["ONSITE","HOME","PTO","ONBOARD","MILITARY","OTHER","UNKNOWN"];

// A week cell is normally a status string. For per-day detail it becomes { days: {Mon:"", Tue:"PTO", ...} }.
function isSplit(cell) { return cell && typeof cell === "object" && cell.days; }
function weekStatus(cell) {
  if (!isSplit(cell)) return normalize(cell);
  const counts = {};
  DAYS.forEach((d) => { const k = normalize(cell.days[d] || "").key; counts[k] = (counts[k] || 0) + 1; });
  let best = "ONSITE", bestN = -1;
  Object.keys(counts).forEach((k) => { if (counts[k] > bestN) { best = k; bestN = counts[k]; } });
  return STATUS[best];
}

function normalize(cell) {
  if (cell == null) return STATUS.UNKNOWN;
  const t = String(cell).trim();
  if (t === "") return STATUS.ONSITE;
  const low = t.toLowerCase();
  if (low.includes("home")) return STATUS.HOME;
  if (low.includes("pto")) return STATUS.PTO;
  if (low.includes("onboard")) return STATUS.ONBOARD;
  if (low.includes("military")) return STATUS.MILITARY;
  if (low.includes("other")) return STATUS.OTHER;
  if (low === "t") return STATUS.ONSITE;
  return STATUS.ONSITE;
}

const LEAD_ACCENT = "#E8B14C";
const TEAM_ACCENT = "#5BB98C";
const LOANER_ACCENT = "#D98A4C";

function groupPeople(people) {
  const core = people.filter((p) => !p.loaner);
  const leads = core.filter((p) => p.lead);
  const team = core.filter((p) => !p.lead);
  const groups = [];
  if (leads.length) groups.push({ key: "Leads", accent: LEAD_ACCENT, members: leads });
  if (team.length) groups.push({ key: "Team", accent: TEAM_ACCENT, members: team });
  return groups;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function prettyDate() {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
// --- Year-safe week math: weeks are anchored to a base Monday and addressed by index ---
const WEEK_BUFFER = 8;      // always keep at least this many weeks ahead of the current week
const ROTATION_CYCLE = 3;   // new future weeks repeat each person's status from this many weeks back
function parseISO(s) { const [y, m, d] = (s || "2026-06-29").split("-").map(Number); const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0); return dt; }
function mondayOf(startISO, i) { const d = parseISO(startISO); d.setDate(d.getDate() + i * 7); return d; }
function fmtMD(date) { return `${date.getMonth() + 1}/${date.getDate()}`; }
function fmtWeekLabel(date) { return `Wk ${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`; }
function thisMonday() { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); d.setHours(0, 0, 0, 0); return d; }
function isoOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function freshSeed() { const st = structuredClone(SEED); const mon = thisMonday(); st.week_start = isoOf(mon); st.week_labels = Array.from({ length: 16 }, (_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i * 7); return fmtWeekLabel(d); }); return st; }

// Index of the current week = latest week whose Monday is on or before today.
function currentWeekIdx(startISO, count) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let best = 0;
  for (let i = 0; i < count; i++) { if (mondayOf(startISO, i) <= today) best = i; else break; }
  return best;
}
function weekDatesByIndex(startISO, idx) {
  const monday = mondayOf(startISO, idx); const out = {};
  DAYS.forEach((d, i) => { const dt = new Date(monday); dt.setDate(monday.getDate() + i); out[d] = fmtMD(dt); });
  return out;
}
// Append one future week: new label + each person's status copied from ROTATION_CYCLE weeks back.
function appendOneWeek(n) {
  const newIdx = n.week_labels.length;
  n.week_labels.push(fmtWeekLabel(mondayOf(n.week_start, newIdx)));
  n.people.forEach((p) => { const src = p.weeks[newIdx - ROTATION_CYCLE]; p.weeks.push(src !== undefined ? (src && typeof src === "object" ? JSON.parse(JSON.stringify(src)) : src) : ""); });
}
// Keep at least WEEK_BUFFER weeks ahead of the current week.
function ensureBuffer(n) {
  let guard = 0;
  while (guard++ < 520) {
    const cur = currentWeekIdx(n.week_start, n.week_labels.length);
    if (n.week_labels.length - 1 - cur >= WEEK_BUFFER) break;
    appendOneWeek(n);
  }
}

// ============================================================================
// PERSISTENCE
// ============================================================================
const STORE_KEY = "slc1_qaqc_state_v1";
async function loadState() {
  const { data, error } = await supabase.from("app_state").select("data").eq("id", STORE_KEY).maybeSingle();
  if (error) { console.error("load failed", error); return null; }
  return data ? data.data : null;
}
async function saveState(s) {
  const { error } = await supabase.from("app_state").upsert({ id: STORE_KEY, data: s, updated_at: new Date().toISOString() });
  if (error) console.error("save failed", error);
}
function migrate(s) {
  // ensure new fields exist if loading older saved state
  const base = structuredClone(SEED);
  const firstWeek = (s.week_labels || base.week_labels)[0];
  const tasks = (s.tasks || []).map((t) => ({
    id: t.id || "tk" + Math.random().toString(36).slice(2),
    week: t.week || firstWeek,
    day: t.day || "Mon",
    building: t.building || "DC2",
    task: t.task || t.title || "",
    testing: t.testing || "",
    support: t.support || "",
    equipment: t.equipment || "",
    status: t.status || "Scheduled",
    assignees: t.assignees || [],
  }));
  // Convert old flat training list into a folder, or keep existing folders.
  let trainingFolders = s.trainingFolders;
  if (!trainingFolders) {
    if (Array.isArray(s.training) && s.training.length) {
      trainingFolders = [{ id: "tf_legacy", name: "Training", links: s.training }];
    } else {
      trainingFolders = base.trainingFolders;
    }
  }
  return { ...base, ...s,
    week_start: s.week_start || base.week_start,
    people: (s.people || base.people).map((p) => { const { building, ...rest } = p; return rest; }),
    tasks, links: s.links || base.links,
    trainingFolders,
    contacts: s.contacts || base.contacts,
    archivedWeeks: s.archivedWeeks || [],
    skillGroups: s.skillGroups || base.skillGroups,
    dcrs: s.dcrs || base.dcrs,
    skills: s.skills || {}, suggestions: s.suggestions || [] };
}

// ============================================================================
// APP
// ============================================================================
export default function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [weekIdx, setWeekIdx] = useState(0);
  const [view, setView] = useState("schedule");
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [me, setMe] = useState("");
  const remoteApplyRef = useRef(false);
  const lastLocalEditRef = useRef(0);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe((data && data.user && data.user.email) || "")); }, []);

  useEffect(() => { (async () => {
    const s = await loadState();
    const st = s ? migrate(s) : freshSeed();
    ensureBuffer(st);  // auto-extend so there are always weeks ahead of today
    setState(st);
    setWeekIdx(currentWeekIdx(st.week_start, st.week_labels.length));  // roll over to current week on open
    setLoaded(true);
  })(); }, []);

  // Live sync: when anyone saves, other open sessions receive the new document.
  useEffect(() => {
    const chan = supabase.channel("app_state_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `id=eq.${STORE_KEY}` }, (payload) => {
        const incoming = payload.new && payload.new.data;
        if (!incoming) return;
        // Ignore updates that land while you're actively editing — they're almost
        // always your own save echoing back, and applying them would wipe your typing.
        if (Date.now() - lastLocalEditRef.current < 3000) return;
        remoteApplyRef.current = true; setState(incoming);
      })
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, []);

  useEffect(() => {
    if (!loaded || !state) return;
    if (remoteApplyRef.current) { remoteApplyRef.current = false; return; }  // don't echo a remote update back
    setSaving(true);
    const id = setTimeout(async () => { await saveState(state); setSaving(false); }, 500);
    return () => clearTimeout(id);
  }, [state, loaded]);

  const weeks = state?.week_labels ?? [];
  const people = state?.people ?? [];
  const curWeek = state ? currentWeekIdx(state.week_start, weeks.length) : 0;
  const startIdx = showPast ? 0 : curWeek;
  const loaners = people.filter((p) => p.loaner);
  const activeLoaners = loaners.filter((p) => weekStatus(p.weeks[weekIdx]).key === "ONSITE");

  const up = (fn) => { lastLocalEditRef.current = Date.now(); setState((prev) => { const next = structuredClone(prev); fn(next); return next; }); };

  const setCell = (name, wIdx, key) => up((n) => { const p = n.people.find((x) => x.name === name); if (p) p.weeks[wIdx] = key === "ONSITE" ? "" : STATUS[key].label; });
  const splitWeek = (name, wIdx) => up((n) => { const p = n.people.find((x) => x.name === name); if (!p) return; const cur = p.weeks[wIdx]; if (isSplit(cur)) return; const v = typeof cur === "string" ? cur : ""; p.weeks[wIdx] = { days: Object.fromEntries(DAYS.map((d) => [d, v])) }; });
  const unsplitWeek = (name, wIdx) => up((n) => { const p = n.people.find((x) => x.name === name); if (!p) return; p.weeks[wIdx] = weekStatus(p.weeks[wIdx]).key === "ONSITE" ? "" : STATUS[weekStatus(p.weeks[wIdx]).key].label; });
  const setDayCell = (name, wIdx, day, key) => up((n) => { const p = n.people.find((x) => x.name === name); if (!p) return; if (!isSplit(p.weeks[wIdx])) { const v = typeof p.weeks[wIdx] === "string" ? p.weeks[wIdx] : ""; p.weeks[wIdx] = { days: Object.fromEntries(DAYS.map((d) => [d, v])) }; } p.weeks[wIdx].days[day] = key === "ONSITE" ? "" : STATUS[key].label; });
  const setSkill = (name, sk, lvl) => up((n) => { n.skills[name] = n.skills[name] || {}; n.skills[name][sk] = lvl; });
  const addSkillGroup = () => up((n) => n.skillGroups.push({ id: "g" + Date.now(), group: "New group", accent: "#5BB98C", skills: [] }));
  const renameSkillGroup = (gid, name) => up((n) => { const g = n.skillGroups.find((x) => x.id === gid); if (g) g.group = name; });
  const delSkillGroup = (gid) => up((n) => { n.skillGroups = n.skillGroups.filter((g) => g.id !== gid); });
  const addSkill = (gid) => up((n) => { const g = n.skillGroups.find((x) => x.id === gid); if (g) g.skills.push({ id: "s" + Date.now(), name: "New skill" }); });
  const renameSkill = (gid, sid, name) => up((n) => { const g = n.skillGroups.find((x) => x.id === gid); if (g) { const s = g.skills.find((x) => x.id === sid); if (s) s.name = name; } });
  const delSkill = (gid, sid) => up((n) => { const g = n.skillGroups.find((x) => x.id === gid); if (g) g.skills = g.skills.filter((s) => s.id !== sid); });
  const addPerson = (person) => up((n) => { if (!n.people.some((p) => p.name.toLowerCase() === person.name.toLowerCase())) n.people.push({ ...person, weeks: Array(n.week_labels.length).fill("") }); });
  const removePerson = (name) => up((n) => { n.people = n.people.filter((p) => p.name !== name); if (n.skills) delete n.skills[name]; n.tasks.forEach((t) => { t.assignees = t.assignees.filter((a) => a !== name); }); });
  const toggleLead = (name) => up((n) => { const p = n.people.find((x) => x.name === name); if (p) p.lead = !p.lead; });
  const activatePerson = (name) => up((n) => { const p = n.people.find((x) => x.name === name); if (p) p.prospective = false; });
  const setRole = (name, role) => up((n) => { const p = n.people.find((x) => x.name === name); if (p) p.role = role; });

  const archiveWeek = (label) => up((n) => { if (!n.archivedWeeks.includes(label)) n.archivedWeeks.push(label); });
  const unarchiveWeek = (label) => up((n) => { n.archivedWeeks = n.archivedWeeks.filter((w) => w !== label); });
  const addWeek = () => up((n) => appendOneWeek(n));

  const addSuggestion = (text) => up((n) => n.suggestions.unshift({ id: "sg" + Date.now(), text, author: (me.split("@")[0] || "anon"), status: "Open", votes: 0, ts: Date.now() }));
  const updSuggestion = (id, patch) => up((n) => { const g = n.suggestions.find((x) => x.id === id); if (g) Object.assign(g, patch); });
  const delSuggestion = (id) => up((n) => { n.suggestions = n.suggestions.filter((g) => g.id !== id); });
  const voteSuggestion = (id) => up((n) => { const g = n.suggestions.find((x) => x.id === id); if (g) g.votes = (g.votes || 0) + 1; });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `mcx-dashboard-${todayKey()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = () => { try { setState(migrate(JSON.parse(reader.result))); } catch (e) { alert("Could not read that file — is it a dashboard export?"); } };
    reader.readAsText(file);
  };
  const signOut = () => supabase.auth.signOut();

  const addContact = (c) => up((n) => n.contacts.push({ id: "c" + Date.now(), building: "General", name: "", number: "", email: "", company: "", notes: "", ...c }));
  const updContact = (id, patch) => up((n) => { const c = n.contacts.find((x) => x.id === id); if (c) Object.assign(c, patch); });
  const delContact = (id) => up((n) => { n.contacts = n.contacts.filter((c) => c.id !== id); });

  const addFolder = (name) => up((n) => n.trainingFolders.push({ id: "tf" + Date.now(), name, links: [] }));
  const renameFolder = (id, name) => up((n) => { const f = n.trainingFolders.find((x) => x.id === id); if (f) f.name = name; });
  const delFolder = (id) => up((n) => { n.trainingFolders = n.trainingFolders.filter((f) => f.id !== id); });
  const addFolderLink = (fid, item) => up((n) => { const f = n.trainingFolders.find((x) => x.id === fid); if (f) f.links.push({ id: "tl" + Date.now(), ...item }); });
  const updFolderLink = (fid, lid, patch) => up((n) => { const f = n.trainingFolders.find((x) => x.id === fid); if (f) { const l = f.links.find((x) => x.id === lid); if (l) Object.assign(l, patch); } });
  const delFolderLink = (fid, lid) => up((n) => { const f = n.trainingFolders.find((x) => x.id === fid); if (f) f.links = f.links.filter((l) => l.id !== lid); });

  const addTask = (task) => up((n) => n.tasks.push({ id: "tk" + Date.now(), done: false, assignees: [], ...task }));
  const addTasksBulk = (list) => up((n) => { list.forEach((t, i) => n.tasks.push({ id: "tk" + Date.now() + "_" + i, done: false, assignees: [], ...t })); });
  const updTask = (id, patch) => up((n) => { const t = n.tasks.find((x) => x.id === id); if (t) Object.assign(t, patch); });
  const delTask = (id) => up((n) => { n.tasks = n.tasks.filter((t) => t.id !== id); });
  const toggleAssignee = (id, name) => up((n) => { const t = n.tasks.find((x) => x.id === id); if (!t) return; t.assignees = t.assignees.includes(name) ? t.assignees.filter((a) => a !== name) : [...t.assignees, name]; });

  const addLink = (bucket, item) => up((n) => n[bucket].push({ id: bucket + Date.now(), ...item }));
  const updLink = (bucket, id, patch) => up((n) => { const l = n[bucket].find((x) => x.id === id); if (l) Object.assign(l, patch); });
  const delLink = (bucket, id) => up((n) => { n[bucket] = n[bucket].filter((l) => l.id !== id); });

  const addDcr = () => up((n) => n.dcrs.push({ id: "dcr" + Date.now(), name: "New DCR", l2Updated: false, l2Ready: false, l4Updated: false, l4Ready: false }));
  const updDcr = (id, patch) => up((n) => { const d = n.dcrs.find((x) => x.id === id); if (d) Object.assign(d, patch); });
  const delDcr = (id) => up((n) => { n.dcrs = n.dcrs.filter((d) => d.id !== id); });

  const coverage = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
    people.filter((p) => !p.loaner && !p.prospective).forEach((p) => { c[weekStatus(p.weeks[weekIdx]).key]++; });
    return c;
  }, [people, weekIdx]);

  if (!loaded) return <div style={S.shell}><div style={{ ...S.mono, color: TEAM_ACCENT, padding: 40 }}>initializing…</div></div>;

  return (
    <div style={S.shell}>
      <style>{CSS}</style>

      <header style={S.masthead}>
        <div>
          <div style={S.markRow}><span style={S.mark} /><span style={S.mastTitle}>SLC1</span><span style={S.mastTitleThin}>QA / QC</span></div>
          <div style={S.mastSub}>Salt Lake City · SLC1 · Commissioning · QA / QC</div>
        </div>
        <div style={S.mastR}>
          <button className="chip" style={S.chip(false, MUTE)} onClick={exportData} title="Download a backup of all data">Export</button>
          <label className="chip" style={{ ...S.chip(false, MUTE), cursor: "pointer" }} title="Load data from a backup file">Import
            <input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ""; }} />
          </label>
          <button className="chip" style={S.chip(false, MUTE)} onClick={signOut} title="Sign out">Sign out</button>
          <span style={S.saveDot(saving)} /><span style={S.mono}>{saving ? "saving" : "saved"}</span>
        </div>
      </header>

      <nav style={S.tabs}>
        {[["schedule","Schedule"],["board","Coverage"],["timeline","Rotation"],["roster","Roster"],["skills","Skills"],["contacts","Contacts"],["training","Training"],["dcr","DCR"],["suggestions","Suggestions"]].map(([k, lbl]) => (
          <button key={k} onClick={() => setView(k)} className="tabbtn" style={S.tab(view === k)}>
            {lbl}
          </button>
        ))}
      </nav>

      {(view === "board" || view === "timeline") && (
        <div style={S.scrub}>
          <button className="scrubBtn" style={S.scrubBtn} onClick={() => setWeekIdx((i) => Math.max(startIdx, i - 1))} disabled={weekIdx <= startIdx}>‹</button>
          <div style={S.scrubTrack}>
            {weeks.map((w, i) => {
              if (i < startIdx) return null;
              const isNow = i === curWeek;
              return (
                <button key={w} onClick={() => setWeekIdx(i)} className="weekpip" style={S.weekPip(i === weekIdx, isNow)} title={isNow ? `${w} · current week` : w}>
                  <span style={S.weekPipLabel(i === weekIdx)}>{w.replace("Wk ", "")}</span>
                  {isNow && <span style={S.weekPipNow}>now</span>}
                </button>
              );
            })}
          </div>
          <button className="scrubBtn" style={S.scrubBtn} onClick={() => setWeekIdx((i) => Math.min(weeks.length - 1, i + 1))} disabled={weekIdx === weeks.length - 1}>›</button>
          {weekIdx !== curWeek && <button className="chip" style={S.chip(false, AMBER)} onClick={() => setWeekIdx(curWeek)}>This week</button>}
          {curWeek > 0 && <button className="chip" style={S.chip(showPast, MUTE)} onClick={() => { const np = !showPast; setShowPast(np); if (!np && weekIdx < curWeek) setWeekIdx(curWeek); }}>{showPast ? "Hide past" : "Show past"}</button>}
          <button className="addbtn" style={S.railAdd} onClick={addWeek} title="Add one more week to the horizon">+ week</button>
        </div>
      )}

      <main style={view === "schedule" ? S.mainWide : S.main}>
        {view === "board" && <BoardView people={people} weekIdx={weekIdx} weekLabel={weeks[weekIdx]} coverage={coverage} onPick={setSelected} activeLoaners={activeLoaners} setCell={setCell} />}
        {view === "timeline" && <TimelineView people={people} weeks={weeks} weekIdx={weekIdx} startIdx={startIdx} onPick={setSelected} />}
        {view === "schedule" && <ScheduleView tasks={state.tasks} people={people} weeks={weeks} weekStart={state.week_start} archivedWeeks={state.archivedWeeks} archiveWeek={archiveWeek} unarchiveWeek={unarchiveWeek} addWeek={addWeek} addTask={addTask} addTasksBulk={addTasksBulk} updTask={updTask} delTask={delTask} toggleAssignee={toggleAssignee} />}
        {view === "roster" && <RosterView people={people} weekIdx={weekIdx} weeks={weeks} onPick={setSelected} onAdd={() => setShowAdd(true)} activatePerson={activatePerson} />}
        {view === "skills" && <SkillsView people={people} skills={state.skills} skillGroups={state.skillGroups} setSkill={setSkill} addSkillGroup={addSkillGroup} renameSkillGroup={renameSkillGroup} delSkillGroup={delSkillGroup} addSkill={addSkill} renameSkill={renameSkill} delSkill={delSkill} />}
        {view === "contacts" && <ContactsView contacts={state.contacts} addContact={addContact} updContact={updContact} delContact={delContact} />}
        {view === "training" && <TrainingView folders={state.trainingFolders} addFolder={addFolder} renameFolder={renameFolder} delFolder={delFolder} addFolderLink={addFolderLink} updFolderLink={updFolderLink} delFolderLink={delFolderLink} />}
        {view === "dcr" && <DCRView dcrs={state.dcrs} addDcr={addDcr} updDcr={updDcr} delDcr={delDcr} links={state.links} addLink={addLink} updLink={updLink} delLink={delLink} />}
        {view === "suggestions" && <SuggestionsView suggestions={state.suggestions} addSuggestion={addSuggestion} updSuggestion={updSuggestion} delSuggestion={delSuggestion} voteSuggestion={voteSuggestion} />}
      </main>

      {selected && <PersonDrawer person={people.find((p) => p.name === selected)} weeks={weeks} onClose={() => setSelected(null)} setCell={setCell} setDayCell={setDayCell} splitWeek={splitWeek} unsplitWeek={unsplitWeek} removePerson={removePerson} toggleLead={toggleLead} setRole={setRole} />}
      {showAdd && <AddPersonDialog onClose={() => setShowAdd(false)} onAdd={(p) => { addPerson(p); setShowAdd(false); }} />}

      <footer style={S.footer}><span style={S.mono}>SLC1 · QA/QC Dashboard v1.0 · shared — changes sync to everyone</span></footer>
    </div>
  );
}

// ---- Coverage board ---------------------------------------------------------
function BoardView({ people, weekIdx, weekLabel, coverage, onPick, activeLoaners, setCell }) {
  const [fillMode, setFillMode] = useState(false);
  const groups = groupPeople(people);
  const cycle = (name, curKey) => {
    const editable = STATUS_ORDER.filter((k) => k !== "UNKNOWN");
    const idx = editable.indexOf(curKey);
    setCell(name, weekIdx, editable[(idx + 1) % editable.length]);
  };
  const rowClick = (p, st) => fillMode ? cycle(p.name, st.key) : onPick(p.name);
  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Coverage</div><h2 style={S.h2}>{weekLabel}</h2></div>
        <div style={S.legendRow}>
          <button className="chip" style={S.chip(fillMode, AMBER)} onClick={() => setFillMode((v) => !v)}>{fillMode ? "✓ Fill week" : "Fill week"}</button>
          {STATUS_ORDER.filter((k) => coverage[k] > 0).map((k) => (
            <div key={k} style={S.legendItem}><span style={{ ...S.legendSwatch, background: STATUS[k].color }} /><span style={S.mono}>{STATUS[k].label}</span><span style={S.legendCount}>{coverage[k]}</span></div>
          ))}
        </div>
      </div>
      {fillMode && <div style={S.fillHint}><span style={S.mono}>Fill mode on — tap any person to cycle their status for {weekLabel}. Tap "Fill week" again to go back to opening profiles.</span></div>}
      <div style={S.boardGrid}>
        {groups.map(({ key, accent, members }) => (
          <section key={key} style={S.bldCard}>
            <header style={S.bldHead}><span style={{ ...S.bldTick, background: accent }} /><span style={S.bldName}>{key}</span><span style={S.bldCount}>{members.length}</span></header>
            <div>
              {members.map((p) => { const st = weekStatus(p.weeks[weekIdx]); return (
                <div key={p.name} className="prow" style={{ ...S.prow, ...(fillMode ? { background: AMBER + "08" } : {}) }} onClick={() => rowClick(p, st)}>
                  <span style={{ ...S.prowDot, background: st.color }} /><span style={S.prowName}>{p.name}</span>
                  <span style={{ ...S.prowStatus, color: st.color }}>{st.label}</span>
                </div>
              ); })}
            </div>
          </section>
        ))}
        {activeLoaners.length > 0 && (
          <section style={{ ...S.bldCard, borderColor: LOANER_ACCENT + "55" }}>
            <header style={{ ...S.bldHead, background: LOANER_ACCENT + "14" }}><span style={{ ...S.bldTick, background: LOANER_ACCENT }} /><span style={S.bldName}>Loaners on site</span><span style={S.bldCount}>{activeLoaners.length}</span></header>
            <div>{activeLoaners.map((p) => { const st = weekStatus(p.weeks[weekIdx]); return (
              <div key={p.name} className="prow" style={{ ...S.prow, ...(fillMode ? { background: AMBER + "08" } : {}) }} onClick={() => rowClick(p, st)}>
                <span style={{ ...S.prowDot, background: LOANER_ACCENT }} /><span style={S.prowName}>{p.name}</span><span style={{ ...S.prowStatus, color: LOANER_ACCENT }}>on site</span>
              </div>
            ); })}</div>
          </section>
        )}
      </div>
    </div>
  );
}

// ---- Rotation timeline ------------------------------------------------------
function TimelineView({ people, weeks, weekIdx, startIdx = 0, onPick }) {
  const groups = groupPeople(people);
  const loaners = people.filter((p) => p.loaner);
  const all = loaners.length ? [...groups, { key: "Loaners", accent: LOANER_ACCENT, members: loaners }] : groups;
  const shownCount = weeks.length - startIdx;
  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Rotation</div><h2 style={S.h2}>{startIdx > 0 ? `${shownCount}-week look-ahead` : `${weeks.length}-week horizon`}</h2></div>
        <div style={S.legendRow}>{["ONSITE","HOME","PTO","ONBOARD","OTHER"].map((k) => (
          <div key={k} style={S.legendItem}><span style={{ ...S.legendSwatch, background: STATUS[k].color }} /><span style={S.mono}>{STATUS[k].label}</span></div>
        ))}</div>
      </div>
      <div style={S.tlWrap}>
        <div style={S.tlScale}><div style={S.tlNameCol} /><div style={S.tlStrip}>{weeks.map((w, i) => i < startIdx ? null : <div key={w} style={S.tlTick(i === weekIdx)}>{w.replace("Wk ", "")}</div>)}</div></div>
        {all.map(({ key, accent, members }) => (
          <div key={key} style={S.tlGroup}>
            <div style={S.tlGroupLabel}><span style={{ ...S.bldTick, background: accent }} />{key}</div>
            {members.map((p) => (
              <div key={p.name} className="tlrow" style={S.tlRow} onClick={() => onPick(p.name)}>
                <div style={S.tlName}>{p.name}</div>
                <div style={S.tlStrip}>{p.weeks.map((c, i) => { if (i < startIdx) return null; const st = weekStatus(c); return <div key={i} title={`${weeks[i]} · ${st.label}${isSplit(c) ? " (per-day)" : ""}`} style={S.tlCell(st.color, i === weekIdx)} />; })}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Weekly task board (day-column grid) ------------------------------------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BUILDINGS = ["DC2", "DC3"];
const BUILDING_C = { DC2: "#E8B14C", DC3: "#5BB98C" };
const TASK_STATUS = {
  "Scheduled":   { c: "#79858F", label: "Scheduled" },
  "Not Ready":   { c: "#D96A6A", label: "Not Ready" },
  "In Progress": { c: "#E8B14C", label: "In Progress" },
  "Complete":    { c: "#5BB98C", label: "Complete" },
};
const TASK_STATUS_KEYS = Object.keys(TASK_STATUS);

function ScheduleView({ tasks, people, weeks, weekStart, archivedWeeks, archiveWeek, unarchiveWeek, addWeek, addTask, addTasksBulk, updTask, delTask, toggleAssignee }) {
  const activeWeeks = weeks.filter((w) => !archivedWeeks.includes(w));
  const curIdx = currentWeekIdx(weekStart, weeks.length);
  const curLabel = weeks[curIdx];
  const nextLabel = weeks[Math.min(weeks.length - 1, curIdx + 1)];
  const defaultWeek = activeWeeks.includes(curLabel) ? curLabel : (activeWeeks[0] || weeks[0]);

  const [week, setWeek] = useState(defaultWeek);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("All");
  const [showArchive, setShowArchive] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const dates = weekDatesByIndex(weekStart, weeks.indexOf(week));

  const weekTasks = tasks.filter((t) => t.week === week && (filter === "All" || t.building === filter));
  const byDay = Object.fromEntries(DAYS.map((d) => [d, weekTasks.filter((t) => t.day === d)]));

  const create = (day) => {
    const id = "tk" + Date.now();
    addTask({ id, week, day, building: filter === "All" ? "DC2" : filter, task: "", testing: "", support: "", equipment: "", status: "Scheduled", assignees: [] });
    setEditing(id);
  };
  const cycleStatus = (t) => {
    const i = TASK_STATUS_KEYS.indexOf(t.status);
    updTask(t.id, { status: TASK_STATUS_KEYS[(i + 1) % TASK_STATUS_KEYS.length] });
  };
  const editingTask = tasks.find((t) => t.id === editing);
  const isArchived = archivedWeeks.includes(week);

  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Schedule</div><h2 style={S.h2}>{week}{week === curLabel && <span style={S.thisWeekBadge}>THIS WEEK</span>}</h2></div>
        <div style={S.legendRow}>
          <button className="chip" style={S.chip(filter === "All", "#F2F5F8")} onClick={() => setFilter("All")}>All</button>
          {BUILDINGS.map((b) => <button key={b} className="chip" style={S.chip(filter === b, BUILDING_C[b])} onClick={() => setFilter(b)}>{b}</button>)}
        </div>
      </div>

      {showGen && null}

      {/* Look-ahead week rail */}
      <div style={S.weekRail}>
        {activeWeeks.map((w) => {
          const on = w === week;
          const tag = w === curLabel ? "now" : w === nextLabel ? "next" : "";
          return (
            <button key={w} className="weekpip" style={S.railPip(on, tag)} onClick={() => setWeek(w)}>
              <span style={S.railPipLabel(on)}>{w.replace("Wk ", "")}</span>
              {tag && <span style={S.railTag(tag)}>{tag}</span>}
            </button>
          );
        })}
        <button className="addbtn" style={S.railAdd} onClick={addWeek} title="Add one more week to the horizon">+ week</button>
        <div style={{ flex: 1 }} />
        {isArchived
          ? <button className="chip" style={S.chip(false, TEAM_ACCENT)} onClick={() => unarchiveWeek(week)}>Restore week</button>
          : <button className="chip" style={S.chip(false, MUTE)} onClick={() => { archiveWeek(week); setWeek(defaultWeek); }}>Archive week</button>}
      </div>

      <div style={S.dayGrid}>
        {DAYS.map((day) => (
          <div key={day} style={S.dayCol}>
            <div style={S.dayHead}><span style={S.dayName}>{day}</span><span style={S.mono}>{dates[day] || ""}</span></div>
            <div style={S.dayBody}>
              {byDay[day].map((t) => {
                const st = TASK_STATUS[t.status] || TASK_STATUS.Scheduled;
                return (
                  <div key={t.id} className="taskcard" style={{ ...S.tcard, borderLeft: `3px solid ${BUILDING_C[t.building] || "#79858F"}` }} onClick={() => setEditing(t.id)}>
                    <div style={S.tcardTop}>
                      <span style={{ ...S.tbTag, color: BUILDING_C[t.building], borderColor: (BUILDING_C[t.building] || "#79858F") + "66" }}>{t.building}</span>
                      <button className="statuspill" style={S.statusPill(st.c)} onClick={(e) => { e.stopPropagation(); cycleStatus(t); }} title="Tap to advance status">{st.label}</button>
                    </div>
                    <div style={{ ...S.tcardTitle, color: st.c === "#D96A6A" ? "#D96A6A" : "#F2F5F8" }}>{t.task || "Untitled task"}</div>
                    {t.testing && <div style={S.tField}><span style={S.tFieldLbl}>TEST</span>{t.testing}</div>}
                    {t.assignees.length > 0 && <div style={S.tChips}>{t.assignees.map((a) => <span key={a} style={S.assigneeChip}>{a.split(" ")[0]}</span>)}</div>}
                    {t.support && <div style={S.tField}><span style={S.tFieldLbl}>SUPP</span>{t.support}</div>}
                    {t.equipment && <div style={S.tField}><span style={S.tFieldLbl}>EQUIP</span>{t.equipment}</div>}
                  </div>
                );
              })}
              <button className="addbtn" style={S.dayAdd} onClick={() => create(day)}>+ task</button>
            </div>
          </div>
        ))}
      </div>

      {/* Archive subfolder */}
      {archivedWeeks.length > 0 && (
        <div style={S.archiveWrap}>
          <button className="tabbtn" style={S.archiveToggle} onClick={() => setShowArchive((v) => !v)}>
            {showArchive ? "▾" : "▸"} Archive <span style={S.mono}>({archivedWeeks.length})</span>
          </button>
          {showArchive && (
            <div style={S.archiveList}>
              {archivedWeeks.map((w) => (
                <div key={w} style={S.archiveRow}>
                  <span style={S.prowName}>{w}</span>
                  <button className="chip" style={S.chip(false, TEAM_ACCENT)} onClick={() => { unarchiveWeek(w); setWeek(w); }}>Restore & view</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingTask && (
        <TaskEditor task={editingTask} people={people} dates={dates}
          onClose={() => setEditing(null)} updTask={updTask} delTask={(id) => { delTask(id); setEditing(null); }} toggleAssignee={toggleAssignee} />
      )}
    </div>
  );
}

// ---- DCR review tracker -----------------------------------------------------
function DcrCheck({ on, onToggle, color }) {
  return (
    <button className="skcell" style={S.dcrCheck(on, color)} onClick={onToggle} title={on ? "Done" : "Not yet"}>{on ? "✓" : ""}</button>
  );
}

function DCRView({ dcrs, addDcr, updDcr, delDcr, links, addLink, updLink, delLink }) {
  const fullyReady = dcrs.filter((d) => d.l2Ready && d.l4Ready).length;
  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>DCR</div><h2 style={S.h2}>L2 / L4 review tracker</h2></div>
        <div style={S.mono}>{fullyReady} of {dcrs.length} ready for management review</div>
      </div>

      <div style={S.skillScroll}>
        <table style={S.dcrTable}>
          <thead>
            <tr>
              <th style={{ ...S.skTh, ...S.skNameTh, textAlign: "left" }} rowSpan={2}>DCR</th>
              <th colSpan={2} style={{ ...S.skGroupTh, color: "#6AA4D9", borderBottom: "2px solid #6AA4D955" }}>L2</th>
              <th colSpan={2} style={{ ...S.skGroupTh, color: "#E8B14C", borderBottom: "2px solid #E8B14C55" }}>L4</th>
              <th rowSpan={2} style={S.skGroupTh}></th>
              <th rowSpan={2} style={S.skGroupTh}></th>
            </tr>
            <tr>
              <th style={S.skTh}>Team updated</th>
              <th style={S.skTh}>Ready for review</th>
              <th style={S.skTh}>Team updated</th>
              <th style={S.skTh}>Ready for review</th>
            </tr>
          </thead>
          <tbody>
            {dcrs.map((d) => {
              const ready = d.l2Ready && d.l4Ready;
              return (
                <tr key={d.id}>
                  <td style={S.dcrNameTd}>
                    <input className="txt" style={S.dcrNameInput} value={d.name} onChange={(e) => updDcr(d.id, { name: e.target.value })} />
                    {ready && <span style={S.dcrReadyBadge}>READY</span>}
                  </td>
                  <td style={S.skCellTd}><DcrCheck on={d.l2Updated} color="#6AA4D9" onToggle={() => updDcr(d.id, { l2Updated: !d.l2Updated })} /></td>
                  <td style={S.skCellTd}><DcrCheck on={d.l2Ready} color="#6AA4D9" onToggle={() => updDcr(d.id, { l2Ready: !d.l2Ready })} /></td>
                  <td style={S.skCellTd}><DcrCheck on={d.l4Updated} color="#E8B14C" onToggle={() => updDcr(d.id, { l4Updated: !d.l4Updated })} /></td>
                  <td style={S.skCellTd}><DcrCheck on={d.l4Ready} color="#E8B14C" onToggle={() => updDcr(d.id, { l4Ready: !d.l4Ready })} /></td>
                  <td style={S.skCellTd} />
                  <td style={S.skCellTd}><button className="delbtn" style={S.miniDel} onClick={() => delDcr(d.id)} title="Remove DCR">✕</button></td>
                </tr>
              );
            })}
            {dcrs.length === 0 && <tr><td colSpan={7} style={{ ...S.skName, color: MUTE }}>No DCRs — add one below.</td></tr>}
          </tbody>
        </table>
      </div>
      <button className="addbtn" style={{ ...S.addBtn, marginTop: 14 }} onClick={addDcr}>+ Add DCR</button>

      <div style={{ marginTop: 28, maxWidth: 520 }}>
        <LinksSection title="Quick links" bucket="links" items={links} addLink={addLink} updLink={updLink} delLink={delLink} />
      </div>
    </div>
  );
}

function TaskEditor({ task, people, dates, onClose, updTask, delTask, toggleAssignee }) {
  const core = people.filter((p) => !p.loaner && !p.prospective);
  const loaners = people.filter((p) => p.loaner);
  const set = (patch) => updTask(task.id, patch);
  return (
    <div style={S.drawerWrap} onClick={onClose}>
      <aside style={S.drawer} onClick={(e) => e.stopPropagation()}>
        <header style={S.drawerHead}>
          <div><div style={S.eyebrow}>{task.day} {dates[task.day] || ""} · {task.week}</div><h3 style={S.drawerName}>Task</h3></div>
          <button className="xbtn" style={S.xbtn} onClick={onClose}>✕</button>
        </header>
        <div style={S.editorBody}>
          <Field label="Task (@0800)"><input autoFocus className="txt" style={S.input} value={task.task} placeholder="e.g. DH1200 CRAH Functionals" onChange={(e) => set({ task: e.target.value })} /></Field>

          <div style={S.editorRow}>
            <div style={{ flex: 1 }}>
              <label style={{ ...S.mono, display: "block", marginBottom: 6 }}>Building</label>
              <div style={S.chipWrap}>{BUILDINGS.map((b) => <button key={b} className="chip" style={S.chip(task.building === b, BUILDING_C[b])} onClick={() => set({ building: b })}>{b}</button>)}</div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ ...S.mono, display: "block", marginBottom: 6 }}>Day</label>
              <select className="bldSelect" style={S.input} value={task.day} onChange={(e) => set({ day: e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{d} {dates[d] || ""}</option>)}</select>
            </div>
          </div>

          <Field label="Status"><div style={S.chipWrap}>{TASK_STATUS_KEYS.map((k) => <button key={k} className="chip" style={S.chip(task.status === k, TASK_STATUS[k].c)} onClick={() => set({ status: k })}>{TASK_STATUS[k].label}</button>)}</div></Field>

          <Field label="Testing"><input className="txt" style={S.input} value={task.testing} placeholder="e.g. FPTs, IST" onChange={(e) => set({ testing: e.target.value })} /></Field>

          <Field label="DLB — assign people">
            <div style={S.chipWrap}>{core.map((p) => <button key={p.name} className="chip" style={S.chip(task.assignees.includes(p.name), p.lead ? LEAD_ACCENT : TEAM_ACCENT)} onClick={() => toggleAssignee(task.id, p.name)}>{p.name}{p.lead && " ★"}</button>)}</div>
            {loaners.length > 0 && <><div style={{ ...S.eyebrow, color: LOANER_ACCENT, marginTop: 8 }}>Loaners</div><div style={S.chipWrap}>{loaners.map((p) => <button key={p.name} className="chip" style={S.chip(task.assignees.includes(p.name), LOANER_ACCENT)} onClick={() => toggleAssignee(task.id, p.name)}>{p.name}</button>)}</div></>}
          </Field>

          <Field label="Support (vendors)"><input className="txt" style={S.input} value={task.support} placeholder="e.g. ATC, Prime · All vendors" onChange={(e) => set({ support: e.target.value })} /></Field>
          <Field label="Equipment"><input className="txt" style={S.input} value={task.equipment} placeholder="e.g. Load banks" onChange={(e) => set({ equipment: e.target.value })} /></Field>
        </div>
        <div style={S.drawerFoot}><button className="delbtn" style={S.delBtn} onClick={() => delTask(task.id)}>Delete task</button></div>
      </aside>
    </div>
  );
}

// ---- Roster -----------------------------------------------------------------
function RosterView({ people, weekIdx, weeks, onPick, onAdd, activatePerson }) {
  const core = people.filter((p) => !p.loaner && !p.prospective);
  const loaners = people.filter((p) => p.loaner && !p.prospective);
  const prospective = people.filter((p) => p.prospective);
  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Roster</div><h2 style={S.h2}>All personnel</h2></div>
        <button className="addbtn" style={S.addBtn} onClick={onAdd}>+ Add person</button>
      </div>
      <div style={{ ...S.mono, marginBottom: 12 }}>Status reflects {weeks[weekIdx]}</div>
      <RosterTable rows={core} weekIdx={weekIdx} onPick={onPick} />
      {loaners.length > 0 && <>
        <div style={{ ...S.eyebrow, color: LOANER_ACCENT, marginTop: 26, marginBottom: 8 }}>Loaners / Temp — separate from core team</div>
        <RosterTable rows={loaners} weekIdx={weekIdx} onPick={onPick} loaner />
      </>}
      {prospective.length > 0 && <>
        <div style={{ ...S.eyebrow, color: "#9B7FD4", marginTop: 26, marginBottom: 8 }}>Prospective — candidates / pending, not yet active</div>
        <RosterTable rows={prospective} weekIdx={weekIdx} onPick={onPick} prospective activatePerson={activatePerson} />
      </>}
    </div>
  );
}
function RosterTable({ rows, weekIdx, onPick, loaner, prospective, activatePerson }) {
  return (
    <div style={{ ...S.rosterTable, ...(prospective ? { borderColor: "#9B7FD455" } : {}) }}>
      <div style={S.rosterHeadRow}><span>Name</span><span>Role</span><span style={{ textAlign: "right" }}>{prospective ? "Action" : "This week"}</span></div>
      {rows.map((p) => { const st = weekStatus(p.weeks[weekIdx]); return (
        <div key={p.name} style={S.rosterRow}>
          <span style={S.rosterName} className="rname" onClick={() => onPick(p.name)}>{p.name}{p.lead && <span style={S.leadDot} title="Lead" />}</span>
          <span style={S.rosterMuted}>{p.role || "—"}</span>
          <span style={{ textAlign: "right" }}>
            {prospective
              ? <button className="addbtn" style={S.activateBtn} onClick={() => activatePerson(p.name)}>Activate →</button>
              : <span style={S.pill(loaner ? LOANER_ACCENT : st.color)}>{loaner ? (st.key === "ONSITE" ? "on site" : st.label) : st.label}</span>}
          </span>
        </div>
      ); })}
    </div>
  );
}

// ---- Skills -----------------------------------------------------------------
function SkillsView({ people, skills, skillGroups, setSkill, addSkillGroup, renameSkillGroup, delSkillGroup, addSkill, renameSkill, delSkill }) {
  const [edit, setEdit] = useState(false);
  const core = people.filter((p) => !p.loaner && !p.prospective);
  const flat = skillGroups.flatMap((g) => g.skills); // [{id,name}]
  const cov = flat.map((sk) => core.filter((p) => (skills[p.name]?.[sk.id] ?? 0) >= 2).length);
  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Skills</div><h2 style={S.h2}>Coverage matrix</h2></div>
        <div style={S.legendRow}>
          <button className="chip" style={S.chip(edit, AMBER)} onClick={() => setEdit((v) => !v)}>{edit ? "✓ Done editing" : "Edit categories"}</button>
          {!edit && <div style={S.mono}>Tap a cell to cycle 0→1→2→3</div>}
        </div>
      </div>
      <div style={S.skillScroll}>
        <table style={S.skillTable}>
          <thead>
            <tr>
              <th style={{ ...S.skTh, ...S.skNameTh }} rowSpan={2}>Name</th>
              {skillGroups.map((g) => (
                <th key={g.id} colSpan={Math.max(1, g.skills.length + (edit ? 1 : 0))} style={{ ...S.skGroupTh, color: g.accent, borderBottom: `2px solid ${g.accent}55` }}>
                  {edit ? (
                    <span style={S.skEditGroup}>
                      <input className="txt" style={S.skGroupInput} value={g.group} onChange={(e) => renameSkillGroup(g.id, e.target.value)} />
                      <button className="delbtn" style={S.miniDel} onClick={() => delSkillGroup(g.id)} title="Delete group">✕</button>
                    </span>
                  ) : g.group}
                </th>
              ))}
              {edit && <th rowSpan={2} style={{ ...S.skGroupTh }}><button className="addbtn" style={S.addBtnSm} onClick={addSkillGroup} title="Add group">+</button></th>}
            </tr>
            <tr>
              {skillGroups.map((g) => [
                ...g.skills.map((sk) => (
                  <th key={sk.id} style={S.skTh}>
                    {edit ? (
                      <span style={S.skEditCol}>
                        <input className="txt" style={S.skColInput} value={sk.name} onChange={(e) => renameSkill(g.id, sk.id, e.target.value)} />
                        <button className="delbtn" style={S.miniDel} onClick={() => delSkill(g.id, sk.id)} title="Delete">✕</button>
                      </span>
                    ) : sk.name}
                  </th>
                )),
                edit ? <th key={g.id + "_add"} style={S.skTh}><button className="addbtn" style={S.addBtnSm} onClick={() => addSkill(g.id)} title="Add skill">+</button></th> : null,
              ])}
            </tr>
          </thead>
          <tbody>
            {core.map((p) => (
              <tr key={p.name}>
                <td style={S.skName}>{p.name}{p.lead && <span style={S.leadDot} />}</td>
                {skillGroups.map((g) => [
                  ...g.skills.map((sk) => { const lvl = skills[p.name]?.[sk.id] ?? 0; return (
                    <td key={sk.id} style={S.skCellTd}><button className="skcell" style={S.skCell(lvl)} title={PROF[lvl]} onClick={() => setSkill(p.name, sk.id, (lvl + 1) % 4)}>{lvl > 0 ? lvl : ""}</button></td>
                  ); }),
                  edit ? <td key={g.id + "_pad"} style={S.skCellTd} /> : null,
                ])}
              </tr>
            ))}
            {core.length === 0 && <tr><td style={{ ...S.skName, color: MUTE }} colSpan={flat.length + 1}>Add people in the Roster tab to fill this matrix.</td></tr>}
            <tr>
              <td style={{ ...S.skName, color: MUTE, fontWeight: 400, fontStyle: "italic" }}>Proficient+ count</td>
              {skillGroups.map((g, gi) => [
                ...g.skills.map((sk) => { const idx = flat.findIndex((f) => f.id === sk.id); return <td key={sk.id} style={S.skCellTd}><span style={S.skCoverage(cov[idx])}>{cov[idx]}</span></td>; }),
                edit ? <td key={g.id + "_cpad"} style={S.skCellTd} /> : null,
              ])}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={S.profLegend}>{PROF.map((lbl, i) => <div key={i} style={S.legendItem}><span style={{ ...S.legendSwatch, background: SK_COLORS[i] }} /><span style={S.mono}>{i} · {lbl}</span></div>)}</div>
    </div>
  );
}

// A link that shows as a clickable link by default; pencil reveals editing.
function LinkRow({ link, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(!link.label && !link.url);
  if (editing) {
    return (
      <div style={S.linkRow}>
        <input className="txt" style={{ ...S.input, flex: "0 0 34%" }} placeholder="Label" value={link.label} onChange={(e) => onUpdate({ label: e.target.value })} />
        <input className="txt" style={S.linkInput} placeholder="paste URL…" value={link.url} onChange={(e) => onUpdate({ url: e.target.value })} />
        <button className="chip" style={S.chip(true, TEAM_ACCENT)} onClick={() => setEditing(false)} title="Done">✓</button>
        <button className="delbtn" style={S.miniDel} onClick={onDelete}>✕</button>
      </div>
    );
  }
  return (
    <div style={S.linkRow}>
      {link.url
        ? <a href={link.url} target="_blank" rel="noreferrer" className="rname" style={{ ...S.linkA, flex: 1 }}>{link.label || link.url}</a>
        : <span style={{ ...S.prowName, flex: 1 }}>{link.label || <span style={S.mono}>(no link yet)</span>}</span>}
      <button className="delbtn" style={S.miniEdit} onClick={() => setEditing(true)} title="Edit">✎</button>
      <button className="delbtn" style={S.miniDel} onClick={onDelete}>✕</button>
    </div>
  );
}

function LinksSection({ title, bucket, items, addLink, updLink, delLink }) {
  const [label, setLabel] = useState(""); const [url, setUrl] = useState("");
  const add = () => { if (!label.trim()) return; addLink(bucket, { label: label.trim(), url: url.trim() }); setLabel(""); setUrl(""); };
  return (
    <section style={S.hubCard}>
      <div style={S.hubCardHead}><span style={S.hubCardTitle}>{title}</span></div>
      {items.map((l) => (
        <LinkRow key={l.id} link={l} onUpdate={(patch) => updLink(bucket, l.id, patch)} onDelete={() => delLink(bucket, l.id)} />
      ))}
      <div style={S.linkAdd}>
        <input className="txt" style={{ ...S.input, flex: "0 0 34%" }} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="txt" style={{ ...S.input, flex: 1 }} placeholder="URL (optional now)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="addbtn" style={S.addBtnSm} onClick={add}>+</button>
      </div>
    </section>
  );
}

// ---- Contacts ---------------------------------------------------------------
const CONTACT_BUILDINGS = ["General", "DC2", "DC3"];
function ContactsView({ contacts, addContact, updContact, delContact }) {
  return (
    <div>
      <div style={S.boardHead}><div><div style={S.eyebrow}>Contacts</div><h2 style={S.h2}>By building</h2></div><div style={S.mono}>Name · Number · Email · Company · Notes</div></div>
      {CONTACT_BUILDINGS.map((b) => {
        const rows = contacts.filter((c) => c.building === b);
        return (
          <section key={b} style={S.hubCard}>
            <div style={S.hubCardHead}>
              <span style={{ ...S.hubCardTitle, color: b === "General" ? "#F2F5F8" : BUILDING_C[b] }}>{b}</span>
              <button className="addbtn" style={S.addBtnSm} onClick={() => addContact({ building: b })}>+</button>
            </div>
            {rows.length === 0 && <div style={{ ...S.mono, padding: "12px 16px" }}>No contacts yet — tap + to add.</div>}
            {rows.map((c) => (
              <ContactRow key={c.id} contact={c} onUpdate={(patch) => updContact(c.id, patch)} onDelete={() => delContact(c.id)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

// A contact shown read-only (email/phone tappable); pencil reveals editing.
function ContactRow({ contact, onUpdate, onDelete }) {
  const c = contact;
  const [editing, setEditing] = useState(!c.name && !c.company && !c.number && !c.email);
  if (editing) {
    return (
      <div style={S.contactRow}>
        <input className="txt" style={S.cInput} placeholder="Name" value={c.name} onChange={(e) => onUpdate({ name: e.target.value })} />
        <input className="txt" style={S.cInput} placeholder="Number" value={c.number} onChange={(e) => onUpdate({ number: e.target.value })} />
        <input className="txt" style={S.cInput} placeholder="Email" value={c.email} onChange={(e) => onUpdate({ email: e.target.value })} />
        <input className="txt" style={S.cInput} placeholder="Company" value={c.company} onChange={(e) => onUpdate({ company: e.target.value })} />
        <input className="txt" style={S.cInput} placeholder="Notes" value={c.notes} onChange={(e) => onUpdate({ notes: e.target.value })} />
        <button className="chip" style={S.chip(true, TEAM_ACCENT)} onClick={() => setEditing(false)} title="Done">✓</button>
        <button className="delbtn" style={S.miniDel} onClick={onDelete}>✕</button>
      </div>
    );
  }
  return (
    <div style={S.contactRow}>
      <span style={S.cView}>{c.name || <span style={S.mono}>—</span>}</span>
      <span style={S.cView}>{c.number ? <a href={`tel:${c.number}`} className="rname" style={S.cLink}>{c.number}</a> : <span style={S.mono}>—</span>}</span>
      <span style={S.cView}>{c.email ? <a href={`mailto:${c.email}`} className="rname" style={S.cLink}>{c.email}</a> : <span style={S.mono}>—</span>}</span>
      <span style={S.cView}>{c.company || <span style={S.mono}>—</span>}</span>
      <span style={S.cView}>{c.notes || <span style={S.mono}>—</span>}</span>
      <button className="delbtn" style={S.miniEdit} onClick={() => setEditing(true)} title="Edit">✎</button>
      <button className="delbtn" style={S.miniDel} onClick={onDelete}>✕</button>
    </div>
  );
}

// ---- Training (folders + links) ---------------------------------------------
function TrainingView({ folders, addFolder, renameFolder, delFolder, addFolderLink, updFolderLink, delFolderLink }) {
  const [newFolder, setNewFolder] = useState("");
  const create = () => { if (!newFolder.trim()) return; addFolder(newFolder.trim()); setNewFolder(""); };
  return (
    <div>
      <div style={S.boardHead}><div><div style={S.eyebrow}>Training</div><h2 style={S.h2}>Resources by topic</h2></div>
        <div style={S.taskCreate}>
          <input className="txt" style={{ ...S.input, flex: 1 }} placeholder="New folder — e.g. Rigging" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="addbtn" style={S.addBtn} onClick={create}>+ Folder</button>
        </div>
      </div>
      {folders.map((f) => <TrainingFolder key={f.id} folder={f} renameFolder={renameFolder} delFolder={delFolder} addFolderLink={addFolderLink} updFolderLink={updFolderLink} delFolderLink={delFolderLink} />)}
    </div>
  );
}
function TrainingFolder({ folder, renameFolder, delFolder, addFolderLink, updFolderLink, delFolderLink }) {
  const [label, setLabel] = useState(""); const [url, setUrl] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const add = () => { if (!label.trim()) return; addFolderLink(folder.id, { label: label.trim(), url: url.trim() }); setLabel(""); setUrl(""); };
  return (
    <section style={S.hubCard}>
      <div style={S.hubCardHead}>
        <input className="txt" style={{ ...S.folderName }} value={folder.name} onChange={(e) => renameFolder(folder.id, e.target.value)} />
        {!confirmDel
          ? <button className="delbtn" style={S.miniDel} onClick={() => setConfirmDel(true)}>✕</button>
          : <span style={S.confirmRow}><button className="chip" style={S.chip(true, "#D96A6A")} onClick={() => delFolder(folder.id)}>Delete folder</button><button className="chip" style={S.chip(false, MUTE)} onClick={() => setConfirmDel(false)}>Cancel</button></span>}
      </div>
      {folder.links.map((l) => (
        <LinkRow key={l.id} link={l} onUpdate={(patch) => updFolderLink(folder.id, l.id, patch)} onDelete={() => delFolderLink(folder.id, l.id)} />
      ))}
      <div style={S.linkAdd}>
        <input className="txt" style={{ ...S.input, flex: "0 0 34%" }} placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <input className="txt" style={{ ...S.input, flex: 1 }} placeholder="URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="addbtn" style={S.addBtnSm} onClick={add}>+</button>
      </div>
    </section>
  );
}

// ---- Suggestions (shared) ---------------------------------------------------
const SUGGESTION_STATUS = {
  "Open":     { c: "#6AA4D9" },
  "Planned":  { c: "#E8B14C" },
  "Done":     { c: "#5BB98C" },
  "Declined": { c: "#79858F" },
};
const SUGGESTION_KEYS = Object.keys(SUGGESTION_STATUS);

function SuggestionsView({ suggestions, addSuggestion, updSuggestion, delSuggestion, voteSuggestion }) {
  const [draft, setDraft] = useState("");
  const post = () => { if (!draft.trim()) return; addSuggestion(draft.trim()); setDraft(""); };
  const cycle = (g) => { const i = SUGGESTION_KEYS.indexOf(g.status); updSuggestion(g.id, { status: SUGGESTION_KEYS[(i + 1) % SUGGESTION_KEYS.length] }); };

  const active = ["Open", "Planned"];
  const sorted = [...suggestions].sort((a, b) => {
    const aA = active.includes(a.status), bA = active.includes(b.status);
    if (aA !== bA) return aA ? -1 : 1;               // active first
    if ((b.votes || 0) !== (a.votes || 0)) return (b.votes || 0) - (a.votes || 0); // then most votes
    return (b.ts || 0) - (a.ts || 0);                // then newest
  });

  return (
    <div>
      <div style={S.boardHead}>
        <div><div style={S.eyebrow}>Suggestions</div><h2 style={S.h2}>Ideas & feedback</h2></div>
        <div style={S.mono}>Shared with everyone · {suggestions.length} total</div>
      </div>

      <div style={S.sgCompose}>
        <textarea className="txt" style={S.sgTextarea} value={draft} placeholder="Suggest an improvement, report a bug, request a feature…"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post(); }} />
        <div style={S.sgComposeFoot}>
          <span style={S.mono}>Posts as you · ⌘/Ctrl+Enter</span>
          <button className="addbtn" style={{ ...S.addBtn, opacity: draft.trim() ? 1 : 0.4, pointerEvents: draft.trim() ? "auto" : "none" }} onClick={post}>Post suggestion</button>
        </div>
      </div>

      {sorted.length === 0 && <div style={{ ...S.mono, padding: "20px 2px" }}>No suggestions yet — be the first.</div>}

      <div style={{ marginTop: 8 }}>
        {sorted.map((g) => {
          const st = SUGGESTION_STATUS[g.status] || SUGGESTION_STATUS.Open;
          const closed = !active.includes(g.status);
          return (
            <div key={g.id} style={{ ...S.sgRow, opacity: closed ? 0.6 : 1 }}>
              <button className="chip" style={S.sgVote} onClick={() => voteSuggestion(g.id)} title="Upvote">
                <span style={{ fontSize: 12, lineHeight: 1 }}>▲</span><span style={S.sgVoteN}>{g.votes || 0}</span>
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ ...S.sgText, textDecoration: g.status === "Done" ? "line-through" : "none" }}>{g.text}</div>
                <div style={S.sgMeta}>
                  <span style={S.mono}>{g.author || "anon"}</span>
                  <span style={S.mono}>· {g.ts ? new Date(g.ts).toLocaleDateString() : ""}</span>
                  <button className="statuspill" style={S.statusPill(st.c)} onClick={() => cycle(g)} title="Tap to change status">{g.status}</button>
                </div>
              </div>
              <button className="delbtn" style={S.miniDel} onClick={() => delSuggestion(g.id)} title="Delete">✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Person drawer ----------------------------------------------------------
function PersonDrawer({ person, weeks, onClose, setCell, setDayCell, splitWeek, unsplitWeek, removePerson, toggleLead, setRole }) {
  const [confirmDel, setConfirmDel] = useState(false);
  if (!person) return null;
  const STATUSES = STATUS_ORDER.filter((k) => k !== "UNKNOWN");
  return (
    <div style={S.drawerWrap} onClick={onClose}>
      <aside style={S.drawer} onClick={(e) => e.stopPropagation()}>
        <header style={S.drawerHead}>
          <div><div style={S.eyebrow}>{person.loaner ? "Loaner" : person.prospective ? "Prospective" : "Core team"}{person.lead ? " · Lead" : ""}</div><h3 style={S.drawerName}>{person.name}</h3></div>
          <button className="xbtn" style={S.xbtn} onClick={onClose}>✕</button>
        </header>
        <div style={S.drawerControls}>
          <button className="chip" style={S.chip(person.lead, LEAD_ACCENT)} onClick={() => toggleLead(person.name)}>{person.lead ? "★ Lead" : "Mark as lead"}</button>
        </div>
        <div style={{ padding: "10px 22px 0" }}>
          <label style={{ ...S.mono, display: "block", marginBottom: 6 }}>Role / Title</label>
          <input className="txt" style={S.input} value={person.role || ""} placeholder="e.g. MCx Tech" onChange={(e) => setRole(person.name, e.target.value)} />
        </div>
        <div style={S.drawerHint}>Tap a status to set the week · "Split days" for individual PTO days</div>
        <div style={S.drawerList}>
          {weeks.map((w, i) => {
            const cell = person.weeks[i];
            const split = isSplit(cell);
            const st = weekStatus(cell);
            return (
              <div key={w} style={S.drawerRow}>
                <div style={S.drawerWeekRow}>
                  <span style={S.drawerWeek}>{w.replace("Wk ", "")}</span>
                  <button className="chip" style={S.chip(split, "#6AA4D9")} onClick={() => split ? unsplitWeek(person.name, i) : splitWeek(person.name, i)}>{split ? "◱ Whole week" : "Split days"}</button>
                </div>
                {!split ? (
                  <div style={S.drawerChips}>{STATUSES.map((k) => (
                    <button key={k} onClick={() => setCell(person.name, i, k)} className="chip" style={S.chip(st.key === k, STATUS[k].color)}>{STATUS[k].label}</button>
                  ))}</div>
                ) : (
                  <div style={S.dayGridDrawer}>
                    {DAYS.map((d) => { const dst = normalize(cell.days[d] || ""); return (
                      <div key={d} style={S.dayRowDrawer}>
                        <span style={S.dayLbl}>{d}</span>
                        <div style={S.dayChips}>{STATUSES.map((k) => (
                          <button key={k} onClick={() => setDayCell(person.name, i, d, k)} className="chip" style={{ ...S.chip(dst.key === k, STATUS[k].color), padding: "3px 7px", fontSize: 10 }}>{STATUS[k].label}</button>
                        ))}</div>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={S.drawerFoot}>
          {!confirmDel
            ? <button className="delbtn" style={S.delBtn} onClick={() => setConfirmDel(true)}>Remove from team</button>
            : <div style={S.confirmRow}><span style={S.mono}>Remove {person.name}?</span><button className="chip" style={S.chip(true, "#D96A6A")} onClick={() => { removePerson(person.name); onClose(); }}>Confirm</button><button className="chip" style={S.chip(false, MUTE)} onClick={() => setConfirmDel(false)}>Cancel</button></div>}
        </div>
      </aside>
    </div>
  );
}

// ---- Add person -------------------------------------------------------------
function AddPersonDialog({ onClose, onAdd }) {
  const [name, setName] = useState(""); const [role, setRole] = useState("");
  const [lead, setLead] = useState(false); const [loaner, setLoaner] = useState(false); const [prospective, setProspective] = useState(false);
  const canAdd = name.trim().length > 0;
  return (
    <div style={S.drawerWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <header style={S.drawerHead}><div><div style={S.eyebrow}>Roster</div><h3 style={S.drawerName}>Add person</h3></div><button className="xbtn" style={S.xbtn} onClick={onClose}>✕</button></header>
        <div style={S.modalBody}>
          <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="txt" style={S.input} placeholder="Full name" /></Field>
          <Field label="Role"><input value={role} onChange={(e) => setRole(e.target.value)} className="txt" style={S.input} placeholder="e.g. MCx Tech" /></Field>
          <div style={S.toggleRow}>
            <button className="chip" style={S.chip(lead, LEAD_ACCENT)} onClick={() => setLead((v) => !v)}>Lead</button>
            <button className="chip" style={S.chip(loaner, LOANER_ACCENT)} onClick={() => { setLoaner((v) => !v); if (!loaner) setProspective(false); }}>Loaner / Temp</button>
            <button className="chip" style={S.chip(prospective, "#9B7FD4")} onClick={() => { setProspective((v) => !v); if (!prospective) setLoaner(false); }}>Prospective</button>
          </div>
          <div style={S.modalHint}><span style={S.mono}>{prospective ? "Prospective people sit in their own roster section and don't count toward coverage until you Activate them." : "New people start with a blank 18-week schedule (all onsite). Open them from the roster to set their rotation."}</span></div>
        </div>
        <div style={S.modalFoot}><button className="chip" style={S.chip(false, MUTE)} onClick={onClose}>Cancel</button><button className="addbtn" style={{ ...S.addBtn, opacity: canAdd ? 1 : 0.4, pointerEvents: canAdd ? "auto" : "none" }} onClick={() => onAdd({ name: name.trim(), role: role.trim(), lead, loaner, prospective })}>Add to roster</button></div>
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div style={S.field}><label style={{ ...S.mono, display: "block", marginBottom: 6 }}>{label}</label>{children}</div>; }

// ============================================================================
// STYLES
// ============================================================================
const INK = "#0C1014", PANEL = "#141A21", PANEL2 = "#1A222B", LINE = "#232C36", TXT = "#D7DEE6", MUTE = "#79858F", AMBER = "#E8B14C";
const SK_COLORS = ["#1A222B", "#E8B14C55", "#6AA4D9", "#5BB98C"];
const mono = { fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace", fontSize: 11, letterSpacing: "0.04em", color: MUTE };

const S = {
  shell: { minHeight: "100%", background: INK, color: TXT, fontFamily: "'Inter',system-ui,sans-serif", display: "flex", flexDirection: "column" },
  mono,
  masthead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "22px 24px 16px", borderBottom: `1px solid ${LINE}` },
  markRow: { display: "flex", alignItems: "center", gap: 9 },
  mark: { width: 11, height: 11, background: AMBER, borderRadius: 2, boxShadow: `0 0 12px ${AMBER}88`, display: "inline-block" },
  mastTitle: { fontSize: 19, fontWeight: 800, letterSpacing: "0.14em", color: "#F2F5F8" },
  mastTitleThin: { fontSize: 19, fontWeight: 300, letterSpacing: "0.14em", color: MUTE },
  mastSub: { ...mono, marginTop: 6, marginLeft: 20 },
  mastR: { display: "flex", alignItems: "center", gap: 8 },
  saveDot: (s) => ({ width: 7, height: 7, borderRadius: "50%", background: s ? AMBER : "#5BB98C", transition: "background .3s", boxShadow: `0 0 8px ${s ? AMBER : "#5BB98C"}` }),

  tabs: { display: "flex", gap: 2, padding: "0 24px", borderBottom: `1px solid ${LINE}`, background: INK, flexWrap: "wrap" },
  tab: (on) => ({ position: "relative", background: "none", border: "none", cursor: "pointer", padding: "13px 16px", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: on ? "#F2F5F8" : MUTE, borderBottom: `2px solid ${on ? AMBER : "transparent"}`, marginBottom: -1, transition: "color .15s" }),
  badge: { marginLeft: 6, background: "#D96A6A", color: "#fff", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 5px", verticalAlign: "middle" },

  scrub: { display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `1px solid ${LINE}`, background: PANEL },
  scrubBtn: { background: PANEL2, border: `1px solid ${LINE}`, color: TXT, width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 16, flexShrink: 0 },
  scrubTrack: { display: "flex", gap: 3, overflowX: "auto", flex: 1, paddingBottom: 2 },
  weekPip: (on, isNow) => ({ position: "relative", flexShrink: 0, minWidth: 46, height: 30, borderRadius: 5, cursor: "pointer", border: `1px solid ${on ? AMBER : isNow ? "#5BB98C" : LINE}`, background: on ? `${AMBER}1A` : isNow ? "#5BB98C14" : PANEL2, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .12s" }),
  weekPipLabel: (on) => ({ ...mono, fontSize: 10, color: on ? AMBER : MUTE, fontWeight: on ? 700 : 400 }),
  weekPipNow: { position: "absolute", top: -7, ...mono, fontSize: 7, fontWeight: 700, textTransform: "uppercase", color: "#5BB98C", background: INK, padding: "0 3px", letterSpacing: "0.05em" },

  main: { flex: 1, padding: "24px", maxWidth: 1180, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  mainWide: { flex: 1, padding: "24px", maxWidth: 1700, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  boardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 14 },
  eyebrow: { ...mono, color: AMBER, fontSize: 10, textTransform: "uppercase", marginBottom: 4 },
  h2: { margin: 0, fontSize: 24, fontWeight: 700, color: "#F2F5F8", letterSpacing: "-0.01em" },
  legendRow: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendCount: { ...mono, color: TXT, fontWeight: 700, fontSize: 12 },

  boardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 },
  bldCard: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" },
  bldHead: { display: "flex", alignItems: "center", gap: 9, padding: "13px 15px", borderBottom: `1px solid ${LINE}`, background: PANEL2 },
  bldTick: { width: 4, height: 16, borderRadius: 2 },
  bldName: { fontWeight: 700, fontSize: 14, color: "#F2F5F8", letterSpacing: "0.03em" },
  bldCount: { ...mono, marginLeft: "auto", color: MUTE },
  prow: { display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", cursor: "pointer", borderBottom: `1px solid ${LINE}22` },
  prowDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  prowName: { fontSize: 13.5, color: TXT },
  prowStatus: { ...mono, marginLeft: "auto", fontSize: 11, fontWeight: 600 },

  tlWrap: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 14px 16px", overflowX: "auto" },
  tlScale: { display: "flex", alignItems: "stretch" },
  tlNameCol: { width: 130, flexShrink: 0 },
  tlStrip: { display: "flex", gap: 3, flex: 1, minWidth: 540 },
  tlTick: (on) => ({ ...mono, flex: 1, textAlign: "center", padding: "8px 0 6px", color: on ? AMBER : MUTE, fontSize: 9, fontWeight: on ? 700 : 400 }),
  tlGroup: { marginTop: 6 },
  tlGroupLabel: { display: "flex", alignItems: "center", gap: 7, ...mono, color: TXT, fontSize: 11, textTransform: "uppercase", fontWeight: 700, padding: "10px 0 6px", letterSpacing: "0.06em" },
  tlRow: { display: "flex", alignItems: "center", cursor: "pointer", padding: "3px 0" },
  tlName: { width: 130, flexShrink: 0, fontSize: 12.5, color: TXT, paddingRight: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  tlCell: (color, on) => ({ flex: 1, height: 22, borderRadius: 3, background: color, opacity: on ? 1 : 0.82, outline: on ? `2px solid ${AMBER}` : "none", outlineOffset: -1, transition: "opacity .12s" }),

  addBtn: { background: `${AMBER}18`, border: `1px solid ${AMBER}`, color: AMBER, padding: "8px 15px", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" },
  addBtnSm: { background: `${AMBER}18`, border: `1px solid ${AMBER}`, color: AMBER, width: 38, borderRadius: 7, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 },
  activateBtn: { background: "#9B7FD418", border: "1px solid #9B7FD4", color: "#9B7FD4", padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" },
  fillHint: { padding: "10px 14px", background: `${AMBER}10`, border: `1px solid ${AMBER}44`, borderRadius: 8, marginBottom: 14 },

  taskCreate: { display: "flex", gap: 8, flexWrap: "wrap" },
  dayGrid: { display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 },
  dayCol: { flex: "1 1 0", minWidth: 160, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" },
  dayHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${LINE}`, background: PANEL2 },
  dayName: { fontWeight: 800, fontSize: 14, color: "#F2F5F8", letterSpacing: "0.04em" },
  dayBody: { padding: 10, display: "flex", flexDirection: "column", gap: 8, flex: 1 },
  tcard: { background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 11px", cursor: "pointer", transition: "border-color .12s" },
  tcardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  tbTag: { ...mono, fontSize: 9, fontWeight: 700, border: "1px solid", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.05em" },
  tStatus: { ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase" },
  tcardTitle: { fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 },
  tField: { ...mono, fontSize: 10.5, color: TXT, display: "flex", gap: 6, marginTop: 3, lineHeight: 1.4 },
  tFieldLbl: { color: MUTE, fontWeight: 700, flexShrink: 0, minWidth: 34 },
  tChips: { display: "flex", flexWrap: "wrap", gap: 4, margin: "5px 0 2px" },
  dayAdd: { background: "transparent", border: `1px dashed ${LINE}`, color: MUTE, padding: "8px", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", marginTop: 2 },
  editorBody: { overflowY: "auto", padding: "16px 22px", flex: 1 },
  editorRow: { display: "flex", gap: 14, marginBottom: 14 },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  genPreview: { maxHeight: 260, overflowY: "auto", background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 8, padding: 8, marginTop: 6 },
  genDay: { marginBottom: 8 },
  genDayHead: { ...mono, color: AMBER, fontSize: 10, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 },
  genTask: { fontSize: 12.5, color: TXT, padding: "3px 0 3px 10px", borderLeft: `2px solid ${LINE}` },

  thisWeekBadge: { ...mono, fontSize: 9, fontWeight: 700, color: "#0B1017", background: AMBER, borderRadius: 4, padding: "2px 7px", marginLeft: 10, letterSpacing: "0.08em", verticalAlign: "middle" },
  weekRail: { display: "flex", alignItems: "center", gap: 6, padding: "10px 0 16px", overflowX: "auto" },
  railPip: (on, tag) => ({ flexShrink: 0, position: "relative", minWidth: 52, height: 40, borderRadius: 7, cursor: "pointer", border: `1px solid ${on ? AMBER : tag ? AMBER + "55" : LINE}`, background: on ? `${AMBER}1A` : PANEL2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }),
  railPipLabel: (on) => ({ ...mono, fontSize: 11, color: on ? AMBER : TXT, fontWeight: on ? 700 : 500 }),
  railTag: (tag) => ({ ...mono, fontSize: 7.5, fontWeight: 700, textTransform: "uppercase", color: tag === "now" ? "#5BB98C" : AMBER, letterSpacing: "0.06em" }),
  railAdd: { flexShrink: 0, height: 40, borderRadius: 7, border: `1px dashed ${AMBER}88`, background: "transparent", color: AMBER, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: "inherit", padding: "0 12px" },
  statusPill: (c) => ({ ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: c, background: `${c}18`, border: `1px solid ${c}55`, borderRadius: 20, padding: "2px 8px", cursor: "pointer" }),
  sgCompose: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: 14 },
  sgTextarea: { width: "100%", minHeight: 70, background: PANEL2, border: `1px solid ${LINE}`, color: TXT, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", outline: "none" },
  sgComposeFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexWrap: "wrap", gap: 8 },
  sgRow: { display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 14px", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, marginBottom: 8 },
  sgVote: { display: "flex", flexDirection: "column", alignItems: "center", gap: 1, minWidth: 40, padding: "6px 0", border: `1px solid ${LINE}`, borderRadius: 8, background: PANEL2, color: TXT, cursor: "pointer", flexShrink: 0 },
  sgVoteN: { ...mono, fontSize: 12, color: TXT, fontWeight: 700 },
  sgText: { fontSize: 14, color: "#F2F5F8", lineHeight: 1.4, whiteSpace: "pre-wrap" },
  sgMeta: { display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" },
  archiveWrap: { marginTop: 20, borderTop: `1px solid ${LINE}`, paddingTop: 12 },
  archiveToggle: { background: "none", border: "none", color: MUTE, cursor: "pointer", fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 0", fontFamily: "inherit" },
  archiveList: { marginTop: 8, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" },
  archiveRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${LINE}22` },
  skGroupTh: { ...mono, textTransform: "uppercase", fontSize: 10, fontWeight: 700, padding: "10px 8px 6px", textAlign: "center", background: PANEL2, letterSpacing: "0.06em" },
  skEditGroup: { display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" },
  dcrTable: { borderCollapse: "collapse", minWidth: 640 },
  dcrNameTd: { padding: "8px 12px", borderBottom: `1px solid ${LINE}22`, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 },
  dcrNameInput: { background: PANEL2, border: `1px solid ${LINE}`, color: "#F2F5F8", borderRadius: 6, padding: "7px 10px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", width: 150 },
  dcrCheck: (on, c) => ({ width: 30, height: 30, borderRadius: 7, border: `1px solid ${on ? c : LINE}`, background: on ? `${c}22` : "transparent", color: c, cursor: "pointer", fontSize: 15, fontWeight: 800, fontFamily: "inherit", lineHeight: 1 }),
  dcrReadyBadge: { ...mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", color: TEAM_ACCENT, background: `${TEAM_ACCENT}1A`, border: `1px solid ${TEAM_ACCENT}66`, borderRadius: 20, padding: "2px 7px" },
  skGroupInput: { background: INK, border: `1px solid ${LINE}`, color: TXT, borderRadius: 5, padding: "3px 6px", fontSize: 11, fontFamily: "inherit", width: 90, textTransform: "none" },
  skEditCol: { display: "inline-flex", alignItems: "center", gap: 2 },
  skColInput: { background: INK, border: `1px solid ${LINE}`, color: TXT, borderRadius: 5, padding: "3px 5px", fontSize: 10, fontFamily: "inherit", width: 66, textTransform: "none" },
  contactRow: { display: "grid", gridTemplateColumns: "1.1fr 1fr 1.3fr 1fr 1.2fr auto auto", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${LINE}22`, alignItems: "center" },
  cInput: { background: PANEL2, border: `1px solid ${LINE}`, color: TXT, borderRadius: 6, padding: "7px 9px", fontSize: 12.5, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  cView: { fontSize: 12.5, color: TXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cLink: { color: "#6AA4D9", textDecoration: "none" },
  miniEdit: { background: "transparent", border: "none", color: MUTE, cursor: "pointer", fontSize: 13, padding: "4px 6px", flexShrink: 0 },
  folderName: { background: "transparent", border: `1px solid transparent`, color: "#F2F5F8", borderRadius: 6, padding: "4px 8px", fontSize: 14, fontWeight: 700, fontFamily: "inherit", flex: 1 },

  taskCard: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, marginBottom: 8, overflow: "hidden" },
  taskTop: { display: "flex", alignItems: "center", gap: 11, padding: "12px 14px" },
  taskCheck: (on) => ({ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `1px solid ${on ? TEAM_ACCENT : LINE}`, background: on ? TEAM_ACCENT : "transparent", color: "#0B1017", cursor: "pointer", fontWeight: 700, fontSize: 12 }),
  taskTitle: { fontSize: 14, color: "#F2F5F8", fontWeight: 600 },
  taskMeta: { display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" },
  assigneeRow: { display: "flex", gap: 4, flexWrap: "wrap" },
  assigneeChip: { ...mono, background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 20, padding: "2px 8px", color: TXT, fontSize: 10 },
  miniDel: { background: "transparent", border: "none", color: MUTE, cursor: "pointer", fontSize: 14, padding: "4px 6px", flexShrink: 0 },
  assignPanel: { padding: "4px 14px 14px", borderTop: `1px solid ${LINE}22` },
  assignGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 },

  rosterTable: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" },
  rosterHeadRow: { display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr", padding: "12px 16px", ...mono, textTransform: "uppercase", borderBottom: `1px solid ${LINE}`, background: PANEL2, gap: 10 },
  rosterRow: { display: "grid", gridTemplateColumns: "1.4fr 1.6fr 1fr", padding: "11px 16px", borderBottom: `1px solid ${LINE}22`, alignItems: "center", gap: 10 },
  rosterName: { fontWeight: 600, fontSize: 13.5, color: "#F2F5F8", cursor: "pointer", display: "flex", alignItems: "center" },
  rosterMuted: { fontSize: 12.5, color: MUTE },
  leadDot: { width: 6, height: 6, borderRadius: "50%", background: AMBER, marginLeft: 6, display: "inline-block" },
  pill: (c) => ({ ...mono, color: c, border: `1px solid ${c}55`, background: `${c}14`, padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600 }),

  skillScroll: { overflowX: "auto", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10 },
  skillTable: { borderCollapse: "collapse", width: "100%", minWidth: 720 },
  skTh: { ...mono, color: MUTE, textTransform: "uppercase", fontSize: 9.5, padding: "12px 8px", textAlign: "center", borderBottom: `1px solid ${LINE}`, background: PANEL2, whiteSpace: "nowrap" },
  skNameTh: { textAlign: "left", position: "sticky", left: 0, background: PANEL2, minWidth: 140 },
  skName: { fontSize: 13, color: "#F2F5F8", fontWeight: 600, padding: "8px 12px", borderBottom: `1px solid ${LINE}22`, position: "sticky", left: 0, background: PANEL, whiteSpace: "nowrap" },
  skCellTd: { textAlign: "center", padding: "6px 8px", borderBottom: `1px solid ${LINE}22` },
  skCell: (lvl) => ({ width: 34, height: 30, borderRadius: 6, border: `1px solid ${lvl > 0 ? "transparent" : LINE}`, background: SK_COLORS[lvl], color: lvl >= 2 ? "#0B1017" : MUTE, cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "'JetBrains Mono',monospace", transition: "all .12s" }),
  skCoverage: (c) => ({ ...mono, color: c > 0 ? "#5BB98C" : MUTE, fontWeight: 700, fontSize: 13 }),
  profLegend: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14, alignItems: "center" },

  microGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 },
  microCard: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" },
  microHead: { padding: "11px 14px", borderBottom: `1px solid ${LINE}`, background: PANEL2 },
  microDay: { fontWeight: 800, fontSize: 13, color: AMBER, letterSpacing: "0.06em" },
  microList: { listStyle: "none", margin: 0, padding: "10px 14px", flex: 1 },
  microItem: { fontSize: 13, color: TXT, padding: "5px 0", borderBottom: `1px solid ${LINE}22`, paddingLeft: 14, position: "relative" },
  microSupport: { padding: "10px 14px", borderTop: `1px solid ${LINE}22`, background: "#10151B" },
  noteBox: { marginTop: 16, padding: "12px 14px", background: PANEL2, border: `1px solid ${LINE}`, borderRadius: 8 },

  hubCard: { background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 },
  hubCardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: `1px solid ${LINE}`, background: PANEL2 },
  hubCardTitle: { fontWeight: 700, fontSize: 14, color: "#F2F5F8" },
  hubHint: { padding: "10px 16px", borderTop: `1px solid ${LINE}22` },
  remRow: { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", cursor: "pointer", borderBottom: `1px solid ${LINE}22` },
  remCheck: (on) => ({ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `1px solid ${on ? "#5BB98C" : LINE}`, background: on ? "#5BB98C" : "transparent", color: "#0B1017", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12 }),

  linkRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${LINE}22` },
  linkA: { color: TXT, textDecoration: "none", fontSize: 13.5, fontWeight: 600, flexShrink: 0, minWidth: 150 },
  linkInput: { flex: 1, background: PANEL2, border: `1px solid ${LINE}`, color: TXT, borderRadius: 6, padding: "6px 9px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace" },
  linkAdd: { display: "flex", gap: 8, padding: "12px 16px" },
  input: { background: PANEL2, border: `1px solid ${LINE}`, color: TXT, borderRadius: 7, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" },

  needList: { padding: "6px 4px" },
  needRow: { display: "flex", gap: 11, padding: "10px 14px", alignItems: "flex-start" },
  needDot: { width: 7, height: 7, borderRadius: "50%", background: LOANER_ACCENT, marginTop: 5, flexShrink: 0 },
  needTitle: { fontSize: 13.5, color: "#F2F5F8", fontWeight: 600 },
  needDesc: { ...mono, marginTop: 2, lineHeight: 1.5 },

  drawerWrap: { position: "fixed", inset: 0, background: "#000A", display: "flex", justifyContent: "flex-end", zIndex: 40, backdropFilter: "blur(2px)" },
  drawer: { width: "min(440px,100%)", height: "100%", background: PANEL, borderLeft: `1px solid ${LINE}`, display: "flex", flexDirection: "column", animation: "slideIn .22s ease" },
  drawerHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 22px", borderBottom: `1px solid ${LINE}` },
  drawerName: { margin: "4px 0 0", fontSize: 20, fontWeight: 700, color: "#F2F5F8" },
  xbtn: { background: PANEL2, border: `1px solid ${LINE}`, color: TXT, width: 32, height: 32, borderRadius: 7, cursor: "pointer", fontSize: 13 },
  drawerControls: { display: "flex", alignItems: "center", gap: 10, padding: "14px 22px 4px" },
  drawerHint: { ...mono, padding: "12px 22px 4px" },
  drawerList: { overflowY: "auto", padding: "8px 14px 14px", flex: 1 },
  drawerRow: { padding: "10px 8px", borderBottom: `1px solid ${LINE}22` },
  drawerWeekRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  dayGridDrawer: { display: "flex", flexDirection: "column", gap: 5, marginTop: 4, paddingLeft: 4, borderLeft: `2px solid #6AA4D944` },
  dayRowDrawer: { display: "flex", alignItems: "center", gap: 8 },
  dayLbl: { ...mono, width: 30, flexShrink: 0, color: TXT, fontWeight: 700 },
  dayChips: { display: "flex", flexWrap: "wrap", gap: 3 },
  drawerWeek: { ...mono, color: TXT, fontSize: 12, fontWeight: 700, display: "block", marginBottom: 7 },
  drawerChips: { display: "flex", flexWrap: "wrap", gap: 5 },
  chip: (on, c) => ({ border: `1px solid ${on ? c : LINE}`, background: on ? `${c}22` : "transparent", color: on ? c : MUTE, padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11.5, fontWeight: on ? 700 : 500, transition: "all .12s", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }),
  drawerFoot: { padding: "14px 22px", borderTop: `1px solid ${LINE}` },
  delBtn: { background: "transparent", border: `1px solid ${LINE}`, color: "#D96A6A", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontFamily: "inherit" },
  confirmRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },

  modal: { width: "min(440px,100%)", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, margin: "auto", alignSelf: "center", animation: "pop .18s ease" },
  modalBody: { padding: "18px 22px" },
  field: { marginBottom: 14 },
  toggleRow: { display: "flex", gap: 8, marginTop: 4 },
  modalHint: { marginTop: 16, padding: "10px 12px", background: PANEL2, borderRadius: 8, border: `1px solid ${LINE}` },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: `1px solid ${LINE}` },

  footer: { padding: "14px 24px", borderTop: `1px solid ${LINE}`, background: PANEL },
};
// input default width fix for full-width fields
S.field.width = "100%";

const CSS = `
  * { box-sizing: border-box; }
  input, select { width: 100%; }
  .tabbtn:hover { color: #D7DEE6 !important; }
  .scrubBtn:not(:disabled):hover { border-color: ${AMBER} !important; }
  .scrubBtn:disabled { opacity: .35; cursor: not-allowed; }
  .weekpip:hover { border-color: ${AMBER}99 !important; }
  .prow:hover, .tlrow:hover { background: ${PANEL2}; }
  .taskcard:hover { border-color: ${AMBER} !important; }
  .statuspill:hover { filter: brightness(1.3); }
  .xbtn:hover, .chip:hover, .addbtn:hover, .delbtn:hover, .skcell:hover { border-color: ${AMBER} !important; }
  .rname:hover { color: ${AMBER} !important; }
  .txt:focus, input:focus, select:focus { outline: none; border-color: ${AMBER} !important; }
  @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes pop { from { transform: scale(.97); opacity: 0; } to { transform: none; opacity: 1; } }
  ::-webkit-scrollbar { height: 8px; width: 8px; }
  ::-webkit-scrollbar-thumb { background: ${LINE}; border-radius: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  @media (max-width: 640px) {
    .rosterHeadRow, .rosterRow { grid-template-columns: 1.5fr 1fr !important; }
  }
`;
