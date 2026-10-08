import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

/* ---------- helpers ---------- */
const api = async (path, body, token) => {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const d = await r.json().catch(() => ({ error: 'The server returned an invalid response.' }));
  if (!r.ok) throw Error(d.error || 'Request failed.');
  return d;
};
const fmt = n => '₦' + Number(n || 0).toLocaleString();

/* ---------- brand ---------- */
function Logo({ dark }) {
  return (
    <div className="brand">
      <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0d488" /><stop offset="1" stopColor="#c9962e" />
          </linearGradient>
        </defs>
        <path d="M18 50V14h9l19 28V14" stroke="url(#gold)" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="brand-word">
        <b style={dark ? { color: '#15201c' } : undefined}>nova</b>
        <span style={dark ? { color: '#5c6b66' } : undefined}>banking app</span>
      </div>
    </div>
  );
}

function Art({ kind }) {
  const gold = 'url(#gold)';
  if (kind === 'briefcase') return (
    <svg viewBox="0 0 220 180" className="art">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d488" /><stop offset="1" stopColor="#c9962e" />
        </linearGradient>
      </defs>
      <g fill={gold}>
        <rect x="40" y="70" width="140" height="90" rx="12" />
        <path d="M85 70v-14a10 10 0 0 1 10-10h30a10 10 0 0 1 10 10v14h-14v-10h-22v10z" />
        <rect x="98" y="96" width="24" height="20" rx="4" fill="#0b2f28" />
        <circle cx="182" cy="46" r="12" /><circle cx="196" cy="70" r="8" />
        <circle cx="30" cy="150" r="10" /><circle cx="52" cy="160" r="7" /><circle cx="196" cy="150" r="9" />
      </g>
    </svg>);
  if (kind === 'key') return (
    <svg viewBox="0 0 220 180" className="art">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d488" /><stop offset="1" stopColor="#c9962e" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={gold} strokeWidth="14">
        <circle cx="110" cy="62" r="34" />
        <path d="M110 96v56M110 130h22M110 152h16" strokeLinecap="round" />
      </g>
      <circle cx="110" cy="62" r="12" fill="#0b2f28" />
    </svg>);
  return (
    <svg viewBox="0 0 220 180" className="art">
      <defs>
        <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0d488" /><stop offset="1" stopColor="#c9962e" />
        </linearGradient>
      </defs>
      <g fill={gold}>
        {[0, 1, 2].map(i => <ellipse key={i} cx={60 + i * 50} cy={140 - i * 8} rx="26" ry="10" />)}
        {[0, 1, 2].map(i => <rect key={i} x={34 + i * 50} y={104 - i * 8} width="52" height="32" rx="8" />)}
        <circle cx="150" cy="52" r="14" /><circle cx="180" cy="84" r="10" /><circle cx="118" cy="34" r="9" />
      </g>
    </svg>);
}

/* ---------- onboarding ---------- */
const SLIDES = [
  { t: 'Watch your investment grow', d: 'Trade stocks around the world seamlessly — your one-stop investing app.', a: 'briefcase' },
  { t: 'Your assets are secure on Nova', d: 'U.S. securities are insured up to $500,000. Our partners are regulated by the SEC.', a: 'key' },
  { t: 'Never run out of investment options', d: 'With Nova, enjoy investing in 10,000+ stocks, ETFs, ADRs, and more.', a: 'coins' }
];

function Onboarding({ go }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI(x => (x + 1) % 3), 4500); return () => clearInterval(t); }, []);
  const s = SLIDES[i];
  return (
    <div className="screen onboarding">
      <div className="onb-top">
        <Logo />
      </div>
      <Art kind={s.a} />
      <h1>{s.t}</h1>
      <p>{s.d}</p>
      <div className="dots">{SLIDES.map((_, x) => <button key={x} className={x === i ? 'dot on' : 'dot'} onClick={() => setI(x)} />)}</div>
      <button className="btn primary" onClick={() => go('register')}>Open An Account</button>
      <button className="btn ghost" onClick={() => go('login')}>Log In</button>
    </div>
  );
}

