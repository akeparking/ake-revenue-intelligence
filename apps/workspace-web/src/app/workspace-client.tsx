"use client";

import type { ConversionDeliveryRecord, DashboardSnapshot, LeadRecord, RequirementCommitReceipt, RequirementProfileRecord } from "@ake/contracts";
import {
  ArrowClockwise,
  ArrowUpRight,
  Bell,
  Broadcast,
  CaretDown,
  ChatCircleDots,
  CheckCircle,
  CircleNotch,
  DotsThreeVertical,
  Funnel,
  Gauge,
  GearSix,
  GoogleLogo,
  MagnifyingGlass,
  MetaLogo,
  Package,
  PaperPlaneTilt,
  Plus,
  SidebarSimple,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  UsersThree,
  WarningCircle,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { SalesInbox, Pipeline, appPath, workflowApi } from "./sales-workflow";
import { conversionRate, countryName, formatRelative } from "../lib/format";

type View = "command" | "inbox" | "leads" | "opportunities" | "deliveries" | "orders" | "integrations";
type ProviderFilter = "all" | "meta" | "google" | "organic";

const nav = [
  { id: "command", label: "Command center", icon: SquaresFour },
  { id: "inbox", label: "Unified inbox", icon: ChatCircleDots },
  { id: "leads", label: "Leads", icon: UsersThree },
  { id: "opportunities", label: "Opportunities", icon: Funnel },
  { id: "deliveries", label: "Feedback delivery", icon: Broadcast },
  { id: "orders", label: "Order mirror", icon: Package },
  { id: "integrations", label: "Integrations", icon: GearSix },
] as const;

const statusLabel: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  no_reply: "No reply",
  rejected: "Rejected",
  spam: "Spam",
  merged: "Merged",
  pending: "Pending",
  dispatching: "Dispatching",
  accepted: "API accepted",
  retrying: "Retrying",
  dead_letter: "Needs review",
  skipped: "Skipped",
  matched: "Matched",
  unmatched: "Unmatched",
  warning: "Warning",
  unknown: "Awaiting diagnostics",
};

