import express, { Request, Response, RequestHandler, NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { PrismaClient, Role } from '@prisma/client';
import { rankTutors, isAvailable, TutorCandidate } from './matching.service';

const db = new PrismaClient();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DURATION = 60;
const STYLES = ['practico', 'teorico', 'visual'] as const;

interface Auth { id: string; role: Role }
declare global { namespace Express { interface Request { auth?: Auth } } }

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const h = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const auth = (...roles: Role[]): RequestHandler => (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET) as Auth;
    if (roles.length && !roles.includes(p.role)) return void res.status(403).json({ error: 'No tienes permiso para esta acción' });
    req.auth = { id: p.id, role: p.role };
    next();
  } catch { res.status(401).json({ error: 'No autenticado' }); }
};

const U = { select: { name: true, email: true } };
const reqInclude = {
  subject: true,
  student: { include: { user: U } },
  matches: { include: { tutor: { include: { user: U } } }, orderBy: { rank: 'asc' as const } },
  session: true,
};
const toDate = (d: string, t: string) => {
  const x = new Date(`${d}T${t}:00.000Z`);
  if (isNaN(x.getTime())) throw new HttpError(400, 'Fecha u hora inválida');
  return x;
};
const fmt = (d: Date) => d.toLocaleString('es', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
const notify = (userId: string, message: string, requestId?: string) => db.notification.create({ data: { userId, message, requestId } });
const dateS = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeS = z.string().regex(/^\d{2}:\d{2}$/);

async function candidates(onlyId?: string): Promise<TutorCandidate[]> {
  const ts = await db.tutorProfile.findMany({
    where: onlyId ? { id: onlyId } : {},
    include: { user: true, subjects: true, availability: true, sessions: { where: { endsAt: { gt: new Date() }, status: 'CONFIRMED' } } },
  });
  return ts.map((t) => ({
    id: t.id, name: t.user.name, yearsExperience: t.yearsExperience, rating: t.rating, style: t.style,
    subjects: t.subjects.map((s) => ({ subjectId: s.subjectId, level: s.level })),
    availability: t.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime })),
    busy: t.sessions.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt })),
  }));
}
const tutorFree = async (tutorId: string, start: Date) => {
  const [t] = await candidates(tutorId);
  return !!t && isAvailable(t, start, DURATION);
};
const shape = (r: any, a: Auth) => (a.role === 'TUTOR' ? { ...r, matches: r.matches.filter((m: any) => m.tutor.userId === a.id) } : r);
const sessionOf = (u: { id: string; name: string; role: Role; email: string }) => ({
  token: jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '7d' }),
  user: { id: u.id, name: u.name, email: u.email, role: u.role },
});

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_q, res) => res.json({ ok: true }));
app.get('/api/subjects', h(async (_q, res) => res.json(await db.subject.findMany({ orderBy: { name: 'asc' } }))));

// ---------- Auth ----------
app.post('/api/auth/register', h(async (req, res) => {
  const d = z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().min(2), role: z.nativeEnum(Role) }).parse(req.body);
  const email = d.email.toLowerCase();
  if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, 'Ese email ya está registrado');
  const user = await db.user.create({
    data: { email, name: d.name, role: d.role, passwordHash: await bcrypt.hash(d.password, 10), ...(d.role === 'STUDENT' ? { student: { create: {} } } : { tutor: { create: {} } }) },
  });
  res.json(sessionOf(user));
}));
app.post('/api/auth/login', h(async (req, res) => {
  const d = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await db.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(d.password, user.passwordHash))) throw new HttpError(401, 'Credenciales inválidas');
  res.json(sessionOf(user));
}));