/* ---------- inputs ---------- */
function Field({ label, ...p }) {
  return <label className="field"><span>{label}</span><input {...p} /></label>;
}
function OTP({ value, onChange }) {
  const refs = useRef([]);
  const chars = (value || '').padEnd(6, ' ').slice(0, 6).split('');
  return (
    <div className="otp">
      {chars.map((c, i) => (
        <input key={i} ref={el => refs.current[i] = el} value={c.trim()} inputMode="numeric" maxLength="1"
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '');
            const base = (value || '').padEnd(6, ' ').split('');
            base[i] = v || ' ';
            onChange(base.join('').replace(/ /g, '').trim());
            if (v && i < 5) refs.current[i + 1].focus();
          }}
          onKeyDown={e => { if (e.key === 'Backspace' && !chars[i].trim() && i > 0) refs.current[i - 1].focus(); }} />
      ))}
    </div>
  );
}
function Progress({ step, total }) {
  return <div className="progress"><i style={{ width: `${(step / total) * 100}%` }} /></div>;
}

/* ---------- auth ---------- */
function Auth({ mode, onDone }) {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({});
  const [err, setErr] = useState('');
  const set = (k, v) => setF({ ...f, [k]: v });
  const total = mode === 'register' ? 4 : 2;
  const pwChecks = [
    ['Minimum of 8 characters', (f.password || '').length >= 8],
    ['One UPPERCASE character', /[A-Z]/.test(f.password || '')],
    ['A number and a unique character (!@#$%^&*()_+)', /[0-9]/.test(f.password || '') && /[@#$%^&*()_+!]/.test(f.password || '')]
  ];
  const submit = async () => {
    try {
      setErr('');
      if (mode === 'register') {
        if (step === 1) return setStep(2);
        if (step === 2) return setStep(3);
        if (step === 3) {
          const d = await api('/api/v1/auth/register', { fullName: f.fullName, email: f.email, phone: f.phone, password: f.password });
          setF({ ...f, demoCode: d.demoCode }); return setStep(4);
        }
        await api('/api/v1/auth/verify', { email: f.email, code: f.code });
        onDone(f.email);
      } else {
        if (step === 1) {
          const d = await api('/api/v1/auth/login', { email: f.email, password: f.password });
          setF({ ...f, demoCode: d.demoCode }); return setStep(2);
        }
        const d = await api('/api/v1/auth/login/verify', { email: f.email, code: f.code });
        onDone(d.token);
      }
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="screen">
      <Progress step={step} total={total} />
      <button className="back" onClick={() => step > 1 ? (setStep(step - 1), setErr('')) : onDone(null)}>←</button>

      {mode === 'register' && step === 1 && <>
        <h1>Let’s start with your email address</h1>
        <Field label="Full name" placeholder="Enter your full name" value={f.fullName || ''} onChange={e => set('fullName', e.target.value)} />
        <Field label="Email address" type="email" placeholder="Enter your email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
        <p className="fine">By signing up, I agree to Nova’s Terms &amp; Condition and acknowledge Privacy Policy</p>
      </>}

      {mode === 'register' && step === 2 && <>
        <h1>Secure your account</h1>
        <p className="sub">Add an extra layer of protection to keep your account safe and secure</p>
        <Field label="Create password" type="password" placeholder="Enter password" value={f.password || ''} onChange={e => set('password', e.target.value)} />
        <ul className="checks">{pwChecks.map(([t, ok]) => <li key={t} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {t}</li>)}</ul>
      </>}

      {mode === 'register' && step === 3 && <>
        <h1>Your personal details</h1>
        <p className="sub">Let us know you better — this helps us tailor experiences to you</p>
        <label className="field"><span>Phone number</span>
          <div className="phone"><i>🇳🇬 +234</i><input placeholder="Enter phone number" value={f.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
        </label>
        <Field label="Nationality" value={f.nationality || 'Nigeria'} onChange={e => set('nationality', e.target.value)} />
        <Field label="Referral (Optional)" placeholder="Enter a referral code" value={f.referral || ''} onChange={e => set('referral', e.target.value)} />
      </>}

      {mode === 'register' && step === 4 && <>
        <h1>Verify your email address</h1>
        <p className="sub">Please submit the 6-digit confirmation code sent to <b>{f.email}</b></p>
        <OTP value={f.code} onChange={v => set('code', v)} />
        {f.demoCode && <p className="fine">Code: <b>{f.demoCode}</b></p>}
        <p className="fine">Resend code 0:57</p>
      </>}

      {mode === 'login' && step === 1 && <>
        <h1>Log into your account</h1>
        <p className="sub">Continue with your email and password</p>
        <Field label="Email address" type="email" placeholder="Enter your email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
        <Field label="Password" type="password" placeholder="Enter password" value={f.password || ''} onChange={e => set('password', e.target.value)} />
        <p className="linkline">Forgot password?</p>
      </>}

      {mode === 'login' && step === 2 && <>
        <h1>Verify your email address</h1>
        <p className="sub">Please submit the 6-digit confirmation code sent to <b>{f.email}</b></p>
        <OTP value={f.code} onChange={v => set('code', v)} />
        {f.demoCode && <p className="fine">Code: <b>{f.demoCode}</b></p>}
      </>}

      {err && <div className="error">{err}</div>}
      <button className="btn primary" onClick={submit}>
        {step === total ? 'Verify' : step === 3 && mode === 'register' ? 'Continue' : 'Continue'} →
      </button>
      <p className="fine center">Have an account? <span className="accent" onClick={() => onDone(null, true)}>Login</span></p>
    </div>
  );
}

/* ---------- KYC (client-side tier simulation, matches sample flow) ---------- */
function Kyc({ onDone }) {
  const [done, setDone] = useState(false);
  if (done) return (
    <div className="screen center-screen">
      <div className="confetti">🎉</div>
      <Art kind="coins" />
      <h1>You’re Tier 1 Verified!</h1>
      <p className="sub">To get started, fund your account(s) and create your portfolio(s).</p>
      <div className="notice">Please note that your withdrawals will be limited to <b>₦100,000 per day</b>. Complete your Tier 2 verification to unlock unlimited withdrawals.</div>
      <button className="btn primary" onClick={onDone}>Go to My Account</button>
      <button className="btn ghost">Complete Tier 2 Verification</button>
    </div>
  );
  return (
    <div className="screen">
      <button className="back" onClick={onDone}>←</button>
      <Progress step={2} total={3} />
      <h1>Identity Verification</h1>
      <p className="sub">Provide your BVN, NIN, and a selfie to verify your identity.</p>
      <div className="selfie"><span>📷</span>Tap to take a selfie<small>Use your front camera</small></div>
      <Field label="Bank Verification Number (BVN)" placeholder="Enter your 11-digit BVN" />
      <Field label="National Identification Number (NIN)" placeholder="Enter your 11-digit NIN" />
      <div className="tips"><b>Tips</b><p>✓ Check your BVN by dialling *565*0# on your registered line.</p><p>✓ Check your NIN by dialling *346# on your registered line.</p><p>✓ Ensure your face is well-lit and clearly visible in the selfie.</p></div>
      <button className="btn primary" onClick={() => setDone(true)}>Verify Identity</button>
    </div>
  );
}

/* ---------- dashboard pieces ---------- */
const QUICK = [
  ['Stocks', '📈', 'stocks'], ['Fixed Income', '🏦', 'fixed'], ['Card', '💳', 'card'], ['Stock Gifts', '🎁', 'gifts'],
  ['Primary Offers', '🚀', 'offers'], ['Next Gen', '🧬', 'nextgen'], ['Social', '👥', 'social'], ['More', '•••', 'more']
];
const MARKET = [
  ['NVDA', 'NVIDIA Corp', 240.20, -0.72], ['NIO', 'NIO Inc', 0.37, 48.58],
  ['SPOT', 'Spotify Tech', 173.19, 1.23], ['AAPL', 'Apple Inc', 212.44, 0.64], ['TSLA', 'Tesla Inc', 248.02, -1.85]
];

function Home({ account, user, go }) {
  return (<>
    <div className="hero-row">
      <div className="seg"><button className="on">INDIVIDUAL</button><button>KIDS</button></div>
      <span className="usd">VIEW IN USD ⌄</span>
    </div>
    <p className="muted-label">NET WORTH</p>
    <h1 className="networth">{fmt(account.balance)}<small>▲ 0.00% TODAY</small></h1>

    <div className="section-head"><span>PORTFOLIOS</span><span className="accent">VIEW ALL →</span></div>
    <div className="hscroll">
      <div className="pcard" onClick={() => go('more')}><div className="pface">👧</div><b>Add a Kid</b><small>Start investing for your child</small></div>
      <div className="pcard" onClick={() => go('stocks')}><div className="pface">🇺🇸</div><b>Create US Portfolio</b><small>Invest in US stocks &amp; ETFs</small></div>
      <div className="pcard" onClick={() => go('invest')}><div className="pface">🇳🇬</div><b>Create NG Portfolio</b><small>Invest in Nigerian stocks</small></div>
    </div>

    <div className="section-head"><span>QUICK ACTIONS</span></div>
    <div className="qgrid">
      {QUICK.map(([t, ic, p]) => <button key={t} className="q" onClick={() => go(p)}><i>{ic}</i><span>{t}</span></button>)}
    </div>

    <div className="promo" onClick={() => go('send')}>
      <div><b>Transfer to Nova and get up to a ₦10,000 bonus.</b><button className="btn mini">Get Started →</button></div>
    </div>

    <div className="section-head"><span>MARKET OVERVIEW</span><span className="accent">ALL STOCKS →</span></div>
    <div className="tabs"><button className="on">US</button><button>NG</button></div>
    <div className="tabs sub"><button className="on">Most Active</button><button>Top Gainers</button><button>Top Losers</button></div>
    <div className="panel">
      {MARKET.map(([s, n, p, c]) => <div className="row" key={s}>
        <div className="stock"><i>{s[0]}</i><div><b>{s}</b><small>{n}</small></div></div>
        <div className="price">${p.toFixed(2)}<small className={c >= 0 ? 'up' : 'down'}>{c >= 0 ? '+' : ''}{c}%</small></div>
      </div>)}
    </div>

    <div className="section-head"><span>MARKET INTELLIGENCE</span><span className="accent">SEE MORE →</span></div>
    <div className="tabs"><button className="on">ALL NEWS</button><button>US</button><button>NG</button></div>
    <div className="panel news"><div className="skeleton" /><div className="skeleton w60" /></div>

    <div className="section-head"><span>WHAT’S NEW</span></div>
    <div className="hscroll">
      <div className="promo slim"><b>Automate your investments with ease</b><button className="btn mini">→</button></div>
      <div className="promo slim gold"><b>Gift stocks to friends &amp; family</b><button className="btn mini">→</button></div>
    </div>
  </>);
}

function Panel({ title, children, back }) {
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>{title}</h2></div>
    <div className="panel">{children}</div>
  </>);
}

function Send({ token, back }) {
  const [email, setEmail] = useState(''), [amount, setAmount] = useState(''), [msg, setMsg] = useState('');
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Send money</h2></div>
    <div className="panel">
      <Field label="Recipient email" type="email" placeholder="Enter recipient email" value={email} onChange={e => setEmail(e.target.value)} />
      <Field label="Amount (₦)" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
      {msg && <p className="fine">{msg}</p>}
      <button className="btn primary" onClick={async () => {
        try { await api('/api/v1/transactions/transfer', { recipientEmail: email, amount }, token); setMsg('Transfer completed successfully.'); }
        catch (e) { setMsg(e.message); }
      }}>Send</button>
    </div>
  </>);
}

function Airtime({ token, back }) {
  const [amount, setAmount] = useState(''), [provider, setProvider] = useState('MTN'), [msg, setMsg] = useState('');
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Airtime</h2></div>
    <div className="panel">
      <label className="field"><span>Provider</span>
        <select value={provider} onChange={e => setProvider(e.target.value)}>{['MTN', 'GLO', 'Airtel', '9mobile'].map(p => <option key={p}>{p}</option>)}</select></label>
      <Field label="Amount (₦)" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
      {msg && <p className="fine">{msg}</p>}
      <button className="btn primary" onClick={async () => {
        try { await api('/api/v1/transactions/airtime', { provider, amount }, token); setMsg('Airtime purchased successfully.'); }
        catch (e) { setMsg(e.message); }
      }}>Pay</button>
    </div>
  </>);
}

const Generic = {
  stocks: { t: 'Stocks', rows: [['NVDA', 'NVIDIA Corp · $240.20', 'Watchlist'], ['AAPL', 'Apple Inc · $212.44', 'Watchlist'], ['SPOT', 'Spotify Tech · $173.19', 'Watchlist'], ['DANGCEM', 'Dangote Cement · ₦305.00', 'NG Market']] },
  fixed: { t: 'Fixed Income', rows: [['FGN Savings Bond', '11.5% p.a. · 2yr tenor', 'Subscribe'], ['NT-Bills', '14.2% p.a. · 91 days', 'Subscribe'], ['Eurobond', 'USD · 6.8% p.a.', 'Subscribe']] },
  card: { t: 'Card', rows: [['Virtual USD Card', 'Instant issue · $0 monthly', 'Get Card'], ['NGN Debit Card', 'Free delivery nationwide', 'Order']] },
  gifts: { t: 'Stock Gifts', rows: [['Send a stock gift', 'Pick any stock, any amount', 'Send a Gift']] },
  offers: { t: 'Primary Offers', rows: [['Dangote Industries IPO', '₦250/share · OPEN', 'Open'], ['NovaTech IPO', '₦120/share · UPCOMING', 'Notify Me']] },
  nextgen: { t: 'Next Gen', rows: [['AI Portfolios', 'Smart, automated investing', 'Explore']] },
  social: { t: 'Social', rows: [['Top Investors', 'Follow leading portfolios', 'Discover']] },
  more: { t: 'More', rows: [['Send money', 'Transfers to any Nova user', 'send'], ['Airtime', 'MTN · GLO · Airtel · 9mobile', 'airtime'], ['Utility bills', 'Electricity · Water · Internet · TV', 'bills'], ['International accounts', 'USD · GBP · EUR wallets', 'international'], ['Transaction history', 'All your activity', 'history']] },
  international: { t: 'International accounts', rows: [['USD', '$', 'Wallet'], ['GBP', '£', 'Wallet'], ['EUR', '€', 'Wallet'], ['JPY', '¥', 'Wallet'], ['CAD', 'C$', 'Wallet'], ['AUD', 'A$', 'Wallet'], ['BTC', '₿', 'Wallet']] },
  bills: { t: 'Utility bills', rows: [['Electricity', 'NEPA / PHED · AEDC · EKEDC', 'Pay'], ['Water', 'State water corporations', 'Pay'], ['Internet', 'Fiber & LTE providers', 'Pay'], ['Cable TV', 'DStv · GOtv · StarTimes', 'Pay']] }
};

function GenericPage({ id, go, back }) {
  const g = Generic[id];
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>{g.t}</h2></div>
    <div className="panel">
      {g.rows.map(([a, b, c]) => <div className="row linkrow" key={a} onClick={() => { const q = Generic[c]; if (q) go(c); }}>
        <div><b>{a}</b><small>{b}</small></div><span className="accent">{c} →</span>
      </div>)}
    </div>
  </>);
}

