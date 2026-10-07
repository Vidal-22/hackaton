import { useEffect, useState, FormEvent, ReactNode } from 'react';

type Role = 'STUDENT' | 'TUTOR';
interface User { id: string; name: string; email: string; role: Role }

let token = localStorage.getItem('token') || '';
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error');
  return d;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LEVELS: Record<string, string> = { BASIC: 'Básico', INTERMEDIATE: 'Intermedio', ADVANCED: 'Avanzado', EXPERT: 'Experto' };
const STYLES = ['practico', 'teorico', 'visual'];
const STATUS: Record<string, string> = {
  MATCHED: 'Tutor recomendado', NO_MATCH: 'Sin tutores compatibles', AWAITING_TUTOR: 'Esperando al tutor',
  AWAITING_STUDENT: 'Esperando al estudiante', CONFIRMED: 'Confirmada',
};
const fmt = (s: string) => new Date(s).toLocaleString('es', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
const btn = 'rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50';
const btn2 = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100';
const inp = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-600">{label}</span>{children}</label>
);
const Err = ({ msg }: { msg: string }) => (msg ? <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{msg}</p> : null);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [focus, setFocus] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token) { setReady(true); return; }
    api('/me').then(setUser).catch(() => { token = ''; localStorage.removeItem('token'); }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (user) api('/notifications').then((n: any[]) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
  }, [user, page]);

  if (!ready) return null;
  if (!user) return <Auth onLogin={(t, u) => { token = t; localStorage.setItem('token', t); setUser(u); setPage('dashboard'); }} />;

  const isS = user.role === 'STUDENT';
  const nav: [string, string][] = [
    ['dashboard', 'Inicio'], ...(isS ? [['new', 'Nueva solicitud'] as [string, string]] : []),
    ['requests', 'Solicitudes'], ['calendar', 'Calendario'], ['notifications', `Notificaciones${unread ? ` (${unread})` : ''}`], ['profile', 'Perfil'],
  ];
  const go = (p: string, f: string | null = null) => { setFocus(f); setPage(p); };
  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-indigo-700">TutorMatch</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.name} · {isS ? 'Estudiante' : 'Tutor'}</span>
          <button className={btn2} onClick={() => { token = ''; localStorage.removeItem('token'); setUser(null); }}>Salir</button>
        </div>
      </header>
      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
        {nav.map(([k, l]) => (
          <button key={k} onClick={() => go(k)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${page === k ? 'bg-indigo-600 text-white' : 'hover:bg-slate-100'}`}>{l}</button>
        ))}
      </nav>
      {page === 'dashboard' && <Dashboard user={user} go={go} />}
      {page === 'new' && <NewRequest go={go} />}
      {page === 'requests' && <Requests user={user} focus={focus} />}
      {page === 'calendar' && <Calendar />}
      {page === 'notifications' && <Notifications go={go} />}
      {page === 'profile' && <Profile user={user} onSaved={(n) => setUser({ ...user, name: n })} />}
    </div>
  );
}

function Auth({ onLogin }: { onLogin: (t: string, u: User) => void }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'STUDENT' });
  const [err, setErr] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    try { const d = await api(reg ? '/auth/register' : '/auth/login', 'POST', f); onLogin(d.token, d.user); }
    catch (x) { setErr((x as Error).message); }
  };
  return (
    <div className="mx-auto mt-10 max-w-sm p-4">
      <h1 className="mb-1 text-2xl font-bold text-indigo-700">TutorMatch</h1>
      <p className="mb-4 text-sm text-slate-500">El tutor perfecto para cada estudiante</p>
      <form onSubmit={submit} className={`${card} space-y-3`}>
        {reg && <Field label="Nombre"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>}
        <Field label="Email"><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label="Contraseña"><input type="password" className={inp} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} minLength={6} required /></Field>
        {reg && (
          <Field label="Soy">
            <select className={inp} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="STUDENT">Estudiante</option><option value="TUTOR">Tutor</option>
            </select>
          </Field>
        )}
        <Err msg={err} />
        <button className={`${btn} w-full`}>{reg ? 'Crear cuenta' : 'Entrar'}</button>
        <button type="button" className="w-full text-sm text-indigo-700" onClick={() => setReg(!reg)}>{reg ? 'Ya tengo cuenta' : 'Crear una cuenta'}</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Demo (clave demo1234): ana@demo.com, pablo@demo.com (estudiantes); laura@demo.com, carlos@demo.com, marta@demo.com (tutores).</p>
    </div>
  );
}

function Dashboard({ user, go }: { user: User; go: (p: string, f?: string | null) => void }) {
  const [rs, setRs] = useState<any[]>([]);
  const [ss, setSs] = useState<any[]>([]);
  useEffect(() => { api('/requests').then(setRs); api('/sessions').then(setSs); }, []);
  const isS = user.role === 'STUDENT';
  const todo = rs.filter((r) => (isS ? ['AWAITING_STUDENT', 'MATCHED'] : ['AWAITING_TUTOR']).includes(r.status));
  const next = ss.filter((s) => new Date(s.endsAt) > new Date()).slice(0, 4);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={card}>
        <h2 className="mb-2 font-semibold">{isS ? 'Requieren tu acción' : 'Solicitudes por responder'}</h2>
        {todo.length === 0 && <p className="text-sm text-slate-500">Nada pendiente.</p>}
        {todo.map((r) => (
          <button key={r.id} onClick={() => go('requests', r.id)} className="mb-1 block w-full rounded-lg border p-2 text-left text-sm hover:bg-slate-50">
            <b>{r.subject.name}</b> · {fmt(r.startsAt)} <span className="text-slate-500">— {STATUS[r.status]}</span>
          </button>
        ))}
        {isS && <button className={`${btn} mt-2`} onClick={() => go('new')}>Pedir una tutoría</button>}
      </div>
      <div className={card}>
        <h2 className="mb-2 font-semibold">Próximas tutorías</h2>
        {next.length === 0 && <p className="text-sm text-slate-500">Aún no hay tutorías confirmadas.</p>}
        {next.map((s) => <p key={s.id} className="text-sm"><b>{s.subject}</b> con {s.with} · {fmt(s.startsAt)}</p>)}
      </div>
    </div>
  );
}

function NewRequest({ go }: { go: (p: string, f?: string | null) => void }) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [f, setF] = useState({ subjectId: '', date: '', time: '10:00', description: '', prefStyle: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/subjects').then((s) => { setSubjects(s); setF((x) => ({ ...x, subjectId: s[0]?.id || '' })); }); }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/requests', 'POST', { ...f, prefStyle: f.prefStyle || null }); go('requests', r.id); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className={`${card} mx-auto max-w-lg space-y-3`}>
      <h2 className="font-semibold">Nueva solicitud de tutoría (1 hora)</h2>
      <Field label="Materia">
        <select className={inp} value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha"><input type="date" className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
        <Field label="Hora"><input type="time" className={inp} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required /></Field>
      </div>
      <Field label="Descripción"><textarea className={inp} rows={3} minLength={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required /></Field>
      <Field label="Estilo de enseñanza preferido">
        <select className={inp} value={f.prefStyle} onChange={(e) => setF({ ...f, prefStyle: e.target.value })}>
          <option value="">Sin preferencia</option>{STYLES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Err msg={err} />
      <button className={btn} disabled={busy}>{busy ? 'Calculando…' : 'Buscar tutor'}</button>
    </form>
  );
}

function Requests({ user, focus }: { user: User; focus: string | null }) {
  const [rs, setRs] = useState<any[]>([]);
  const load = () => api('/requests').then(setRs);
  useEffect(() => { load(); }, []);
  const sorted = [...rs].sort((a, b) => (a.id === focus ? -1 : b.id === focus ? 1 : 0));
  return (
    <div className="space-y-3">
      {sorted.length === 0 && <p className="text-sm text-slate-500">No hay solicitudes todavía.</p>}
      {sorted.map((r) => <RequestCard key={r.id} r={r} user={user} reload={load} highlight={r.id === focus} />)}
    </div>
  );
}

function RequestCard({ r, user, reload, highlight }: { r: any; user: User; reload: () => void; highlight: boolean }) {
  const [err, setErr] = useState('');
  const [prop, setProp] = useState(false);
  const [d, setD] = useState('');
  const [t, setT] = useState('10:00');
  const isT = user.role === 'TUTOR';
  const myTurn = isT ? r.status === 'AWAITING_TUTOR' : r.status === 'AWAITING_STUDENT';
  const live = r.matches.filter((m: any) => !m.rejected);
  const sel = r.matches.find((m: any) => m.selected);
  const act = async (path: string, body: object) => {
    setErr('');
    try { await api(`/requests/${r.id}/${path}`, 'POST', body); setProp(false); reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className={`${card} ${highlight ? 'ring-2 ring-indigo-400' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{r.subject.name} · {fmt(r.startsAt)}</h3>
          <p className="text-sm text-slate-500">{isT ? `Estudiante: ${r.student.user.name} · ` : ''}{r.description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{STATUS[r.status]}</span>
      </div>
      {r.proposedStart && ['AWAITING_TUTOR', 'AWAITING_STUDENT'].includes(r.status) && (
        <p className="mt-2 text-sm text-amber-700">Horario propuesto por {r.proposedBy === 'TUTOR' ? 'el tutor' : 'el estudiante'}: <b>{fmt(r.proposedStart)}</b></p>
      )}
      {r.status === 'NO_MATCH' && <p className="mt-2 text-sm text-slate-600">Ningún tutor domina la materia con disponibilidad en ese horario. Prueba con otra fecha u hora.</p>}
      {r.status === 'CONFIRMED' && r.session && <p className="mt-2 text-sm font-medium text-green-700">Confirmada para {fmt(r.session.startsAt)}</p>}
      {!isT && r.status === 'MATCHED' && (
        live.length === 0 ? <p className="mt-2 text-sm text-slate-600">Ya no quedan tutores compatibles. Crea una nueva solicitud.</p> : (
          <ul className="mt-3 space-y-2">
            {live.map((m: any, i: number) => (
              <li key={m.id} className={`rounded-lg border p-3 ${i === 0 ? 'border-indigo-400 bg-indigo-50' : ''}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">#{i + 1} {m.tutor.user.name} {i === 0 && <span className="ml-1 rounded bg-indigo-600 px-2 py-0.5 text-xs text-white">Recomendado</span>}</span>
                  <span className="text-lg font-bold text-indigo-700">{m.score}%</span>
                </div>
                <div className="my-2 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-indigo-600" style={{ width: `${m.score}%` }} /></div>
                <p className="text-sm text-slate-600">{m.explanation}</p>
                <button className={`${i === 0 ? btn : btn2} mt-2`} onClick={() => act('select', { matchId: m.id })}>Confirmar este tutor</button>
              </li>
            ))}
          </ul>
        )
      )}
      {!isT && !['MATCHED', 'NO_MATCH'].includes(r.status) && sel && <p className="mt-2 text-sm">Tutor: <b>{sel.tutor.user.name}</b> ({sel.score}%)</p>}
      {isT && sel && <p className="mt-2 text-sm text-slate-600">{sel.explanation}</p>}
      {myTurn && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button className={btn} onClick={() => act('respond', { action: 'ACCEPT' })}>Aceptar{r.proposedStart ? ' horario propuesto' : ''}</button>
            <button className={btn2} onClick={() => setProp(!prop)}>Proponer otro horario</button>
            <button className={btn2} onClick={() => act('respond', { action: 'REJECT' })}>Rechazar</button>
          </div>
          {prop && (
            <div className="flex flex-wrap items-end gap-2">
              <input type="date" className={`${inp} w-auto`} value={d} onChange={(e) => setD(e.target.value)} />
              <input type="time" className={`${inp} w-auto`} value={t} onChange={(e) => setT(e.target.value)} />
              <button className={btn} disabled={!d} onClick={() => act('respond', { action: 'PROPOSE', date: d, time: t })}>Enviar propuesta</button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2"><Err msg={err} /></div>
    </div>
  );
}

function Calendar() {
  const [s, setS] = useState<any[]>([]);
  const [m, setM] = useState(() => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)); });
  useEffect(() => { api('/sessions').then(setS); }, []);
  const first = m.getUTCDay();
  const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const on = (d: number) => s.filter((x) => { const t = new Date(x.startsAt); return t.getUTCFullYear() === m.getUTCFullYear() && t.getUTCMonth() === m.getUTCMonth() && t.getUTCDate() === d; });
  const shift = (n: number) => setM(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1)));
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <button className={btn2} onClick={() => shift(-1)}>←</button>
        <h2 className="font-semibold capitalize">{m.toLocaleString('es', { timeZone: 'UTC', month: 'long', year: 'numeric' })}</h2>
        <button className={btn2} onClick={() => shift(1)}>→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {DAYS.map((d) => <div key={d} className="text-center font-medium text-slate-500">{d}</div>)}
        {cells.map((d, i) => (
          <div key={i} className={`min-h-[3.5rem] rounded border p-1 ${d ? 'bg-white' : 'border-transparent'}`}>
            {d > 0 && <div className="text-slate-400">{d}</div>}
            {d > 0 && on(d).map((x) => (
              <div key={x.id} className="mt-0.5 rounded bg-indigo-600 px-1 py-0.5 text-white" title={`${x.subject} con ${x.with}`}>
                {new Date(x.startsAt).toLocaleTimeString('es', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} {x.subject}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Notifications({ go }: { go: (p: string, f?: string | null) => void }) {
  const [ns, setNs] = useState<any[]>([]);
  useEffect(() => { api('/notifications').then(setNs).then(() => api('/notifications/read', 'POST')); }, []);
  return (
    <div className="space-y-2">
      {ns.length === 0 && <p className="text-sm text-slate-500">Sin notificaciones.</p>}
      {ns.map((n) => (
        <button key={n.id} onClick={() => n.requestId && go('requests', n.requestId)} className={`${card} block w-full text-left text-sm ${n.read ? '' : 'border-indigo-300 bg-indigo-50'}`}>
          {n.message}<span className="ml-2 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString('es')}</span>
        </button>
      ))}
    </div>
  );
}

function Profile({ user, onSaved }: { user: User; onSaved: (name: string) => void }) {
  const isT = user.role === 'TUTOR';
  const [subjects, setSubjects] = useState<any[]>([]);
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api('/subjects').then(setSubjects);
    api('/me').then((u) => {
      const p = isT ? u.tutor : u.student;
      setF({ name: u.name, bio: p.bio, style: p.style || '', grade: p.grade || '', yearsExperience: p.yearsExperience || 0,
        subjects: (p.subjects || []).map((s: any) => ({ subjectId: s.subjectId, level: s.level })),
        availability: (p.availability || []).map((a: any) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })) });
    });
  }, [isT]);
  if (!f) return null;
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const save = async (e: FormEvent) => {
    e.preventDefault(); setMsg('');
    try { await api('/profile', 'PUT', { ...f, style: f.style || null }); onSaved(f.name); setMsg('Perfil guardado'); }
    catch (x) { setMsg((x as Error).message); }
  };
  const lvl = (id: string) => f.subjects.find((s: any) => s.subjectId === id)?.level || '';
  const setLvl = (id: string, level: string) =>
    set('subjects', [...f.subjects.filter((s: any) => s.subjectId !== id), ...(level ? [{ subjectId: id, level }] : [])]);
  const setAv = (i: number, k: string, v: unknown) => set('availability', f.availability.map((a: any, j: number) => (j === i ? { ...a, [k]: v } : a)));
  return (
    <form onSubmit={save} className={`${card} mx-auto max-w-2xl space-y-3`}>
      <h2 className="font-semibold">Mi perfil · {user.email}</h2>
      <Field label="Nombre"><input className={inp} value={f.name} onChange={(e) => set('name', e.target.value)} required /></Field>
      {!isT && <Field label="Curso / nivel"><input className={inp} value={f.grade} onChange={(e) => set('grade', e.target.value)} /></Field>}
      {isT && <Field label="Años de experiencia"><input type="number" min={0} className={inp} value={f.yearsExperience} onChange={(e) => set('yearsExperience', Number(e.target.value))} /></Field>}
      <Field label="Biografía"><textarea className={inp} rows={2} value={f.bio} onChange={(e) => set('bio', e.target.value)} /></Field>
      <Field label={isT ? 'Estilo de enseñanza' : 'Estilo de aprendizaje preferido'}>
        <select className={inp} value={f.style} onChange={(e) => set('style', e.target.value)}><option value="">—</option>{STYLES.map((s) => <option key={s}>{s}</option>)}</select>
      </Field>
      {isT && (
        <>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-600">Materias y nivel de dominio</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {subjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  {s.name}
                  <select className="rounded border px-1 py-1" value={lvl(s.id)} onChange={(e) => setLvl(s.id, e.target.value)}>
                    <option value="">No la enseño</option>{Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-600">Horarios disponibles</p>
            {f.availability.map((a: any, i: number) => (
              <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                <select className={`${inp} w-auto`} value={a.dayOfWeek} onChange={(e) => setAv(i, 'dayOfWeek', Number(e.target.value))}>{DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}</select>
                <input type="time" className={`${inp} w-auto`} value={a.startTime} onChange={(e) => setAv(i, 'startTime', e.target.value)} />
                <input type="time" className={`${inp} w-auto`} value={a.endTime} onChange={(e) => setAv(i, 'endTime', e.target.value)} />
                <button type="button" className={btn2} onClick={() => set('availability', f.availability.filter((_: any, j: number) => j !== i))}>Quitar</button>
              </div>
            ))}
            <button type="button" className={btn2} onClick={() => set('availability', [...f.availability, { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }])}>+ Añadir horario</button>
          </div>
        </>
      )}
      <div className="flex items-center gap-3"><button className={btn}>Guardar</button><span className="text-sm text-slate-600">{msg}</span></div>
    </form>
  );
}
