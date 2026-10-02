"use client";

import { demoFixtures, opportunityStages, type InquiryRecord, type LeadRecord, type OpportunityRecord, type QualificationAnalysis, type QualificationFields } from "@ake/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const appPath = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
export async function workflowApi(path: string, body?: object) {
  const response = await fetch(appPath(`/api/backend/api/v1/${path}`), {
    ...(body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Request failed (${response.status})`);
  return result;
}

export function SalesInbox({ leads, onCreate }: { leads: LeadRecord[]; onCreate: (lead: LeadRecord) => void }) {
  const router = useRouter();
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [loading, setLoading] = useState(true);
  const fingerprint = useRef("");
  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const data: InquiryRecord[] = await workflowApi("inbox");
        if (stopped) return;
        setInquiries(data); setError(""); setLoading(false);
        const next = data.map((item) => `${item.id}:${item.status}`).join(",");
        if (fingerprint.current && next !== fingerprint.current) router.refresh();
        fingerprint.current = next;
        setSelected((id) => id || data.find((item) => item.conversationId === "fixture:gcc")?.id || data[0]?.id || "");
      } catch (cause) { if (!stopped) { setError(cause instanceof Error ? cause.message : "Inbox unavailable"); setLoading(false); } }
    }
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [router]);
  const current = inquiries.find((item) => item.id === selected);
  const lead = leads.find((item) => item.id === current?.leadId);
  const analysis = current?.analysis;
  return <>
    <div className="workflow-toolbar"><span>Website conversations · Email and WhatsApp fixtures are Mock</span><button className="primary-button" onClick={() => setShowComposer(!showComposer)}>New demo inquiry</button></div>
    {showComposer && <InquiryComposer onCreated={(item) => { setSelected(item.id); setInquiries((all) => [item, ...all]); setShowComposer(false); router.refresh(); }} />}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="sales-inbox">
      <nav className="conversation-list" aria-label="Conversations">
        {loading && <p>Loading conversations…</p>}
        {!loading && !inquiries.length && <p>No inquiries yet. Create a demo inquiry to start.</p>}
        {inquiries.map((item) => <button key={item.id} className={selected === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}>
          <span className="conversation-meta">{item.channel}{item.conversationId.startsWith("fixture:") ? " · Mock fixture" : ""}</span>
          <strong>{item.displayName}</strong><span>{item.analysis?.summary || "Awaiting analysis"}</span>
          <small className={`intent-${item.analysis?.intent || "unknown"}`}>{item.analysis?.intent || item.status} {item.analysis?.leadScore !== null && item.analysis?.leadScore !== undefined ? `· ${item.analysis.leadScore}/100` : ""}</small>
        </button>)}
      </nav>
      <section className="conversation-detail" data-inquiry-id={current?.id}>
        {current ? <><div className="conversation-heading"><h3>{current.displayName}</h3><span>{current.isTest ? "Fictional demo" : "Website inquiry"}</span></div>
          <p className="message-bubble">{current.message}</p>
          <small className="message-time">{new Date(current.occurredAt).toLocaleString()}</small>
          <div className="analysis-summary"><span className="eyebrow">Inquiry analysis</span><h3>{current.status === "analyzed" ? "Suggested project profile" : current.status === "failed" ? "Analysis needs attention" : "Analyzing inquiry…"}</h3>
            <p>{analysis?.summary || current.error || "Your inquiry has been saved. Analysis will appear automatically."}</p>
            {analysis && <><span className="mode-label">{current.modelProvider === "mock" ? "Mock · deterministic fixture" : `AI · ${current.modelProvider}`}</span><p><strong>Next action</strong><br />{analysis.nextAction}</p>
              <details><summary>Source evidence ({analysis.evidence.length})</summary>{analysis.evidence.map((item, index) => <blockquote key={index}><small>{item.field} · {item.kind}</small><p>“{item.quote}”</p></blockquote>)}</details>
              <small>Intent is an AI suggestion. Qualified requires a separate human decision.</small></>}
          </div>
          {current.conversationId.startsWith("chatwoot:") && <a className="secondary-button" href={`${process.env.NEXT_PUBLIC_CHATWOOT_APP_URL || ""}/accounts/1/conversations/${current.conversationId.split(":").at(-1)}`} target="_blank" rel="noreferrer">Open original conversation ↗</a>}
        </> : <p>Select an inquiry to view its message and analysis.</p>}
      </section>
      <aside className="sales-profile">
        {analysis && lead ? <><QualificationEditor key={`${current?.id}:${lead.qualificationRevision || 0}`} lead={lead} analysis={analysis} />
          <button className="primary-button full" onClick={() => onCreate(lead)}>Create opportunity</button>
          <small>Creates a discovery-stage opportunity. Qualification is reviewed in the pipeline.</small>
        </> : <p>Project fields will appear after analysis.</p>}
      </aside>
    </div>
  </>;
}

function InquiryComposer({ onCreated }: { onCreated: (inquiry: InquiryRecord) => void }) {
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("Demo Visitor");
  const [channel, setChannel] = useState("website");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const eventId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { onCreated(await workflowApi("inbox", { eventId: `operator:${eventId.current}`, conversationId: `operator:${eventId.current}`, channel, displayName, message, isTest: true, occurredAt: new Date().toISOString() })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Inquiry could not be saved"); }
    finally { setBusy(false); }
  }
  return <form className="inquiry-composer" onSubmit={submit}>
    <div className="fixture-buttons">{demoFixtures.map((item) => <button type="button" className="secondary-button" key={item.key} onClick={() => { setMessage(item.message); setDisplayName(item.displayName); setChannel(item.channel); }}>{item.title}</button>)}</div>
    <div className="form-grid"><label>Demo name<input required maxLength={120} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label><label>Demo channel<select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="website">Website</option><option value="email">Email · Mock</option><option value="whatsapp">WhatsApp · Mock</option></select></label></div>
    <label>Fictional inquiry<textarea required maxLength={6000} rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Paste a fictional B2B inquiry…" /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Receive and analyze"}</button>
  </form>;
}

function QualificationEditor({ lead, analysis }: { lead: LeadRecord; analysis: QualificationAnalysis }) {
  const router = useRouter();
  const [fields, setFields] = useState<QualificationFields>(lead.confirmedQualification || analysis);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try { await workflowApi(`leads/${lead.id}/review`, { fields, expectedRevision: lead.qualificationRevision || 0 }); setNotice("Reviewed fields saved to Lead."); router.refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not save review"); }
    finally { setBusy(false); }
  }
  return <form className="qualification-editor" onSubmit={submit}>
    <div className="section-heading"><h3>Lead profile</h3><span className="mode-label">{lead.confirmedQualification ? `Reviewed · r${lead.qualificationRevision}` : "AI draft"}</span></div>
    {([['company', 'Company'], ['country', 'Country'], ['city', 'City'], ['projectType', 'Project type']] as const).map(([key, label]) => <label key={key}>{label}<input value={fields[key] || ""} placeholder="Not provided" maxLength={300} onChange={(e) => setFields({ ...fields, [key]: e.target.value || null })} /></label>)}
    <label>Parking spaces<input type="number" min={0} max={10000000} value={fields.parkingSpaces ?? ""} placeholder="Not provided" onChange={(e) => setFields({ ...fields, parkingSpaces: e.target.value === "" ? null : Number(e.target.value) })} /></label>
    <label>Product need<input value={fields.products.join(", ")} onChange={(e) => setFields({ ...fields, products: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} /></label>
    <label>Intent<select value={fields.intent} onChange={(e) => setFields({ ...fields, intent: e.target.value as QualificationFields["intent"] })}>{['high', 'medium', 'low', 'unknown'].map((item) => <option key={item}>{item}</option>)}</select></label>
    <label>Next action<textarea rows={3} required minLength={2} maxLength={600} value={fields.nextAction} onChange={(e) => setFields({ ...fields, nextAction: e.target.value })} /></label>
    <button className="secondary-button full" disabled={busy}>{busy ? "Saving…" : "Confirm fields to Lead"}</button>
    {notice && <p role="status">{notice}</p>}
  </form>;
}

export function Pipeline({ opportunities }: { opportunities: OpportunityRecord[] }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [qualifying, setQualifying] = useState<OpportunityRecord | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, any>>>([]);
  const names: Record<string, string> = { discovery: "Discovery", solution_fit: "Solution", quotation: "Quotation / PI", negotiation: "Negotiation", won: "Won", lost: "Lost" };
  useEffect(() => { workflowApi("audit").then(setAudit).catch(() => setAudit([])); }, [opportunities]);
  async function move(item: OpportunityRecord, stage: OpportunityRecord["stage"]) {
    if (busy || item.stage === stage) return;
    setBusy(item.id); setNotice("");
    try { await workflowApi(`opportunities/${item.id}/stage`, { stage, expectedVersion: item.version }); setNotice(`Stage updated to ${names[stage]}.`); router.refresh(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Stage update failed"); router.refresh(); }
    finally { setBusy(""); }
  }
  return <div className="pipeline-wrap">
    <div className="workflow-toolbar"><span>Drag a card or use its stage selector. Human qualification is a separate decision.</span></div>
    {notice && <p className="pipeline-notice" role="status">{notice}</p>}
    <div className="kanban">{opportunityStages.map((stage) => <section key={stage} className="kanban-column" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const item = opportunities.find((entry) => entry.id === event.dataTransfer.getData("text/plain")); if (item) void move(item, stage); }}>
      <h3>{names[stage]} <small>{opportunities.filter((item) => item.stage === stage).length}</small></h3>
      {opportunities.filter((item) => item.stage === stage).map((item) => <article className="opportunity-card" key={item.id} draggable={!busy} onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}>
        <span className="conversation-meta">{item.country}</span><h4>{item.name}</h4><p>{item.direction}</p><p className="next-action">{item.nextAction}</p><small>Owner · {item.ownerId}</small>
        <span className={`mode-label ${item.qualifiedAt ? "qualified" : ""}`}>{item.qualifiedAt ? "Human qualified" : "Awaiting qualification"}</span>
        <label>Stage<select aria-label={`Stage for ${item.name}`} value={item.stage} disabled={!!busy} onChange={(event) => void move(item, event.target.value as OpportunityRecord["stage"])}>{opportunityStages.map((value) => <option key={value} value={value}>{names[value]}</option>)}</select></label>
        {!item.qualifiedAt && <button className="primary-button full" onClick={() => setQualifying(item)}>Review Qualified</button>}
      </article>)}
      {!opportunities.some((item) => item.stage === stage) && <div className="kanban-empty">No opportunities</div>}
    </section>)}</div>
    <div className="activity-timeline"><h3>Activity timeline</h3>{[...audit].sort((a, b) => new Date(b.occurredAt || b.created_at).getTime() - new Date(a.occurredAt || a.created_at).getTime()).slice(0, 12).map((item, index) => <div key={String(item.id || index)}><time>{new Date(item.occurredAt || item.created_at || Date.now()).toLocaleTimeString()}</time><span>{String(item.action).replaceAll(".", " · ").replaceAll("_", " ")}</span><small>{item.actorId || item.actor_id}</small></div>)}{!audit.length && <p>Activity appears as inquiries are reviewed and stages change.</p>}</div>
    {qualifying && <QualificationDialog item={qualifying} onClose={() => setQualifying(null)} onDone={() => { setQualifying(null); setNotice("Human Qualified confirmed. One conversion event was recorded."); router.refresh(); }} />}
  </div>;
}

function QualificationDialog({ item, onClose, onDone }: { item: OpportunityRecord; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError("");
    try {
      await workflowApi(`opportunities/${item.id}/qualify`, { contactReachable: data.get("reachable") === "on", relevantNeed: data.get("need") === "on", targetBuyer: data.get("buyer") === "on", nextAction: data.get("nextAction") });
      await workflowApi("conversion-deliveries/process", {}).catch(() => undefined);
      onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Qualification failed"); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="qualify-title"><div className="modal-head"><div><span className="eyebrow">Human decision</span><h2 id="qualify-title">Confirm Qualified</h2><p>{item.name}</p></div><button className="icon-button" aria-label="Close qualification" onClick={onClose}>×</button></div>
    <form onSubmit={submit} className="human-review"><label><input name="reachable" type="checkbox" required /> Contact is reachable</label><label><input name="need" type="checkbox" required /> A relevant business need is confirmed</label><label><input name="buyer" type="checkbox" required /> Project buyer or channel integrator fits our target</label><label>Owner<input value={item.ownerId} readOnly /></label><label>Next action<textarea name="nextAction" defaultValue={item.nextAction || ""} required minLength={2} maxLength={600} /></label>
      <p>Records one qualified event. Demo feedback remains Mock; no advertising account is contacted.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "Confirming…" : "Confirm Qualified and record event"}</button>
    </form></section></div>;
}
