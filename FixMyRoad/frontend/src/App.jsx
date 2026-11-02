import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const UPLOADS = import.meta.env.VITE_UPLOADS_URL || 'http://localhost:5000';
const STATUSES = ['Reported', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];
const TYPES = ['Pothole', 'Cracked road', 'Waterlogging', 'Broken streetlight', 'Open manhole', 'Other'];
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const markerIcon = new L.Icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34], shadowSize: [41,41] });

async function request(path, options = {}, token) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}
function MapAutoFit({ reports }) {
  const map = useMap();
  useEffect(() => { if (reports.length) map.fitBounds(reports.map(r => [r.latitude, r.longitude]), { padding: [30,30], maxZoom: 14 }); }, [reports, map]);
  return null;
}
function MapView({ reports }) {
  return <MapContainer center={[11.0168, 76.9558]} zoom={12} scrollWheelZoom className="map">
    <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapAutoFit reports={reports} />
    {reports.map(r => <Marker key={r._id} position={[r.latitude, r.longitude]} icon={markerIcon}><Popup><strong>{r.title}</strong><br/>{r.damageType} · {r.severity}<br/>Status: {r.status}<br/>{r.address || `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`}</Popup></Marker>)}
  </MapContainer>;
}
function AuthModal({ mode, onClose, onSuccess, onSwitch, allowClose = true }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('credentials');
  const [challenge, setChallenge] = useState(null);
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e) {
    e.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const data = await request(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(form) });
      if (data.requiresOtp) {
        setChallenge(data); setStage('otp'); setNotice(data.message || 'Check your email for a verification code.');
      } else { onSuccess(data); onClose(); }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function verifyOtp(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId, otp }) });
      onSuccess(data); onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function resendOtp() {
    setError(''); setNotice(''); setBusy(true);
    try { const data = await request('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ challengeId: challenge.challengeId }) }); setNotice(data.message); setOtp(''); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function switchMode(nextMode) { setStage('credentials'); setChallenge(null); setOtp(''); setError(''); setNotice(''); onSwitch(nextMode); }

  return <div className="modal-backdrop" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()}>{allowClose !== false && <button className="close" onClick={onClose}>×</button>}<div className="eyebrow">FIXMYROAD ACCOUNT</div>
    {stage === 'credentials' ? <>
      <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      <p className="muted">{mode === 'login' ? 'Sign in with your email and password.' : 'Join your community. Verify your email to activate your account.'}</p>
      <form onSubmit={submit} className="stack">
        {mode === 'register' && <label>Full name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name" autoComplete="name"/></label>}
        <label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com" autoComplete="email"/></label>
        <label>Password<input required minLength="8" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Login' : 'Send verification code'}</button>
      </form>
      <p className="switch">{mode === 'login' ? 'New to FixMyRoad?' : 'Already have an account?'} <button className="text-button" onClick={()=>switchMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
    </> : <>
      <h2>Verify your email</h2>
      <p className="muted">Enter the 6-digit code we sent to <strong>{challenge?.email || form.email}</strong>. It expires in {challenge?.expiresInMinutes || 5} minutes.</p>
      {notice && <div className="notice" role="status">{notice}</div>}
      <form onSubmit={verifyOtp} className="stack">
        <label>6-digit verification code<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="123456"/></label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn primary full" disabled={busy || otp.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
      </form>
      <p className="switch"><button className="text-button" disabled={busy} onClick={resendOtp}>Resend code</button> · <button className="text-button" onClick={()=>{setStage('credentials');setOtp('');setError('');setNotice('');}}>Change details</button></p>
    </>}
  </div></div>;
}
function ReportCard({ report, onOpen }) {
  return <button className="report-card" onClick={()=>onOpen(report)}><div className="card-top"><span className={`severity ${report.severity.toLowerCase()}`}>{report.severity} priority</span><span className={`status ${report.status.toLowerCase().replaceAll(' ','-')}`}>{report.status}</span></div><h3>{report.title}</h3><p className="card-desc">{report.description}</p><div className="card-meta"><span>⌖ {report.address || `${report.latitude.toFixed(3)}, ${report.longitude.toFixed(3)}`}</span><span>{report.damageType}</span></div><div className="card-bottom"><span>Reported {new Date(report.createdAt).toLocaleDateString()}</span><span className="arrow">↗</span></div></button>;
}
function ReportDetail({ report, onClose }) {
  if (!report) return null;
  return <div className="modal-backdrop" onClick={onClose}><div className="modal detail-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={onClose}>×</button><div className="eyebrow">REPORT DETAILS · {report._id.slice(-6).toUpperCase()}</div><h2>{report.title}</h2><div className="detail-pills"><span className={`severity ${report.severity.toLowerCase()}`}>{report.severity} priority</span><span className={`status ${report.status.toLowerCase().replaceAll(' ','-')}`}>{report.status}</span></div>{report.photoPath && <img className="detail-photo" src={`${UPLOADS}${report.photoPath}`} alt="Reported road damage"/>}<p>{report.description}</p><div className="detail-grid"><div><small>Damage type</small><strong>{report.damageType}</strong></div><div><small>Reported by</small><strong>{report.reporter?.name || 'Community member'}</strong></div><div><small>Location</small><strong>{report.address || `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`}</strong></div><div><small>Reported on</small><strong>{new Date(report.createdAt).toLocaleString()}</strong></div></div>{report.possibleDuplicateOf && <div className="notice">Possible duplicate detected. The authority can review nearby reports together.</div>}{report.assignedTo && <p><strong>Assigned to:</strong> {report.assignedTo}</p>}{report.resolutionNote && <p><strong>Resolution note:</strong> {report.resolutionNote}</p>}<a className="btn secondary full" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=17/${report.latitude}/${report.longitude}`}>Open location in map ↗</a></div></div>;
}
export default function App() {
  const [user, setUser] = useState(()=>JSON.parse(localStorage.getItem('fmr_user') || 'null'));
  const [token, setToken] = useState(()=>localStorage.getItem('fmr_token') || '');
  const [reports, setReports] = useState([]); const [mine, setMine] = useState([]); const [stats, setStats] = useState(null);
  const [authMode, setAuthMode] = useState(() => localStorage.getItem('fmr_token') ? '' : (window.location.pathname === '/register' ? 'register' : 'login')); const [activeTab, setActiveTab] = useState('overview'); const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All'); const [severityFilter, setSeverityFilter] = useState('All'); const [query, setQuery] = useState('');
  const [toast, setToast] = useState(''); const [busy, setBusy] = useState(false); const [form, setForm] = useState({title:'',description:'',damageType:'Pothole',severity:'Medium',latitude:'',longitude:'',address:''}); const [photo, setPhoto] = useState(null); const [locationBusy, setLocationBusy] = useState(false);
  const isAuthority = user?.role === 'authority';
  async function loadReports() { try { const data = await request('/reports'); setReports(data); } catch(e) { setToast(e.message); } }
  async function loadMine() { if (token) try { setMine(await request('/reports/mine', {}, token)); } catch {} }
  async function loadStats() { if (token && isAuthority) try { setStats(await request('/dashboard/stats', {}, token)); } catch {} }
  useEffect(()=>{ loadReports(); },[]);
  useEffect(()=>{ if (token) { loadMine(); loadStats(); } else { setMine([]); setStats(null); } },[token,user?.role]);
  useEffect(()=>{ if (!toast) return; const id=setTimeout(()=>setToast(''),4500); return ()=>clearTimeout(id); },[toast]);
  useEffect(()=>{
    const syncAuthRoute = () => {
      if (!localStorage.getItem('fmr_token')) setAuthMode(window.location.pathname === '/register' ? 'register' : 'login');
    };
    window.addEventListener('popstate', syncAuthRoute);
    if (!token && !['/login','/register'].includes(window.location.pathname)) window.history.replaceState({}, '', '/login');
    if (token && ['/','/login','/register'].includes(window.location.pathname)) window.history.replaceState({}, '', '/home');
    return () => window.removeEventListener('popstate', syncAuthRoute);
  }, []);
  function authSuccess(data) { setToken(data.token); setUser(data.user); localStorage.setItem('fmr_token',data.token); localStorage.setItem('fmr_user',JSON.stringify(data.user)); window.history.pushState({}, '', '/home'); setAuthMode(''); setToast(`Welcome${data.user.name ? `, ${data.user.name}` : ''}!`); }
  function logout() { setToken(''); setUser(null); localStorage.removeItem('fmr_token'); localStorage.removeItem('fmr_user'); window.history.pushState({}, '', '/login'); setAuthMode('login'); setActiveTab('overview'); setToast('You have been signed out.'); }
  function useLocation() { if (!navigator.geolocation) return setToast('Geolocation is not supported by this browser.'); setLocationBusy(true); navigator.geolocation.getCurrentPosition(pos=>{setForm(f=>({...f,latitude:String(pos.coords.latitude),longitude:String(pos.coords.longitude)})); setLocationBusy(false); setToast('Location added. You can still edit the coordinates.');},err=>{setLocationBusy(false);setToast(err.code===1?'Location permission denied. Enter coordinates manually.':'Could not get your location. Try again or enter coordinates manually.');},{enableHighAccuracy:true,timeout:10000}); }
  async function submitReport(e) { e.preventDefault(); if (!token) return setAuthMode('login'); setBusy(true); try { const fd=new FormData(); Object.entries(form).forEach(([k,v])=>fd.append(k,v)); if(photo) fd.append('photo',photo); const data=await request('/reports',{method:'POST',body:fd},token); setToast(data.possibleDuplicate ? `Report submitted. Possible duplicate of “${data.possibleDuplicate.title}”.` : 'Your road damage report has been submitted.'); setForm({title:'',description:'',damageType:'Pothole',severity:'Medium',latitude:'',longitude:'',address:''}); setPhoto(null); e.target.reset(); await loadReports(); await loadMine(); setActiveTab('reports'); } catch(e) { setToast(e.message); } finally { setBusy(false); } }
  async function updateReport(id, patch) { try { await request(`/reports/${id}/status`,{method:'PATCH',body:JSON.stringify(patch)},token); setToast('Report updated successfully.'); await loadReports(); await loadStats(); await loadMine(); } catch(e) { setToast(e.message); } }
  const filtered = useMemo(()=>reports.filter(r=>(statusFilter==='All'||r.status===statusFilter)&&(severityFilter==='All'||r.severity===severityFilter)&&`${r.title} ${r.description} ${r.address} ${r.damageType}`.toLowerCase().includes(query.toLowerCase())),[reports,statusFilter,severityFilter,query]);
  const counts = useMemo(()=>({all:reports.length,open:reports.filter(r=>!['Resolved','Rejected'].includes(r.status)).length,resolved:reports.filter(r=>r.status==='Resolved').length,critical:reports.filter(r=>r.severity==='Critical'&&!['Resolved','Rejected'].includes(r.status)).length}),[reports]);
  if (!token) {
    return <div className="auth-screen"><AuthModal
      mode={authMode || 'login'}
      onClose={() => setAuthMode(localStorage.getItem('fmr_token') ? '' : 'login')}
      onSuccess={authSuccess}
      onSwitch={(nextMode) => { setAuthMode(nextMode); window.history.pushState({}, '', nextMode === 'register' ? '/register' : '/login'); }}
      allowClose={false}
    /></div>;
  }
  return <div className="app-shell"><header className="navbar"><a className="brand" href="#top" onClick={()=>setActiveTab('overview')}><span className="brand-mark">F</span><span>FixMyRoad<small>COMMUNITY ROAD SAFETY</small></span></a><nav><button className={activeTab==='overview'?'nav-active':''} onClick={()=>setActiveTab('overview')}>Overview</button><button className={activeTab==='reports'?'nav-active':''} onClick={()=>setActiveTab('reports')}>Explore reports</button>{user && <button className={activeTab==='myreports'?'nav-active':''} onClick={()=>setActiveTab('myreports')}>My reports</button>}{isAuthority && <button className={activeTab==='dashboard'?'nav-active':''} onClick={()=>setActiveTab('dashboard')}>Authority dashboard</button>}</nav><div className="nav-actions">{user ? <><span className="user-label">{user.name}</span><button className="btn small secondary" onClick={logout}>Sign out</button></> : <><button className="btn small ghost" onClick={()=>{setAuthMode('login')}}>Sign in</button><button className="btn small primary" onClick={()=>setAuthMode('register')}>Join community</button></>}</div></header>
  <main id="top">
  {activeTab==='overview' && <><section className="hero"><div className="hero-copy"><div className="eyebrow light">YOUR CITY. YOUR VOICE. SAFER ROADS.</div><h1>Better roads begin<br/>with <em>one report.</em></h1><p>Spot a pothole or damaged street? Help your community get it fixed. Report it, track progress, and keep your neighbourhood moving safely.</p><div className="hero-actions"><button className="btn light-btn" onClick={()=>{document.getElementById('report-form')?.scrollIntoView({behavior:'smooth'}); if(!token)setAuthMode('login');}}>＋ Report road damage</button><button className="btn hero-outline" onClick={()=>setActiveTab('reports')}>Explore public reports ↗</button></div><div className="hero-proof"><span>✓ GPS-tagged reports</span><span>✓ Transparent progress</span><span>✓ Community-powered</span></div></div><div className="hero-art"><div className="art-circle circle-one"></div><div className="art-circle circle-two"></div><div className="road-art"><div className="road-line"></div><div className="road-crack">⌁</div><div className="pin">⌖</div></div><div className="floating-note"><span className="note-icon">✓</span><div><strong>Report received</strong><small>Every report makes a difference</small></div></div><div className="art-label">SAFER STREETS, TOGETHER</div></div></section>
  <section className="stats-strip"><div><span className="stat-icon">◎</span><div><strong>{counts.all}</strong><small>Community reports</small></div></div><div><span className="stat-icon orange">◷</span><div><strong>{counts.open}</strong><small>Need attention</small></div></div><div><span className="stat-icon blue">✓</span><div><strong>{counts.resolved}</strong><small>Issues resolved</small></div></div><div><span className="stat-icon red">!</span><div><strong>{counts.critical}</strong><small>Critical issues open</small></div></div></section>
  <section className="section report-section"><div className="section-heading"><div><div className="eyebrow">MAKE A DIFFERENCE</div><h2>Report a road issue</h2><p>Share what you see. Add a photo and location to help authorities respond faster.</p></div><div className="step-pill"><span>01</span> Report <i>—</i> <span>02</span> Track <i>—</i> <span>03</span> Resolve</div></div><div className="report-layout"><form id="report-form" className="form-panel" onSubmit={submitReport}><div className="panel-title"><div><h3>New damage report</h3><p>Fields marked * are required.</p></div><span className="form-icon">↗</span></div>{!token&&<div className="notice">Please <button type="button" className="text-button" onClick={()=>setAuthMode('login')}>sign in</button> or <button type="button" className="text-button" onClick={()=>setAuthMode('register')}>create an account</button> before submitting a report.</div>}<label>Report title *<input required maxLength="100" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Large pothole near bus stop"/></label><label>What did you notice? *<textarea required maxLength="1500" rows="3" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe the damage and any safety risk…"/></label><div className="form-row"><label>Issue type *<select value={form.damageType} onChange={e=>setForm({...form,damageType:e.target.value})}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label><label>Severity *<select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})}>{SEVERITIES.map(x=><option key={x}>{x}</option>)}</select></label></div><label>Location *</label><div className="location-row"><input required type="number" step="any" value={form.latitude} onChange={e=>setForm({...form,latitude:e.target.value})} placeholder="Latitude"/><input required type="number" step="any" value={form.longitude} onChange={e=>setForm({...form,longitude:e.target.value})} placeholder="Longitude"/><button type="button" className="btn secondary location-btn" onClick={useLocation} disabled={locationBusy}>{locationBusy?'Locating…':'⌖ Use GPS'}</button></div><label>Address or landmark<input value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="Street, area, or nearby landmark"/></label><label className="upload-box"><span className="upload-icon">＋</span><span><strong>{photo ? photo.name : 'Add a photo (optional)'}</strong><small>JPG, PNG or WEBP · max 5 MB</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setPhoto(e.target.files?.[0]||null)}/><span className="upload-action">Browse</span></label><button className="btn primary full submit-btn" disabled={busy}>{busy?'Submitting report…':'Submit road report →'}</button><p className="form-footnote">Reports are visible publicly so the community can follow progress. Avoid including faces or personal information in photos.</p></form><div className="report-aside"><div className="aside-card map-card"><div className="aside-heading"><div><div className="eyebrow">LIVE COMMUNITY MAP</div><h3>Road issues near you</h3></div><span className="live-dot">● LIVE</span></div><MapView reports={reports}/><div className="map-legend"><span><i className="legend-dot red-dot"></i>Critical / High</span><span><i className="legend-dot green-dot"></i>Other reports</span><button onClick={()=>setActiveTab('reports')}>View all reports ↗</button></div></div><div className="tip-card"><span className="tip-icon">✳</span><div><strong>A better report helps everyone</strong><p>Include a clear photo, precise location, and a short description. Critical hazards should be reported to local emergency or municipal services too.</p></div></div></div></div></section>
  <section className="how-section"><div className="section-heading centered"><div className="eyebrow">SIMPLE. TRANSPARENT. EFFECTIVE.</div><h2>From report to repair</h2><p>Every step is visible, so your community knows what happens next.</p></div><div className="how-grid"><div className="how-card"><span className="how-number">01</span><div className="how-icon">⌖</div><h3>Report an issue</h3><p>Share a photo, location, and description of the road damage you spotted.</p></div><div className="how-card"><span className="how-number">02</span><div className="how-icon">◉</div><h3>Authority reviews</h3><p>Reports are prioritised by severity and can be assigned to the relevant team.</p></div><div className="how-card"><span className="how-number">03</span><div className="how-icon">✓</div><h3>Track the repair</h3><p>Follow status updates from initial report through work in progress to resolution.</p></div></div></section>
  <section className="section latest-section"><div className="section-heading"><div><div className="eyebrow">COMMUNITY WATCH</div><h2>Recently reported</h2><p>See the latest road issues shared by your community.</p></div><button className="btn secondary" onClick={()=>setActiveTab('reports')}>Explore all reports ↗</button></div><div className="reports-grid">{reports.slice(0,3).map(r=><ReportCard key={r._id} report={r} onOpen={setSelected}/>)}</div>{!reports.length&&<div className="empty-state">No reports yet. Be the first to report a road issue.</div>}</section></>}
  {activeTab==='reports' && <section className="section page-section"><div className="eyebrow">PUBLIC TRANSPARENCY</div><h1 className="page-title">Explore road reports</h1><p className="page-subtitle">Browse issues reported by the community and see their latest status.</p><div className="filter-bar"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search reports, street, issue type…"/><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All</option>{STATUSES.map(x=><option key={x}>{x}</option>)}</select><select value={severityFilter} onChange={e=>setSeverityFilter(e.target.value)}><option>All</option>{SEVERITIES.map(x=><option key={x}>{x}</option>)}</select></div><div className="map-wide"><MapView reports={filtered}/></div><div className="results-line">Showing <strong>{filtered.length}</strong> report{filtered.length===1?'':'s'} <span>Sorted by priority and recency</span></div><div className="reports-grid">{filtered.map(r=><ReportCard key={r._id} report={r} onOpen={setSelected}/>)}</div>{!filtered.length&&<div className="empty-state">No reports match these filters.</div>}</section>}
  {activeTab==='myreports' && <section className="section page-section"><div className="eyebrow">YOUR CONTRIBUTION</div><h1 className="page-title">My reports</h1><p className="page-subtitle">Track updates on the road issues you have submitted.</p>{!token?<div className="empty-state">Please sign in to view your reports. <button className="text-button" onClick={()=>setAuthMode('login')}>Sign in</button></div>:<><div className="results-line">{mine.length} report{mine.length===1?'':'s'} submitted</div><div className="reports-grid">{mine.map(r=><ReportCard key={r._id} report={r} onOpen={setSelected}/>)}</div>{!mine.length&&<div className="empty-state">You haven't submitted any reports yet. <button className="text-button" onClick={()=>setActiveTab('overview')}>Report an issue</button></div>}</>}</section>}
  {activeTab==='dashboard' && <section className="section page-section"><div className="eyebrow">OPERATIONS CENTRE</div><h1 className="page-title">Authority dashboard</h1><p className="page-subtitle">Review incoming issues, set ownership, and keep repair statuses up to date.</p>{!isAuthority?<div className="empty-state">Authority access is required. Sign in using an authority account.</div>:<><div className="dashboard-stats">{[['Total reports',stats?.total??reports.length],['Open issues',stats?.open??counts.open],['In progress',stats?.progress??0],['Critical open',stats?.critical??counts.critical]].map(([label,value])=><div className="dash-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div><div className="authority-list">{reports.map(r=><div className="authority-row" key={r._id}><div className="authority-main"><span className={`severity ${r.severity.toLowerCase()}`}>{r.severity}</span><h3>{r.title}</h3><p>{r.damageType} · {r.address || `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}</p><small>Submitted {new Date(r.createdAt).toLocaleDateString()} · {r.reporter?.name || 'Community member'} {r.possibleDuplicateOf?'· Possible duplicate':''}</small></div><div className="authority-controls"><label>Status<select value={r.status} onChange={e=>updateReport(r._id,{status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label><label>Assigned team<input key={`${r._id}-${r.assignedTo}`} defaultValue={r.assignedTo} placeholder="Team / contractor" onBlur={e=>{if(e.target.value!==r.assignedTo)updateReport(r._id,{assignedTo:e.target.value});}}/></label><label>Resolution note<input key={`${r._id}-${r.resolutionNote}`} defaultValue={r.resolutionNote} placeholder="Update / repair note" onBlur={e=>{if(e.target.value!==r.resolutionNote)updateReport(r._id,{resolutionNote:e.target.value});}}/></label><button className="btn secondary small" onClick={()=>setSelected(r)}>View details</button></div></div>)}{!reports.length&&<div className="empty-state">No community reports yet.</div>}</div></>}</section>}
  </main><footer><div className="footer-brand"><span className="brand-mark">F</span><div><strong>FixMyRoad</strong><small>Small reports. Safer journeys.</small></div></div><p>Built for communities that care about safer, better roads.</p><span>© {new Date().getFullYear()} FixMyRoad · Community road safety platform</span></footer>{toast&&<div className="toast" role="status">{toast}<button onClick={()=>setToast('')}>×</button></div>}{authMode&&<AuthModal mode={authMode} onClose={()=>setAuthMode('')} onSuccess={authSuccess} onSwitch={setAuthMode}/>}<ReportDetail report={selected} onClose={()=>setSelected(null)}/></div>;
}