// ---------- Perfil ----------
app.get('/api/me', auth(), h(async (req, res) => {
  const u = await db.user.findUnique({
    where: { id: req.auth!.id },
    select: { id: true, name: true, email: true, role: true, student: true, tutor: { include: { subjects: true, availability: true } } },
  });
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  res.json(u);
}));
app.put('/api/profile', auth(), h(async (req, res) => {
  const a = req.auth!;
  const style = z.enum(STYLES).nullable().optional();
  if (a.role === 'STUDENT') {
    const d = z.object({ name: z.string().min(2), grade: z.string().max(80), bio: z.string().max(500), style }).parse(req.body);
    await db.user.update({ where: { id: a.id }, data: { name: d.name } });
    await db.studentProfile.update({ where: { userId: a.id }, data: { grade: d.grade, bio: d.bio, style: d.style ?? null } });
  } else {
    const d = z.object({
      name: z.string().min(2), bio: z.string().max(500), yearsExperience: z.number().int().min(0).max(60), style,
      subjects: z.array(z.object({ subjectId: z.string(), level: z.enum(['BASIC', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']) })),
      availability: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: timeS, endTime: timeS }).refine((x) => x.startTime < x.endTime, 'Rango horario inválido')),
    }).parse(req.body);
    const tp = await db.tutorProfile.findUniqueOrThrow({ where: { userId: a.id } });
    await db.$transaction([
      db.user.update({ where: { id: a.id }, data: { name: d.name } }),
      db.tutorProfile.update({ where: { id: tp.id }, data: { bio: d.bio, yearsExperience: d.yearsExperience, style: d.style ?? null } }),
      db.tutorSubject.deleteMany({ where: { tutorId: tp.id } }),
      db.availability.deleteMany({ where: { tutorId: tp.id } }),
      db.tutorSubject.createMany({ data: d.subjects.map((s) => ({ ...s, tutorId: tp.id })) }),
      db.availability.createMany({ data: d.availability.map((s) => ({ ...s, tutorId: tp.id })) }),
    ]);
  }
  res.json({ ok: true });
}));

// ---------- Solicitudes y matching ----------
app.post('/api/requests', auth('STUDENT'), h(async (req, res) => {
  const d = z.object({ subjectId: z.string(), date: dateS, time: timeS, description: z.string().min(5).max(500), prefStyle: z.enum(STYLES).nullable().optional() }).parse(req.body);
  const subject = await db.subject.findUnique({ where: { id: d.subjectId } });
  if (!subject) throw new HttpError(404, 'Materia no encontrada');
  const startsAt = toDate(d.date, d.time);
  if (startsAt < new Date()) throw new HttpError(400, 'La fecha debe ser futura');
  const sp = await db.studentProfile.findUniqueOrThrow({ where: { userId: req.auth!.id } });
  const ranked = rankTutors({ subjectId: subject.id, subjectName: subject.name, startsAt, durationMin: DURATION, prefStyle: d.prefStyle }, await candidates());
  const created = await db.tutoringRequest.create({
    data: {
      studentId: sp.id, subjectId: subject.id, startsAt, description: d.description, prefStyle: d.prefStyle ?? null,
      status: ranked.length ? 'MATCHED' : 'NO_MATCH',
      matches: { create: ranked.map((m, i) => ({ tutorId: m.tutorId, score: m.score, explanation: m.explanation, rank: i + 1, selected: i === 0 })) },
    },
    include: reqInclude,
  });
  await notify(req.auth!.id, ranked.length ? `Tutor recomendado para ${subject.name}: ${ranked[0].tutorName} (${ranked[0].score}%). Confírmalo para enviarle la solicitud.` : `No hay tutores compatibles para ${subject.name} en ese horario.`, created.id);
  res.json(created);
}));

app.get('/api/requests', auth(), h(async (req, res) => {
  const a = req.auth!;
  const where = a.role === 'STUDENT'
    ? { student: { userId: a.id } }
    : { status: { in: ['AWAITING_TUTOR', 'AWAITING_STUDENT', 'CONFIRMED'] as ('AWAITING_TUTOR' | 'AWAITING_STUDENT' | 'CONFIRMED')[] }, matches: { some: { selected: true, tutor: { userId: a.id } } } };
  const rs = await db.tutoringRequest.findMany({ where, include: reqInclude, orderBy: { createdAt: 'desc' } });
  res.json(rs.map((r) => shape(r, a)));
}));

// El estudiante confirma un tutor del ranking -> se notifica al tutor
app.post('/api/requests/:id/select', auth('STUDENT'), h(async (req, res) => {
  const { matchId } = z.object({ matchId: z.string() }).parse(req.body);
  const r = await db.tutoringRequest.findUnique({ where: { id: req.params.id }, include: { subject: true, student: { include: { user: U } }, matches: { include: { tutor: true } } } });
  if (!r || r.student.userId !== req.auth!.id) throw new HttpError(404, 'Solicitud no encontrada');
  if (r.status !== 'MATCHED') throw new HttpError(409, 'La solicitud ya no admite cambiar de tutor');
  const m = r.matches.find((x) => x.id === matchId && !x.rejected);
  if (!m) throw new HttpError(400, 'Tutor no válido');
  await db.$transaction([
    db.match.updateMany({ where: { requestId: r.id }, data: { selected: false } }),
    db.match.update({ where: { id: m.id }, data: { selected: true } }),
    db.tutoringRequest.update({ where: { id: r.id }, data: { status: 'AWAITING_TUTOR', proposedStart: null, proposedBy: null } }),
    notify(m.tutor.userId, `Nueva solicitud de ${r.subject.name} de ${r.student.user.name} para ${fmt(r.startsAt)} (compatibilidad ${m.score}%).`, r.id),
  ]);
  res.json({ ok: true });
}));

// Aceptar / rechazar / proponer horario (tutor y estudiante, por turnos)
app.post('/api/requests/:id/respond', auth(), h(async (req, res) => {
  const a = req.auth!;
  const d = z.object({ action: z.enum(['ACCEPT', 'REJECT', 'PROPOSE']), date: dateS.optional(), time: timeS.optional() }).parse(req.body);
  const r = await db.tutoringRequest.findUnique({
    where: { id: req.params.id },
    include: { subject: true, student: { include: { user: U } }, matches: { where: { selected: true }, include: { tutor: { include: { user: U } } } } },
  });
  const m = r?.matches[0];
  if (!r || !m) throw new HttpError(404, 'Solicitud no encontrada');
  const isTutor = a.role === 'TUTOR';
  if (isTutor ? m.tutor.userId !== a.id : r.student.userId !== a.id) throw new HttpError(403, 'No participas en esta solicitud');
  if (r.status !== (isTutor ? 'AWAITING_TUTOR' : 'AWAITING_STUDENT')) throw new HttpError(409, 'No es tu turno de responder');
  const otherId = isTutor ? r.student.userId : m.tutor.userId;
  const who = isTutor ? m.tutor.user.name : r.student.user.name;
  const current = r.proposedStart ?? r.startsAt;
  const label = r.subject.name;

  if (d.action === 'ACCEPT') {
    if (!(await tutorFree(m.tutorId, current))) throw new HttpError(409, 'El tutor ya no está disponible en ese horario');
    await db.$transaction([
      db.tutoringSession.create({ data: { requestId: r.id, tutorId: m.tutorId, studentId: r.studentId, subjectId: r.subjectId, startsAt: current, endsAt: new Date(current.getTime() + DURATION * 60000) } }),
      db.tutoringRequest.update({ where: { id: r.id }, data: { status: 'CONFIRMED' } }),
      notify(otherId, `Tutoría de ${label} CONFIRMADA: ${fmt(current)} con ${who}.`, r.id),
      notify(a.id, `Tutoría de ${label} CONFIRMADA: ${fmt(current)}.`, r.id),
    ]);
  } else if (d.action === 'REJECT') {
    await db.$transaction([
      db.match.update({ where: { id: m.id }, data: { rejected: true, selected: false } }),
      db.tutoringRequest.update({ where: { id: r.id }, data: { status: 'MATCHED', proposedStart: null, proposedBy: null } }),
      notify(otherId, isTutor ? `${who} rechazó tu solicitud de ${label}. Elige otro tutor del ranking.` : `${who} rechazó el horario propuesto para ${label}.`, r.id),
    ]);
  } else {
    if (!d.date || !d.time) throw new HttpError(400, 'Indica fecha y hora');
    const p = toDate(d.date, d.time);
    if (p < new Date()) throw new HttpError(400, 'La fecha debe ser futura');
    if (!(await tutorFree(m.tutorId, p))) throw new HttpError(400, 'El tutor no está disponible en ese horario');
    await db.$transaction([
      db.tutoringRequest.update({ where: { id: r.id }, data: { status: isTutor ? 'AWAITING_STUDENT' : 'AWAITING_TUTOR', proposedStart: p, proposedBy: a.role } }),
      notify(otherId, `${who} propone otro horario para ${label}: ${fmt(p)}.`, r.id),
    ]);
  }
  res.json({ ok: true });
}));

// ---------- Calendario y notificaciones ----------
app.get('/api/sessions', auth(), h(async (req, res) => {
  const a = req.auth!;
  const ss = await db.tutoringSession.findMany({
    where: { status: 'CONFIRMED', ...(a.role === 'STUDENT' ? { student: { userId: a.id } } : { tutor: { userId: a.id } }) },
    include: { subject: true, tutor: { include: { user: U } }, student: { include: { user: U } } },
    orderBy: { startsAt: 'asc' },
  });
  res.json(ss.map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, subject: s.subject.name, with: a.role === 'STUDENT' ? s.tutor.user.name : s.student.user.name })));
}));
app.get('/api/notifications', auth(), h(async (req, res) => {
  res.json(await db.notification.findMany({ where: { userId: req.auth!.id }, orderBy: { createdAt: 'desc' }, take: 50 }));
}));
app.post('/api/notifications/read', auth(), h(async (req, res) => {
  await db.notification.updateMany({ where: { userId: req.auth!.id, read: false }, data: { read: true } });
  res.json({ ok: true });
}));

app.use((err: unknown, _q: Request, res: Response, _n: NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({ error: err.issues.map((i) => i.message).join('; ') });
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(Number(process.env.PORT) || 4000, () => console.log('API lista'));