function ProviderIcon({ provider, size = 18 }: { provider: string; size?: number }) {
  if (provider === "meta") return <MetaLogo size={size} weight="fill" />;
  if (provider === "google") return <GoogleLogo size={size} weight="bold" />;
  if (provider === "organic") return <ChatCircleDots size={size} weight="bold" />;
  return <PaperPlaneTilt size={size} />;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Broadcast size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function WorkspaceClient({ initialData, connected }: { initialData: DashboardSnapshot; connected: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View>("command");
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(initialData.leads[0]?.id || "");
  const [modalLead, setModalLead] = useState<LeadRecord | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [requirementProfile, setRequirementProfile] = useState<RequirementProfileRecord | null>(null);
  const [requirementLoading, setRequirementLoading] = useState(false);

  const selectedLead = initialData.leads.find((lead) => lead.id === selectedLeadId) || initialData.leads[0];
  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialData.leads.filter((lead) => {
      const providerMatch = provider === "all" || lead.provider === provider;
      const queryMatch = !needle || [lead.displayName, lead.companyName, lead.country, lead.emailMasked, lead.phoneMasked].some((value) => value?.toLowerCase().includes(needle));
      return providerMatch && queryMatch;
    });
  }, [initialData.leads, provider, query]);

  useEffect(() => {
    if (!selectedLeadId) return;
    const controller = new AbortController();
    setRequirementLoading(true);
    fetch(appPath(`/api/backend/api/v1/requirements/${selectedLeadId}?conversationId=${encodeURIComponent(`crm:${selectedLeadId}`)}`), { signal: controller.signal })
      .then(async (response) => response.ok ? response.json().catch(() => null) : null)
      .then((profile) => { if (!controller.signal.aborted) setRequirementProfile(profile); })
      .catch(() => { if (!controller.signal.aborted) setRequirementProfile(null); })
      .finally(() => { if (!controller.signal.aborted) setRequirementLoading(false); });
    return () => controller.abort();
  }, [selectedLeadId]);

  async function post(path: string, body?: object) {
    const response = await fetch(appPath(`/api/backend/${path}`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Request failed (${response.status})`);
    return result;
  }

  async function processOutbox() {
    setBusy("process");
    setNotice(null);
    try {
      const result = await post("api/v1/conversion-deliveries/process");
      setNotice(`${result.length} delivery item${result.length === 1 ? "" : "s"} processed.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to process outbox");
    } finally {
      setBusy(null);
    }
  }

  async function syncOkki() {
    setBusy("okki");
    setNotice(null);
    try {
      const result = await post("api/v1/connectors/okki/sync", { limit: 10, includeConverted: true });
      setNotice(`OKKI read-only sync processed ${result.processed} inquiries (${result.activeRead} active, ${result.convertedRead} converted).`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "OKKI sync could not start");
    } finally {
      setBusy(null);
    }
  }

  async function replayDelivery(delivery: ConversionDeliveryRecord) {
    setBusy(delivery.id);
    setNotice(null);
    try {
      await post(`api/v1/conversion-deliveries/${delivery.id}/replay`);
      setNotice("Delivery queued with the original immutable event ID.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to replay delivery");
    } finally {
      setBusy(null);
    }
  }

  async function analyzeRequirement(message: string) {
    if (!selectedLead) return;
    setBusy("requirement");
    setNotice(null);
    try {
      const result = await post("api/v1/requirements/analyze", {
        leadId: selectedLead.id,
        conversationId: `crm:${selectedLead.id}`,
        eventId: `crm-manual:${crypto.randomUUID()}`,
        occurredAt: new Date().toISOString(),
        message,
        scenario: selectedLead.sourceKind === "instant_form" ? "FORM_RESEARCH_OUTBOUND" : "WHATSAPP_FOLLOWUP",
        channel: selectedLead.sourceKind === "instant_form" ? "form" : "whatsapp",
      }) as RequirementCommitReceipt;
      setRequirementProfile(result.profile);
      setNotice(`Requirement turn ${result.status}; project revision ${result.customerProjectRevision} read back from ${result.adapter}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Requirement analysis failed");
    } finally {
      setBusy(null);
    }
  }

  const accepted = initialData.deliveries.filter((item) => item.status === "accepted").length;
  const matched = initialData.deliveries.filter((item) => item.diagnosticStatus === "matched").length;
  const activeTitle = nav.find((item) => item.id === view)?.label || "Command center";
  const panelText = view === "deliveries"
    ? ["Conversion delivery ledger", "Immutable events with retry and diagnostic state."]
    : view === "opportunities"
      ? ["Opportunity pipeline", "Move opportunities through the pipeline and confirm qualification separately."]
      : view === "integrations"
        ? ["Connector control", "Production paths stay official; imports and feedback remain auditable."]
        : view === "orders"
          ? ["Order mirror", "Minimal ERP references without copying inventory or fulfillment data."]
          : view === "inbox"
            ? ["Unified conversation workspace", "Chatwoot owns messages, attachments and assignment."]
            : ["Lead qualification queue", "Exact identities first; ambiguous matches stay in review."];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">AKE</div>
          <div>
            <strong>AI Sales</strong>
            <span>Workspace v0.1</span>
          </div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X /></button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-avatar">AP</span>
          <span><strong>AKE Parking</strong><small>Internal workspace</small></span>
          <CaretDown size={14} />
        </div>
        <nav className="main-nav" aria-label="Primary navigation">
          <span className="nav-section">Workspace</span>
          {nav.slice(0, 5).map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}>
              <item.icon size={18} weight={view === item.id ? "fill" : "regular"} />
              <span>{item.label}</span>
              {"badge" in item && <em>{initialData.leads.length}</em>}
            </button>
          ))}
          <span className="nav-section secondary">Operations</span>
          {nav.slice(5).map((item) => (
            <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setMobileNav(false); }}>
              <item.icon size={18} weight={view === item.id ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="pilot-guardrail">
            <span className="guard-icon"><CheckCircle size={17} weight="fill" /></span>
            <div><strong>Demo workspace</strong><small>Ads feedback stays Mock</small></div>
          </div>
          <div className="user-row">
            <span className="user-avatar">DA</span>
            <span><strong>Demo Admin</strong><small>Workspace admin</small></span>
            <DotsThreeVertical size={17} />
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-trigger" onClick={() => setMobileNav(true)} aria-label="Open navigation"><SidebarSimple /></button>
            <span>{activeTitle}</span>
            <small>/ AKE Parking</small>
          </div>
          <label className="global-search">
            <MagnifyingGlass size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search leads, companies or IDs" />
            <kbd>⌘ K</kbd>
          </label>
          <div className="topbar-actions">
            <span className={`connection-state ${connected ? "online" : "offline"}`}><i />{connected ? "Core online" : "Core offline"}</span>
            <button className="icon-button" aria-label="Notifications"><Bell size={19} /></button>
            <button className="primary-button compact" onClick={() => setModalLead(selectedLead || null)} disabled={!selectedLead}><Plus size={16} weight="bold" /> New opportunity</button>
          </div>
        </header>

        {!connected && (
          <div className="system-banner"><WarningCircle size={18} weight="fill" /><span><strong>Revenue Core is offline.</strong> The interface is safe, but live data and actions are unavailable.</span></div>
        )}
        {notice && <div className="toast" role="status"><CheckCircle size={17} />{notice}<button onClick={() => setNotice(null)}><X size={15} /></button></div>}

        <main className={`content-grid ${["inbox", "opportunities", "integrations", "deliveries"].includes(view) ? "wide-content" : ""} ${view === "inbox" ? "workflow-inbox" : ""}`}>
          <section className="main-column">
            <div className="page-heading">
              <div>
                <span className="eyebrow">Ads-to-revenue control plane</span>
                <h1>{view === "command" ? "Revenue command center" : activeTitle}</h1>
                <p>One operational view from inbound identity to qualified feedback.</p>
              </div>
              <div className="date-control"><Gauge size={17} /><span>Demo workspace</span><CaretDown size={14} /></div>
            </div>

            <div className="metric-strip">
              <div className="metric-item">
                <span>Inbound leads</span><strong>{initialData.metrics.totalLeads}</strong><small><ArrowUpRight size={13} /> Current pilot</small>
              </div>
              <div className="metric-item">
                <span>Qualified</span><strong>{initialData.metrics.qualifiedLeads}</strong><small>{conversionRate(initialData.metrics.qualifiedLeads, initialData.metrics.totalLeads)} of leads</small>
              </div>
              <div className="metric-item">
                <span>Opportunities</span><strong>{initialData.metrics.opportunities}</strong><small>Sales-owned stage</small>
              </div>
              <div className="metric-item health">
                <span>Feedback receipts</span><strong>{accepted}<small> / {initialData.deliveries.length}</small></strong><small>{matched} platform matched</small>
              </div>
            </div>

            <section className="flow-panel">
              <div className="section-heading">
                <div><h2>Qualified feedback flow</h2><p>API acceptance and platform match are measured separately.</p></div>
                <button className="secondary-button" onClick={processOutbox} disabled={busy === "process" || !connected}>
                  {busy === "process" ? <CircleNotch className="spin" size={16} /> : <ArrowClockwise size={16} />} Process outbox
                </button>
              </div>
              <div className="flow-track">
                <FlowStep label="Inbound" value={initialData.metrics.totalLeads} detail="All sources" state="done" />
                <FlowStep label="Qualified" value={initialData.metrics.qualifiedLeads} detail="Human reviewed" state={initialData.metrics.qualifiedLeads ? "done" : "idle"} />
                <FlowStep label="Feedback receipt" value={accepted} detail="Mock or provider receipt" state={accepted ? "done" : "idle"} />
                <FlowStep label="Platform matched" value={matched} detail="Offline diagnostics" state={matched ? "done" : "waiting"} last />
              </div>
            </section>

            <section className="data-panel">
              <div className="section-heading leads-heading">
                <div><h2>{panelText[0]}</h2><p>{panelText[1]}</p></div>
                {!["integrations", "orders", "inbox", "opportunities"].includes(view) && <div className="filter-group">
                  <SlidersHorizontal size={16} />
                  {(["all", "meta", "google", "organic"] as ProviderFilter[]).map((item) => <button key={item} className={provider === item ? "selected" : ""} onClick={() => setProvider(item)}>{item === "all" ? "All" : item}</button>)}
                </div>}
              </div>
              {view === "integrations" ? (
                <IntegrationPanel busy={busy} onSyncOkki={syncOkki} />
              ) : view === "opportunities" ? (
                <Pipeline opportunities={initialData.opportunities} />
              ) : view === "inbox" ? (
                <SalesInbox leads={initialData.leads} onCreate={setModalLead} />
              ) : view === "orders" ? (
                <EmptyState title="No mirrored orders yet" detail="ERPNext sandbox references will appear here after an opportunity is handed to the ERP adapter." />
              ) : view === "deliveries" ? (
                <DeliveryTable deliveries={initialData.deliveries} busy={busy} onReplay={replayDelivery} />
              ) : filteredLeads.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Lead / company</th><th>Source</th><th>Market</th><th>Status</th><th>Received</th><th><span className="sr-only">Actions</span></th></tr></thead>
                    <tbody>
                      {filteredLeads.map((lead) => (
                        <tr key={lead.id} className={selectedLead?.id === lead.id ? "selected-row" : ""} onClick={() => setSelectedLeadId(lead.id)}>
                          <td><div className="lead-cell"><span className="lead-avatar">{lead.displayName.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span><span><strong>{lead.displayName}</strong><small>{lead.companyName || lead.emailMasked || "Individual inquiry"}</small></span></div></td>
                          <td><div className={`provider-cell ${lead.provider}`}><ProviderIcon provider={lead.provider} /><span>{lead.provider === "meta" ? (lead.sourceKind === "ctwa" ? "Meta · CTWA" : "Meta lead form") : lead.provider === "google" ? (lead.sourceKind === "website" ? "Google · Website" : "Google lead form") : "Website chat"}</span></div></td>
                          <td>{countryName(lead.country)}</td>
                          <td><span className={`status-pill ${lead.status}`}>{statusLabel[lead.status]}</span>{lead.mergeReviewRequired && <span className="review-flag">Review merge</span>}</td>
                          <td><span className="muted">{formatRelative(lead.createdAt)}</span></td>
                          <td><button className="row-action" onClick={(event) => { event.stopPropagation(); setModalLead(lead); }} aria-label={`Create opportunity for ${lead.displayName}`}><Plus size={16} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="No leads in this view" detail="Adjust the source filter or wait for the next verified webhook." />}
            </section>
          </section>

          {!["inbox", "opportunities", "integrations", "deliveries"].includes(view) && <aside className="context-rail">
            {selectedLead ? (
              <>
                <div className="context-head"><span>Lead context</span><button className="icon-button"><DotsThreeVertical /></button></div>
                <div className="profile-block">
                  <span className="large-avatar">{selectedLead.displayName.split(" ").slice(0, 2).map((part) => part[0]).join("")}</span>
                  <h2>{selectedLead.displayName}</h2>
                  <p>{selectedLead.companyName || "No company linked"}</p>
                  <div className="context-tags"><span>{countryName(selectedLead.country)}</span><span className={`source-tag ${selectedLead.provider}`}><ProviderIcon provider={selectedLead.provider} size={14} />{selectedLead.provider}</span></div>
                </div>
                <div className="context-section">
                  <div className="context-section-title"><span>Qualification signal</span><strong className={selectedLead.status === "qualified" ? "good" : "pending-text"}>{statusLabel[selectedLead.status]}</strong></div>
                  <dl>
                    <div><dt>Identity</dt><dd>{selectedLead.emailMasked || selectedLead.phoneMasked || "Chat identity"}</dd></div>
                    <div><dt>Source type</dt><dd>{selectedLead.sourceKind.replace("_", " ")}</dd></div>
                    <div><dt>Campaign</dt><dd>{selectedLead.attribution.campaignId ? `…${selectedLead.attribution.campaignId.slice(-10)}` : "Not captured"}</dd></div>
                    <div><dt>Lead ID</dt><dd>{selectedLead.externalLeadId ? `…${selectedLead.externalLeadId.slice(-10)}` : "Not provided"}</dd></div>
                  </dl>
                </div>
                <RequirementPanel
                  key={selectedLead.id}
                  profile={requirementProfile}
                  loading={requirementLoading}
                  busy={busy === "requirement"}
                  onAnalyze={analyzeRequirement}
                />
                <button className="primary-button full" onClick={() => setModalLead(selectedLead)} disabled={selectedLead.status === "qualified"}><Funnel size={17} />{selectedLead.status === "qualified" ? "Opportunity already created" : "Create opportunity"}</button>
                <a className="chatwoot-link" href={process.env.NEXT_PUBLIC_CHATWOOT_APP_URL || "#"}><WhatsappLogo size={17} weight="fill" />Open conversation in Chatwoot<ArrowUpRight size={15} /></a>
              </>
            ) : <EmptyState title="Select a lead" detail="The identity, attribution and next action will appear here." />}
          </aside>}
        </main>
      </div>
      {modalLead && <OpportunityModal lead={modalLead} onClose={() => setModalLead(null)} onSubmit={async (body) => { setBusy("opportunity"); try { const result = await post("api/v1/opportunities", body); setNotice(result.deduplicated ? "This lead already has an opportunity." : "Opportunity created. Review Qualified in the pipeline when ready."); setModalLead(null); router.refresh(); } finally { setBusy(null); } }} busy={busy === "opportunity"} />}
    </div>
  );
}

function IntegrationPanel({ busy, onSyncOkki }: { busy: string | null; onSyncOkki: () => void }) {
  const [connectors, setConnectors] = useState<Array<{ name: string; state: string; detail: string }>>([]);
  const [error, setError] = useState("");
  useEffect(() => { workflowApi("integrations/status").then(setConnectors).catch(() => setError("Unable to read connector status.")); }, []);
  return <div className="connector-list">{error && <p role="alert">{error}</p>}{!connectors.length && !error && <p>Loading connector status…</p>}
    {connectors.map((connector) => <div className="connector-row" key={connector.name}><span className="connector-icon"><Broadcast size={20} /></span><div><strong>{connector.name}</strong><small>{connector.detail}</small></div><em>{connector.state}</em></div>)}
    <div className="connector-guard"><CheckCircle size={17} /><span>Mock receipts demonstrate the workflow. They do not claim advertising attribution or optimization.</span></div>
  </div>;
}

function OpportunityTable({ opportunities, leads }: { opportunities: DashboardSnapshot["opportunities"]; leads: LeadRecord[] }) {
  if (!opportunities.length) return <EmptyState title="No opportunities yet" detail="Qualify a lead to create the first discovery-stage opportunity." />;
  return <div className="table-wrap"><table><thead><tr><th>Opportunity</th><th>Primary source</th><th>Market</th><th>Stage</th><th>Next action</th></tr></thead><tbody>{opportunities.map((item) => {
    const lead = leads.find((entry) => entry.id === item.primarySourceLeadId);
    return <tr key={item.id}><td><strong>{item.name}</strong><small className="table-sub">Owner · {item.ownerId}</small></td><td><div className={`provider-cell ${lead?.provider}`}><ProviderIcon provider={lead?.provider || "manual"} />{lead?.displayName || "Source lead"}</div></td><td>{countryName(item.country)}</td><td><span className="status-pill qualified">{item.stage.replace("_", " ")}</span></td><td>{item.nextAction || item.expectedTimeline || "Not set"}</td></tr>;
  })}</tbody></table></div>;
}

function InboxPanel() {
  return <div className="inbox-panel"><div className="inbox-illustration"><ChatCircleDots size={30} weight="duotone" /><WhatsappLogo size={23} weight="fill" /></div><div><strong>Conversation data stays in Chatwoot</strong><p>The CRM receives signed webhook events and mirrors only contact, lead, opportunity and next-step context. It never reads the Chatwoot database.</p></div><a className="secondary-button" href={process.env.NEXT_PUBLIC_CHATWOOT_APP_URL || "#"}>Open Chatwoot <ArrowUpRight /></a></div>;
}

function RequirementPanel({ profile, loading, busy, onAnalyze }: { profile: RequirementProfileRecord | null; loading: boolean; busy: boolean; onAnalyze: (message: string) => Promise<void> }) {
  const [message, setMessage] = useState("");
  const fields = Object.entries(profile?.fields || {}).filter(([, envelope]) => envelope.value !== null).slice(0, 5);
  const latest = profile?.latestTurn;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    await onAnalyze(value);
    setMessage("");
  }
  return (
    <div className="context-section requirement-section">
      <div className="context-section-title">
        <span>Intelligent discovery</span>
        <strong className={latest?.knowledge ? "good" : "pending-text"}>{loading ? "Reading" : latest?.knowledge ? `Grounded · r${profile?.revision}` : "Ready"}</strong>
      </div>
      {fields.length > 0 && <div className="requirement-fields">{fields.map(([field, envelope]) => <span key={field}><em>{field.replaceAll("_", " ")}</em><strong>{String(envelope.value)}</strong></span>)}</div>}
      {latest?.nextBestQuestion && <div className="suggestion requirement-suggestion"><Sparkle size={18} weight="fill" /><div><strong>Next best question</strong><p>{String(latest.nextBestQuestion.question || "Review the next project dimension.")}</p></div></div>}
      {latest?.knowledge && <div className="knowledge-receipt"><CheckCircle size={14} weight="fill" /><span>{latest.knowledge.sources.length} Canonical source{latest.knowledge.sources.length === 1 ? "" : "s"}</span><code>{latest.knowledge.aggregateHash.slice(0, 10)}</code></div>}
      <form className="requirement-form" onSubmit={submit}>
        <label htmlFor="requirement-message">Paste the latest customer message</label>
        <textarea id="requirement-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Example: We need parking guidance for 800 spaces at a residential site..." disabled={busy} />
        <button className="secondary-button" type="submit" disabled={busy || !message.trim()}>{busy ? <CircleNotch className="spin" /> : <Sparkle />}Analyze and save draft</button>
      </form>
      <small className="requirement-guard">Draft only. The message is encrypted in CRM; the knowledge container receives no direct CRM credentials.</small>
    </div>
  );
}

function FlowStep({ label, value, detail, state, last = false }: { label: string; value: number; detail: string; state: "done" | "idle" | "waiting"; last?: boolean }) {
  return <div className={`flow-step ${state}`}><span className="flow-dot">{state === "done" ? <CheckCircle size={16} weight="fill" /> : value}</span><div><strong>{label}</strong><small>{detail}</small></div><em>{value}</em>{!last && <i />}</div>;
}

function DeliveryTable({ deliveries, busy, onReplay }: { deliveries: ConversionDeliveryRecord[]; busy: string | null; onReplay: (item: ConversionDeliveryRecord) => void }) {
  if (!deliveries.length) return <EmptyState title="No conversion deliveries" detail="Creating a qualified opportunity will write the first immutable outbox event." />;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Provider</th><th>Delivery</th><th>Diagnostics</th><th>Attempts</th><th>Action</th></tr></thead>
        <tbody>{deliveries.map((item) => <tr key={item.id}>
          <td><span className="mono-cell">{item.eventId.replace("qualified:ake-demo:", "…")}</span><small className="table-sub">{formatRelative(item.createdAt)}</small>{item.payloadPreview && <details className="payload-preview"><summary>Payload and receipt</summary><pre>{JSON.stringify({ payload: item.payloadPreview, receipt: item.providerResponseId, mode: item.mode }, null, 2)}</pre></details>}</td>
          <td><div className={`provider-cell ${item.provider}`}><ProviderIcon provider={item.provider} />{item.provider}</div></td>
          <td><span className={`status-pill ${item.status}`}>{item.mode === "mock" && item.status === "accepted" ? "Mock receipt" : statusLabel[item.status]}</span><small className="table-sub">{item.mode} {item.skippedReason || item.providerErrorMessage || ""}</small></td>
          <td><span className={`diagnostic ${item.diagnosticStatus}`}><i />{statusLabel[item.diagnosticStatus]}</span></td>
          <td>{item.attemptCount}</td>
          <td><button className="row-text-action" disabled={["skipped", "dispatching"].includes(item.status) || busy === item.id} onClick={() => onReplay(item)}>{busy === item.id ? <CircleNotch className="spin" /> : <ArrowClockwise />}Replay</button></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function OpportunityModal({ lead, onClose, onSubmit, busy }: { lead: LeadRecord; onClose: () => void; onSubmit: (body: object) => Promise<void>; busy: boolean }) {
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      await onSubmit({
        personId: lead.personId,
        companyId: lead.companyId,
        primarySourceLeadId: lead.id,
        name: data.get("name"),
        direction: data.get("direction"),
        country: data.get("country"),
        ownerId: data.get("ownerId"),
        nextAction: data.get("nextAction"),
        expectedTimeline: data.get("expectedTimeline") || undefined,
        currency: "USD",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Opportunity could not be created");
    }
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="opportunity-title">
        <div className="modal-head"><div><span className="eyebrow">Discovery opportunity</span><h2 id="opportunity-title">Create opportunity</h2><p>Create the opportunity, then review qualification in the pipeline.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
        <div className="source-lock"><ProviderIcon provider={lead.provider} /><div><span>Primary source locked</span><strong>{lead.displayName} · {lead.provider} {lead.sourceKind.replace("_", " ")}</strong></div><CheckCircle size={20} weight="fill" /></div>
        <form onSubmit={submit}>
          <label className="field wide"><span>Opportunity name</span><input name="name" defaultValue={`${lead.companyName || lead.displayName} parking project`} required minLength={3} /></label>
          <label className="field"><span>Project direction</span><input name="direction" defaultValue={lead.confirmedQualification?.products.join(", ") || lead.aiQualification?.products.join(", ") || ""} required minLength={2} /></label>
          <label className="field"><span>Country / market</span><input name="country" defaultValue={lead.confirmedQualification?.country || lead.aiQualification?.country || lead.country || ""} required minLength={2} /></label>
          <label className="field"><span>Owner</span><select name="ownerId" defaultValue="ake-admin"><option value="ake-admin">Demo Admin</option><option value="sales-01">Overseas Sales 01</option></select></label>
          <label className="field"><span>Expected timeline</span><select name="expectedTimeline" defaultValue=""><option value="">Not confirmed</option><option>Within 30 days</option><option>1–3 months</option><option>3–6 months</option><option>More than 6 months</option></select></label>
          <label className="field wide"><span>Next action</span><textarea name="nextAction" defaultValue={lead.confirmedQualification?.nextAction || lead.aiQualification?.nextAction || ""} required minLength={2} /></label>
          {error && <div className="form-error"><WarningCircle />{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <CircleNotch className="spin" /> : <Funnel />}Create opportunity</button></div>
        </form>
      </section>
    </div>
  );
}