function Invest({ back }) {
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Investments</h2></div>
    <div className="panel">
      <div className="row"><div><b>Dangote Industries IPO</b><small>₦250/share</small></div><span className="up">OPEN</span></div>
      <div className="row"><div><b>NovaTech IPO</b><small>₦120/share</small></div><span className="accent">UPCOMING</span></div>
      <div className="row"><div><b>FGN Savings Bond</b><small>11.5% p.a.</small></div><span className="accent">SUBSCRIBE</span></div>
    </div>
  </>);
}

function History({ token, back }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/v1/transactions/history', null, token).then(setRows).catch(() => { }); }, []);
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Transaction history</h2></div>
    <div className="panel">{rows.length === 0 && <p className="fine">No transactions yet.</p>}
      {rows.map((x, i) => <div className="row" key={i}><span>{x.description}</span><b>{fmt(x.amount)}</b></div>)}</div>
  </>);
}

function Toggle({ on, set }) {
  return <button className={on ? 'switch on' : 'switch'} onClick={() => set(!on)}><i /></button>;
}
function Settings({ back }) {
  const [s, setS] = useState({ two: true, lock: true, face: false });
  const rows = [
    ['Two-step verification', 'Improves security by requiring an OTP after logging in on an unauthorized device', 'two', true],
    ['App lock', 'Require a PIN to unlock your Nova app', 'lock'],
    ['Face ID / Touch ID', 'Require Face ID or Touch ID to unlock your Nova app', 'face']
  ];
  const links = [['Security Questions', 'Your security questions are set up'], ['Transaction PIN', 'Your transaction PIN is active'], ['Notification settings', 'Control how you want to get notified'], ['Appearance', 'Choose a preferred theme for the app'], ['Inactive Portfolios', 'View statements for your inactive accounts'], ['Change password', 'Update your account password'], ['Delete account', 'Remove your account information from our servers']];
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Settings</h2></div>
    <div className="panel">
      {rows.map(([t, d, k]) => <div className="row" key={t}><div><b>{t}</b><small>{d}</small></div><Toggle on={s[k]} set={v => setS({ ...s, [k]: v })} /></div>)}
    </div>
    <div className="panel">
      {links.map(([t, d]) => <div className="row" key={t}><div><b>{t}</b><small>{d}</small></div><span className="accent">→</span></div>)}
    </div>
  </>);
}

