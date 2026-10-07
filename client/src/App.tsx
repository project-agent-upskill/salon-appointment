import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCheck, ChevronDown, ChevronRight, Clock3, Flower2, Leaf, LoaderCircle, MessageCircle, Plus, RefreshCw, Scissors, Send, ShieldCheck, Smartphone, Sparkles, Users, X, CircleAlert, CircleCheck } from 'lucide-react';
import type { Client, Message, Offer, OpeningView, Service, StaffCommand, Stylist } from '../../src/types';
import './styles.css';

const ZONE = 'America/Los_Angeles';
const time = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).format(at);
const date = (at: number) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, weekday: 'long', month: 'long', day: 'numeric' }).format(at);
const initials = (name: string) => name.split(' ').map((s) => s[0]).slice(0, 2).join('');
const label: Record<string, string> = { searching: 'Finding a match', sending: 'Sending offer', waiting: 'Offer in progress', filled: 'Filled', needs_attention: 'Needs attention', unfilled: 'Unfilled', canceled: 'Canceled', accepted: 'Accepted', declined: 'Declined', timed_out: 'Timed out', withdrawn: 'Withdrew', delivery_failed: 'Delivery failed' };
type Config = { services: Service[]; stylists: Stylist[]; timezone: string; today: string; now: number };
async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Something went wrong. Please try again.');
  return data as T;
}
function usePoll<T>(url: string, interval = 2000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function load() {
      try {
        const result = await api<T>(url, undefined, controller.signal);
        if (!stopped) { setData(result); setError(''); }
      } catch (e) { if (!stopped) setError((e as Error).message); }
      if (!stopped) timer = setTimeout(load, interval);
    }
    void load();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [url, interval, tick]);
  return { data, error, refresh };
}
function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
function Brand({ dark = false }: { dark?: boolean }) {
  return <div className={`brand ${dark ? 'brand-dark' : ''}`}><span className="brand-mark"><Leaf size={24} strokeWidth={1.5} /></span><div><span className="brand-name">juniper</span><span className="brand-sub">SALON & GOOD COMPANY</span></div></div>;
}
function Badge({ status }: { status: string }) {
  const Icon = status === 'filled' || status === 'accepted' ? Check : status === 'needs_attention' || status === 'delivery_failed' ? CircleAlert : status === 'waiting' ? Clock3 : status === 'sending' || status === 'searching' ? LoaderCircle : status === 'canceled' ? X : null;
  return <span className={`badge badge-${status}`}>{Icon && <Icon size={13} className={status === 'sending' ? 'animate-spin' : ''} />}{label[status] || status}</span>;
}
function Countdown({ deadline, compact = false }: { deadline?: number; compact?: boolean }) {
  const now = useNow();
  if (!deadline) return <span>Preparing your offer…</span>;
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <span className="countdown">{compact ? text : `${text} remaining`}</span>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} className="modal" aria-label={title} onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-header"><div><span className="eyebrow">THE FRONT DESK</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>{children}
  </dialog>;
}
function NewOpening({ config, onClose, onDone }: { config: Config; onClose: () => void; onDone: () => void }) {
  const now = useNow();
  const currentHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
  const defaultTime = `${String(Math.min(23, currentHour + 2)).padStart(2, '0')}:30`;
  const [service, setService] = useState<Service>('Haircut');
  const [stylist, setStylist] = useState<Stylist>('Carla');
  const [at, setAt] = useState(defaultTime);
  const [demo, setDemo] = useState(false);
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/openings', { service, stylist, time: at, demo, simulateDeliveryFailure: failure, requestId: requestId.current }); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="Make room for someone." onClose={onClose}><form onSubmit={submit} className="form-body">
    <p className="muted">Add a cancellation. We'll find a match and take care of the next steps.</p>
    <label>Service<select value={service} onChange={(e) => setService(e.target.value as Service)}>{config.services.map((s) => <option key={s}>{s}</option>)}</select></label>
    <div className="form-row"><label>Stylist<select value={stylist} onChange={(e) => setStylist(e.target.value as Stylist)}>{config.stylists.map((s) => <option key={s}>{s}</option>)}</select></label><label>Time today · Pacific<input type="time" required value={at} onChange={(e) => setAt(e.target.value)} /></label></div>
    <div className="info-note"><CalendarDays size={17} /><span>{date(now)}<small>Same-day openings · 15 minutes to respond</small></span></div>
    <details className="demo-settings"><summary><Sparkles size={15} /> Prototype options <ChevronDown size={15} /></summary><label className="checkbox-label"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /><span>Use a 30-second demo window<small>Watch the next client receive an offer sooner.</small></span></label><label className="checkbox-label"><input type="checkbox" checked={failure} onChange={(e) => setFailure(e.target.checked)} /><span>Simulate a delivery problem<small>See how staff can retry or skip an offer.</small></span></label></details>
    {error && <p role="alert" className="error-note">{error}</p>}
    <div className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Not now</button><button disabled={busy} className="button button-primary">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Send size={17} />}{busy ? 'Starting outreach…' : 'Create opening'}</button></div>
  </form></Modal>;
}
function AddClient({ config, onClose, onDone }: { config: Config; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError('');
    try { await api('/api/waitlist', { name: f.get('name'), mobile: f.get('mobile'), service: f.get('service'), stylist: f.get('stylist'), availability: f.get('availability'), days: f.getAll('days').map(Number), consent: f.get('consent') === 'on' }); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title="A spot on the list." onClose={onClose}><form onSubmit={submit} className="form-body">
    <p className="muted">Keep their preferences close. We'll reach out when the right time opens up.</p>
    <div className="form-row"><label>Client name<input name="name" required maxLength={80} placeholder="First and last name" /></label><label>Mobile number<input name="mobile" required type="tel" placeholder="(415) 555-0123" /></label></div>
    <label>Requested service<select name="service">{config.services.map((s) => <option key={s}>{s}</option>)}</select></label>
    <div className="form-row"><label>Stylist preference<select name="stylist"><option>Anyone</option>{config.stylists.map((s) => <option key={s}>{s}</option>)}</select></label><label>Available times<select name="availability"><option>Any time</option><option>Morning</option><option>Afternoon</option></select></label></div>
    <fieldset><legend>Available days</legend><div className="day-options">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => <label key={d}><input name="days" type="checkbox" value={i} defaultChecked /><span>{d}</span></label>)}</div></fieldset>
    <label className="checkbox-label"><input type="checkbox" name="consent" required /><span>This client agreed to receive appointment offers.</span></label>
    <p className="small muted">New clients are added at the end of the waitlist. Morning is before noon; afternoon is noon onward.</p>
    {error && <p role="alert" className="error-note">{error}</p>}
    <div className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Not now</button><button disabled={busy} className="button button-primary">{busy && <LoaderCircle size={17} className="animate-spin" />}Add to waitlist</button></div>
  </form></Modal>;
}
function OpeningCard({ view, refresh, notify }: { view: OpeningView; refresh: () => void; notify: (s: string) => void }) {
  const { state: s, systemStatus, systemMessage, offerUrls } = view;
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState<StaffCommand['action']>();
  const now = useNow();
  const offer = s.offers.find((o) => o.id === s.currentOfferId);
  const past = s.offers.filter((o) => o.id !== s.currentOfferId);
  const active = ['searching','sending','waiting','needs_attention'].includes(s.phase);
  const ready = systemStatus === 'ok' && now < s.input.startsAt;
  async function act(action: StaffCommand['action']) {
    setBusy(action); setConfirm(undefined);
    try { const result = await api<{ message: string }>(`/api/openings/${s.input.id}/actions`, { action, requestId: crypto.randomUUID(), offerId: offer?.id }); notify(result.message); refresh(); }
    catch (e) { notify((e as Error).message); } finally { setBusy(''); }
  }
  return <article className={`opening-card ${s.phase === 'filled' ? 'opening-filled' : ''}`}>
    <div className="opening-top"><div className="appointment-time">{time(s.input.startsAt)}<span>{s.input.service === 'Cut & color' ? '90' : s.input.service === 'Haircut' ? '45' : '30'} min</span></div><Badge status={systemStatus === 'failed' ? 'needs_attention' : s.phase} /></div>
    <h3>{s.input.service}</h3><p className="stylist-line"><Scissors size={14} /> with {s.input.stylist}{s.input.demo && <span className="demo-pill">30-sec demo</span>}</p>
    {systemStatus !== 'ok' && <div className="error-note"><CircleAlert size={16} /><span>{systemMessage}</span></div>}
    {offer && <div className={`current-offer ${s.phase === 'filled' ? 'current-filled' : ''}`}>
      <span className="avatar">{initials(offer.client.name)}</span><div className="grow"><span className="micro-label">{s.phase === 'filled' ? 'APPOINTMENT CLAIMED BY' : s.phase === 'needs_attention' ? 'DELIVERY NEEDS A HAND' : 'CURRENT OFFER HOLDER'}</span><strong>{offer.client.name}</strong>
      {s.phase === 'waiting' && <span className="deadline"><Clock3 size={13} /><Countdown deadline={offer.deadline} /> · until {time(offer.deadline!)} PT</span>}
      {s.phase === 'sending' && <span className="deadline">Sending their appointment offer…</span>}
      {s.phase === 'filled' && <span className="deadline">Accepted at {time(offer.respondedAt!)} · Update Square manually</span>}
      {s.phase === 'needs_attention' && <span className="deadline">Outreach is paused. No next offer will be sent.</span>}</div>
      {s.phase === 'filled' && <CircleCheck size={24} className="text-forest" />}
    </div>}
    {s.reason && <p className={`reason ${s.phase === 'needs_attention' ? 'reason-warning' : ''}`}>{s.reason}</p>}
    {active && offerUrls[offer?.id ?? ''] && <a className="offer-preview" href={offerUrls[offer!.id]} target="_blank" rel="noreferrer"><Smartphone size={15} /> Open client offer <ArrowUpRight size={15} /><span>Simulated message</span></a>}
    <button className="history-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><span>{s.offers.length} {s.offers.length === 1 ? 'offer' : 'offers'} · {s.remaining.length} remaining</span><span>{expanded ? 'Hide details' : 'View details'}<ChevronDown size={15} className={expanded ? 'rotate-180' : ''} /></span></button>
    {expanded && <div className="opening-details">
      {past.length > 0 && <div className="history-list"><span className="micro-label">SO FAR</span>{past.map((o) => <div className="history-item" key={o.id}><span className={`history-dot dot-${o.status}`} /><span>{o.client.name}<small>{o.respondedAt ? time(o.respondedAt) : time(o.createdAt)}</small></span><Badge status={o.status} /></div>)}</div>}
      <span className="micro-label">{s.phase === 'filled' ? 'IF THIS OPENING IS REOPENED' : active ? 'NEXT IN LINE' : 'REMAINING CANDIDATES'}</span>
      {s.remaining.length ? <div className="queue-list">{s.remaining.map((c, i) => <div className="queue-item" key={c.id}><span className="queue-number">{i + 1}</span><span>{c.name}<small>{c.stylist === 'Anyone' ? 'Any stylist' : c.stylist} · {c.availability}</small></span><span className="small muted">Eligible</span></div>)}</div> : <p className="small muted no-candidates">No remaining candidates.</p>}
      <p className="queue-note"><ShieldCheck size={13} /> Matched by service, stylist & availability. Earliest waitlist entry first.</p>
    </div>}
    <div className="opening-actions">
      {s.phase === 'needs_attention' && <button className="button button-small button-primary" disabled={!!busy || !ready} onClick={() => void act('retry_delivery')}><RefreshCw size={14} />Retry delivery</button>}
      {['waiting','sending','needs_attention'].includes(s.phase) && offer && <button className="button button-small button-outline" disabled={!!busy || !ready} onClick={() => setConfirm('cancel_offer')}>{s.phase === 'needs_attention' ? 'Skip client' : 'Cancel offer'}<ArrowRight size={14} /></button>}
      {s.phase === 'filled' && <button className="button button-small button-outline" disabled={!!busy || !ready} onClick={() => setConfirm('reopen')}><RefreshCw size={14} />Reopen</button>}
      {(active || s.phase === 'filled') && <button className="button button-small button-quiet cancel-action" disabled={!!busy || !ready} onClick={() => setConfirm('cancel_opening')}>Cancel opening</button>}
      {['unfilled','canceled'].includes(s.phase) && <span className="stopped-note"><CheckCheck size={15} />Outreach has stopped</span>}
      {s.phase === 'filled' && now >= s.input.startsAt && <span className="stopped-note">Appointment has started</span>}
      {busy && <LoaderCircle className="animate-spin" size={16} />}
    </div>
    {confirm && <Modal title={confirm === 'cancel_opening' ? 'Cancel this opening?' : confirm === 'reopen' ? 'Make this time available again?' : 'Move to the next client?'} onClose={() => setConfirm(undefined)}><div className="form-body"><p className="muted">{confirm === 'cancel_opening' ? 'All outreach will stop and any current offer will become unavailable. Remember to update Square if needed.' : confirm === 'reopen' ? `${offer?.client.name}'s acceptance will be marked withdrawn. We'll continue with the next eligible person; update Square manually.` : `${offer?.client.name}'s offer will be canceled. We'll automatically contact the next eligible client.`}</p><div className="modal-footer"><button className="button button-quiet" onClick={() => setConfirm(undefined)}>Keep as is</button><button className="button button-primary" onClick={() => void act(confirm)}>{confirm === 'cancel_opening' ? 'Cancel opening' : confirm === 'reopen' ? 'Reopen & continue' : 'Cancel & continue'}</button></div></div></Modal>}
  </article>;
}
function Botanical() {
  return <svg className="botanical" viewBox="0 0 200 230" fill="none" aria-hidden="true"><path d="M97 216c0-36-5-68 8-100 12-28 17-62 8-98" stroke="currentColor" strokeWidth="2" /><path d="M104 133C62 129 44 99 49 77c33 4 52 22 55 56Zm11-47c26-5 46-24 43-48-32 7-47 25-43 48ZM99 178c-29 0-55-22-53-44 28 2 47 20 53 44Zm1-29c36-5 51-23 49-48-30 6-48 28-49 48ZM113 60c-21-4-37-22-33-41 24 3 37 18 33 41Z" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeWidth="1.4" /><path d="M107 126 59 89m55-12 33-28m-48 120-43-25m47-6 34-25M112 51 89 28" stroke="currentColor" strokeWidth="1" /><circle cx="74" cy="202" r="2" fill="currentColor" /><circle cx="141" cy="182" r="2.5" fill="currentColor" /><path d="m159 151 3-5m-6 0 6 4" stroke="currentColor" strokeWidth="1" /></svg>;
}
export function StaffApp() {
  const config = usePoll<Config>('/api/config', 60_000);
  const openings = usePoll<OpeningView[]>('/api/openings');
  const waitlist = usePoll<Client[]>('/api/waitlist', 5000);
  const inbox = usePoll<(Message & { url: string })[]>('/api/messages');
  const [tab, setTab] = useState<'openings' | 'waitlist' | 'inbox'>('openings');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<'opening' | 'client'>();
  const [toast, setToast] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);
  const demoId = useRef<string>(crypto.randomUUID());
  const now = useNow();
  const list = openings.data ?? [];
  const active = list.filter((o) => ['searching','sending','waiting','needs_attention'].includes(o.state.phase)).length;
  const filled = list.filter((o) => o.state.phase === 'filled').length;
  const attention = list.filter((o) => o.state.phase === 'needs_attention' || o.systemStatus === 'failed').length;
  const stopped = list.filter((o) => ['unfilled','canceled'].includes(o.state.phase)).length;
  const visible = list.filter((o) => filter === 'all' || (filter === 'active' ? ['searching','sending','waiting','needs_attention'].includes(o.state.phase) : filter === 'stopped' ? ['unfilled','canceled'].includes(o.state.phase) : o.state.phase === filter));
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 6500); return () => clearTimeout(id); }, [toast]);
  async function startDemo() {
    setDemoBusy(true);
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
    try {
      await api('/api/openings', { service: 'Haircut', stylist: 'Carla', time: `${String(Math.min(23, hour + 2)).padStart(2, '0')}:45`, demo: true, requestId: demoId.current });
      demoId.current = crypto.randomUUID(); openings.refresh(); inbox.refresh(); setToast('Sample opening created. The first client has 30 seconds to respond.');
    } catch (e) { setToast((e as Error).message); } finally { setDemoBusy(false); }
  }
  return <div className="app-shell">
    <aside className="sidebar"><Brand dark /><div className="salon-divider" /><span className="sidebar-label">YOUR SALON, A LITTLE SIMPLER</span><nav aria-label="Main navigation">{([{ key: 'openings', text: "Today's openings", Icon: CalendarDays }, { key: 'waitlist', text: 'Waitlist', Icon: Users }, { key: 'inbox', text: 'Demo inbox', Icon: MessageCircle }] as const).map(({ key, text, Icon }) => <button key={key} className={`nav-item ${tab === key ? 'nav-active' : ''}`} onClick={() => setTab(key)}><Icon size={19} strokeWidth={1.6} /><span>{text}</span>{key === 'waitlist' && <span className="nav-count">{waitlist.data?.length ?? '–'}</span>}{key === 'inbox' && (inbox.data?.length ?? 0) > 0 && <span className="nav-count">{inbox.data!.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="little-thought"><Flower2 size={27} strokeWidth={1.2} /><p>A full chair.<br />A lighter day.</p><span>Let the little things<br />take care of themselves.</span></div><div className="profile"><span className="profile-avatar">L</span><div><strong>Lena's front desk</strong><small>Juniper Salon</small></div><span className="profile-dot" /></div></div>
    </aside>
    <main className="workspace"><header className="topbar"><span><span className="topbar-label">JUNIPER SALON</span><ChevronRight size={13} />{tab === 'openings' ? 'The front desk' : tab === 'waitlist' ? 'Our people' : 'A peek at the messages'}</span><span className="today-date"><CalendarDays size={15} />{date(now)}</span></header>
      <div className="main-content"><div className="page-heading"><div><div className="eyebrow"><span className="live-dot" />{tab === 'openings' ? 'A LITTLE LESS BACK-AND-FORTH' : tab === 'waitlist' ? 'GOOD THINGS COME TO THOSE WHO WAIT' : 'PROTOTYPE · SIMULATED SMS'}</div><h1>{tab === 'openings' ? 'A little room for someone.' : tab === 'waitlist' ? 'Your people, next in line.' : 'Good news, on its way.'}</h1><p>{tab === 'openings' ? 'Turn an unexpected opening into a lovely appointment.' : tab === 'waitlist' ? 'The right service, the right stylist, a time that works.' : 'See the offers clients would receive. Open one to respond as a client.'}</p></div><button className="button button-primary heading-action" onClick={() => tab === 'waitlist' ? setModal('client') : setModal('opening')}><Plus size={18} />{tab === 'waitlist' ? 'Add client' : 'Add opening'}</button></div>
      {(openings.error || config.error || waitlist.error || inbox.error) && <div role="alert" className="error-note"><CircleAlert size={18} />{openings.error || config.error || waitlist.error || inbox.error}<button className="text-button" onClick={() => { openings.refresh(); config.refresh(); waitlist.refresh(); inbox.refresh(); }}>Try again</button></div>}
      {tab === 'openings' && <>
        <div className="stats-grid"><div className="stat-card"><span><Clock3 size={16} />In progress</span><div><strong>{active}</strong><small>Taking care of the next steps</small></div></div><div className="stat-card stat-filled"><span><CheckCheck size={17} />Openings filled</span><div><strong>{filled}</strong><small>Goal: refill at least half</small></div></div><div className={`stat-card ${attention ? 'stat-attention' : ''}`}><span><Users size={17} />{attention ? 'Needs your attention' : 'On the waitlist'}</span><div><strong>{attention || waitlist.data?.length || 0}</strong><small>{attention ? 'Delivery needs a helping hand' : 'Ready for the right opening'}</small></div></div></div>
        <div className="section-header"><div><h2>Today's openings <span>{list.length}</span></h2><p>One offer at a time. Every response kept in view.</p></div><span className="sync-label"><span className={`live-dot ${list.some((o) => o.systemStatus !== 'ok') ? 'dot-muted' : ''}`} />{list.some((o) => o.systemStatus !== 'ok') ? 'Checking connection' : 'Updates automatically'}</span></div>
        <div className="filter-tabs" role="group" aria-label="Filter openings">{[['all', 'All openings', list.length], ['active', 'In progress', active], ['filled', 'Filled', filled], ['stopped', 'Stopped', stopped]].map(([key, text, count]) => <button key={key} className={filter === key ? 'filter-active' : ''} onClick={() => setFilter(String(key))}>{text}<span>{count}</span></button>)}</div>
        {!openings.data ? <div className="empty-state"><LoaderCircle className="animate-spin text-forest" size={28} /><h3>Getting the front desk ready…</h3></div> : visible.length ? <div className="openings-grid">{visible.map((view) => <OpeningCard key={view.state.input.id} view={view} refresh={() => { openings.refresh(); inbox.refresh(); }} notify={setToast} />)}</div> : <div className="empty-state"><Botanical /><div><span className="eyebrow">{filter === 'all' ? 'A FRESH START' : 'ALL CLEAR'}</span><h3>{filter === 'all' ? 'A cancellation can become\nsomeone’s good news.' : 'No openings in this view.'}</h3><p>{filter === 'all' ? 'Add an opening and we’ll gently work through your waitlist,\none person at a time. You can get back to your day.' : 'Choose another filter to see the rest of your day.'}</p><button className="button button-primary" onClick={() => filter === 'all' ? setModal('opening') : setFilter('all')}>{filter === 'all' ? <Plus size={17} /> : <ArrowRight size={17} />}{filter === 'all' ? 'Add your first opening' : 'See all openings'}</button></div></div>}
        <div className="bottom-panels"><div className="how-it-works"><span className="micro-label">A THOUGHTFUL LITTLE HANDOFF</span><div className="steps"><span><span className="step-icon"><Scissors size={17} /></span>Find the right fit</span><ChevronRight size={14} /><span><span className="step-icon"><Send size={16} /></span>Offer & wait</span><ChevronRight size={14} /><span><span className="step-icon"><Check size={18} /></span>Fill the opening</span></div><p>Clients have 15 minutes to reply. No response? The next person gets a turn.</p></div><div className="demo-panel"><div><Sparkles size={19} /><strong>Take it for a spin</strong></div><p>Try a real workflow with a 30-second response window and sample clients.</p><button disabled={demoBusy || !config.data} onClick={() => void startDemo()}>{demoBusy ? <LoaderCircle className="animate-spin" size={15} /> : null}Try a sample opening<ArrowRight size={16} /></button></div></div>
      </>}
      {tab === 'waitlist' && <><div className="section-header"><div><h2>The waitlist <span>{waitlist.data?.length ?? 0}</span></h2><p>Earliest entries come first, when their preferences match.</p></div><span className="small muted">Sample clients + anyone you add</span></div><div className="waitlist-table"><div className="waitlist-table-head"><span>CLIENT</span><span>SERVICE & STYLIST</span><span>AVAILABILITY</span><span>JOINED</span></div>{waitlist.data?.map((c, i) => <div className="waitlist-row" key={c.id}><div><span className={`avatar avatar-${i % 4}`}>{initials(c.name)}</span><span><strong>{c.name}</strong><small>{c.mobile}</small></span></div><div><strong>{c.service}</strong><small>{c.stylist === 'Anyone' ? 'Any stylist' : `With ${c.stylist}`}</small></div><div><strong>{c.availability}</strong><small>{c.days.length === 7 ? 'Every day' : c.days.map((d) => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')}</small></div><div><span>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: ZONE }).format(new Date(c.joinedAt))}</span><small>#{i + 1} in line</small></div></div>)}</div><div className="info-note mt-5"><ShieldCheck size={18} /><span>Matching stays thoughtful.<small>A service and required stylist must match, and the appointment must fall within the client's availability. Each opening keeps its own candidate list.</small></span></div></>}
      {tab === 'inbox' && <><div className="info-note"><Smartphone size={19} /><span>No real texts are sent in this prototype.<small>These are the messages our SMS adapter produces. Each private link opens only that client's offer.</small></span></div><div className="inbox-grid">{inbox.data?.length ? inbox.data.map((m) => <article className="message-card" key={m.offerId}><div className="message-card-header"><span className="avatar">{initials(m.name)}</span><div><strong>{m.name}</strong><small>{m.mobile}</small></div><span className={`message-delivery ${m.delivered ? '' : 'delivery-error'}`}>{m.delivered ? <CheckCheck size={17} /> : <CircleAlert size={17} />}{m.delivered ? 'Delivered' : 'Not delivered'}</span></div><div className="sms-bubble"><span className="micro-label">JUNIPER SALON</span><p>Hi {m.name.split(' ')[0]}! A little room just opened up: {m.service.toLowerCase()} with {m.stylist}, today at {time(m.startsAt)}. Interested?</p><p className="small">Your private offer has the details and your response deadline.</p></div><div className="message-footer"><span>{time(m.createdAt)} · Simulated SMS</span>{m.delivered && <a href={m.url} target="_blank" rel="noreferrer">Open client offer<ArrowUpRight size={15} /></a>}</div></article>) : <div className="empty-state inbox-empty"><MessageCircle size={34} strokeWidth={1.3} /><h3>A little quiet here, for now.</h3><p>Create an opening to see its first client message.</p><button className="button button-primary" onClick={() => setModal('opening')}><Plus size={16} />Add opening</button></div>}</div></>}
      <footer className="workspace-footer"><span><Leaf size={14} />A little more full. A little less busy.</span><span>Prototype · Square remains your calendar.<a href="http://localhost:8233" target="_blank" rel="noreferrer">Temporal history<ArrowUpRight size={12} /></a></span></footer>
      </div>
    </main>
    {toast && <div role="status" className="toast"><CircleCheck size={20} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={17} /></button></div>}
    {modal === 'opening' && config.data && <NewOpening config={config.data} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); openings.refresh(); inbox.refresh(); setToast('Opening added. We’re taking care of the next steps.'); }} />}
    {modal === 'client' && config.data && <AddClient config={config.data} onClose={() => setModal(undefined)} onDone={() => { setModal(undefined); waitlist.refresh(); setToast('Client added to the waitlist.'); }} />}
  </div>;
}
type ClientOffer = { name: string; service: Service; stylist: Stylist; startsAt: number; deadline?: number; status: Offer['status']; phase: string; available: boolean; demo: boolean };
export function ClientApp({ token }: { token: string }) {
  const poll = usePoll<ClientOffer>(`/api/offers/${encodeURIComponent(token)}`, 1500);
  const now = useNow();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [declineConfirm, setDeclineConfirm] = useState(false);
  const data = poll.data;
  const accepted = data?.status === 'accepted' && data.phase === 'filled';
  const declined = data?.status === 'declined';
  const expired = data && !accepted && !declined && (['timed_out','canceled','withdrawn','delivery_failed'].includes(data.status) || (data.deadline !== undefined && now >= data.deadline) || ['canceled','unfilled'].includes(data.phase));
  const canRespond = data?.available && data.status === 'waiting' && !expired;
  async function respond(answer: 'accept' | 'decline') {
    setBusy(answer); setError(''); setDeclineConfirm(false);
    try { await api(`/api/offers/${encodeURIComponent(token)}/respond`, { answer }); poll.refresh(); }
    catch (e) { setError((e as Error).message); poll.refresh(); } finally { setBusy(''); }
  }
  return <main className="client-page"><header><Brand /></header><div className="client-content"><div className={`client-flower ${accepted ? 'client-success-icon' : ''}`}>{accepted ? <Check size={31} /> : declined ? <Leaf size={31} /> : expired ? <Clock3 size={31} /> : <Flower2 size={38} strokeWidth={1.2} />}</div><span className="eyebrow">{accepted ? 'ALL YOURS' : declined ? 'THANKS FOR LETTING US KNOW' : expired ? 'THIS OFFER HAS CLOSED' : 'A NOTE FROM JUNIPER'}</span><h1>{accepted ? 'See you soon.' : declined ? 'Another time, then.' : expired ? 'This moment\nhas passed.' : 'A little earlier,\njust for you.'}</h1><p className="client-intro">{accepted ? `You're booked, ${data?.name.split(' ')[0]}. We’re looking forward to having you in the chair.` : declined ? 'We’ll offer this opening to the next person. Thanks for giving someone else a turn.' : expired ? (data?.status === 'timed_out' || (data?.deadline !== undefined && now >= data.deadline) ? 'This opening is no longer available. The response window has ended, so your reply is too late.' : 'This opening is no longer available. The salon has closed this offer.') : data ? `Hi ${data.name.split(' ')[0]}, a spot just opened up that we thought you’d love.` : 'Getting your appointment offer ready…'}</p>
      {data && <div className="client-appointment"><div className="client-appointment-heading"><Scissors size={22} strokeWidth={1.4} /><span>YOUR APPOINTMENT</span>{accepted && <Badge status="filled" />}</div><h2>{data.service}</h2><dl><div><dt><CalendarDays size={17} />When</dt><dd>{date(data.startsAt)}<strong>{time(data.startsAt)} Pacific</strong></dd></div><div><dt><Scissors size={17} />With</dt><dd>{data.stylist}<strong>Juniper Salon</strong></dd></div></dl>{!accepted && !declined && !expired && <div className="client-deadline"><Clock3 size={17} /><span>{data.deadline ? <><Countdown deadline={data.deadline} /><small>Respond by {time(data.deadline)} Pacific</small></> : 'Your offer is being prepared.'}</span></div>}</div>}
      {(error || poll.error) && <div role="alert" className="error-note">{error || poll.error}<button className="text-button" onClick={poll.refresh}>Refresh</button></div>}
      {data && !data.available && <div role="status" className="error-note">We’re reconnecting to the salon. Please wait for confirmation before assuming your response was received.</div>}
      {!data && !poll.error && <LoaderCircle className="animate-spin mx-auto" size={25} />}
      {data && !accepted && !declined && !expired && <div className="client-actions"><button disabled={!canRespond || !!busy} className="button button-primary" onClick={() => void respond('accept')}>{busy === 'accept' ? <LoaderCircle className="animate-spin" size={19} /> : <Check size={19} />}Yes, I’d love this time</button><button disabled={!canRespond || !!busy} className="button button-outline" onClick={() => setDeclineConfirm(true)}>{busy === 'decline' ? 'Sending your reply…' : 'No thanks, not this time'}</button><p>Your choice goes straight to the salon.<br />No account. No back-and-forth.</p></div>}
      {accepted && <div className="client-confirmation"><CircleCheck size={18} /><span>Your acceptance is confirmed.<small>The front desk will update their Square calendar. Please contact the salon if your plans change.</small></span></div>}
      {expired && <p className="client-contact">Need a hand? Contact the Juniper front desk.</p>}
      {data?.demo && <p className="client-demo"><Sparkles size={13} />Demo offer · 30-second response window · No real booking</p>}
    </div><footer className="client-footer"><Leaf size={15} />Good hair. Good company.</footer>
    {declineConfirm && <Modal title="Pass on this opening?" onClose={() => setDeclineConfirm(false)}><div className="form-body"><p className="muted">We'll offer this appointment to the next person on the waitlist.</p><div className="modal-footer"><button className="button button-quiet" onClick={() => setDeclineConfirm(false)}>Go back</button><button className="button button-primary" onClick={() => void respond('decline')}>Decline offer</button></div></div></Modal>}
  </main>;
}