function Profile({ user, account, go, back, logout }) {
  return (<>
    <div className="page-head"><button className="back" onClick={back}>←</button><h2>Profile Details</h2></div>
    <div className="panel">
      <div className="row linkrow" onClick={() => go('settings')}><b>🛡 Verification</b><span className="badge">Tier 1 ✓</span></div>
      <div className="row"><b>🎓 Nova Academy</b><span className="accent">→</span></div>
      <div className="row"><b>🎁 Free Shares</b><span className="accent">→</span></div>
      <div className="row"><b>⭐ Watchlists</b><span className="accent">→</span></div>
      <div className="row"><b>ℹ About Nova</b><span className="accent">→</span></div>
      <div className="row"><b>💬 Help &amp; Support</b><span className="accent">→</span></div>
      <div className="row linkrow" onClick={() => go('settings')}><b>⚙ Settings</b><span className="accent">→</span></div>
      <div className="row linkrow" onClick={logout}><b>⏻ Log Out</b></div>
    </div>
    <div className="panel">
      <div className="row"><span>Full name</span><b>{user.fullName}</b></div>
      <div className="row"><span>Email</span><b>{user.email}</b></div>
      <div className="row"><span>Phone</span><b>{user.phone}</b></div>
      <div className="row"><span>Account number</span><b>{account.accountNumber}</b></div>
    </div>
    <div className="section-head"><span>BANK ACCOUNT</span></div>
    <div className="panel">
      <div className="row"><div><b>🏦 Local bank accounts</b><small>Add your bank account</small></div><span className="accent">→</span></div>
      <div className="row"><div><b>🏦 Foreign bank accounts</b><small>Add your bank account</small></div><span className="accent">→</span></div>
    </div>
    <div className="panel empty"><div>⇄</div><b>No trading accounts</b><small>You don’t have any trading accounts yet</small></div>
  </>);
}

/* ---------- app shell ---------- */
function App() {
  const [view, setView] = useState('onboarding'); // onboarding | register | login | kyc | app
  const [page, setPage] = useState('home');
  const [token, setToken] = useState(localStorage.token || '');
  const [account, setAccount] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) api('/api/v1/auth/me', null, token).then(u => {
      setUser(u);
      return api('/api/v1/accounts/me', null, token);
    }).then(setAccount).catch(() => { localStorage.removeItem('token'); setToken(''); setView('onboarding'); });
  }, [token]);

  const logout = () => { localStorage.removeItem('token'); setToken(''); setAccount(null); setUser(null); setView('onboarding'); };
  const go = p => setPage(p);
  const back = () => setPage('home');

  if (view === 'onboarding') return <div className="frame"><Onboarding go={m => setView(m)} /></div>;
  if (view === 'register' || view === 'login') return (
    <div className="frame"><Auth mode={view} onDone={(v, toLogin) => {
      if (toLogin) return setView('login');
      if (view === 'register') return setView('kyc');
      setToken(v);
      setView('app');
    }} /></div>
  );
  if (view === 'kyc') return <div className="frame"><Kyc onDone={() => setView('login')} /></div>;
  if (!account || !user) return <div className="frame"><div className="loading">Loading Nova…</div></div>;

  const pages = {
    home: <Home account={account} user={user} go={go} />,
    send: <Send token={token} back={back} />,
    airtime: <Airtime token={token} back={back} />,
    invest: <Invest back={back} />,
    history: <History token={token} back={back} />,
    settings: <Settings back={back} />,
    profile: <Profile user={user} account={account} go={go} back={back} logout={logout} />
  };
  const genericIds = ['stocks', 'fixed', 'card', 'gifts', 'offers', 'nextgen', 'social', 'more', 'international', 'bills'];

  return (
    <div className="frame">
      <div className="appbar">
        <button className="avatar" onClick={() => go('profile')}>{(user.fullName || 'N')[0]}</button>
        <button className="watch" onClick={() => go('stocks')}>★ Your Watchlist</button>
        <button className="icon" onClick={() => go('stocks')}>🔍</button>
      </div>
      <div className="page">
        {pages[page] || <GenericPage id={page} go={go} back={back} />}
        {genericIds.includes(page) && page === 'more' ? null : null}
      </div>
      <nav className="tabbar">
        <button className={page === 'home' ? 'on' : ''} onClick={back}>🏠<span>Home</span></button>
        <button className={genericIds.includes(page) ? 'on' : ''} onClick={() => go('stocks')}>📈<span>Invest</span></button>
        <button onClick={() => go('send')}>💸<span>Send</span></button>
        <button className={page === 'history' ? 'on' : ''} onClick={() => go('history')}>🧾<span>History</span></button>
        <button className={page === 'settings' || page === 'profile' ? 'on' : ''} onClick={() => go('settings')}>⚙<span>Settings</span></button>
      </nav>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);