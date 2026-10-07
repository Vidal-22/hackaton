export const MATCHING_WEIGHTS = {
  subject: 0.4,
  availability: 0.3,
  experience: 0.2,
  preferences: 0.1,
};

export type LevelName = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
export const LEVEL_SCORE: Record<LevelName, number> = { BASIC: 0.4, INTERMEDIATE: 0.65, ADVANCED: 0.85, EXPERT: 1 };
const LEVEL_ES: Record<LevelName, string> = { BASIC: 'básico', INTERMEDIATE: 'intermedio', ADVANCED: 'avanzado', EXPERT: 'experto' };

export interface TutorCandidate {
  id: string;
  name: string;
  yearsExperience: number;
  rating: number; // 0-5: prioridad/valoración del tutor
  style: string | null;
  subjects: { subjectId: string; level: LevelName }[];
  availability: { dayOfWeek: number; startTime: string; endTime: string }[];
  busy: { startsAt: Date; endsAt: Date }[];
}

export interface MatchInput {
  subjectId: string;
  subjectName: string;
  startsAt: Date; // hora "de pared" almacenada en UTC
  durationMin: number;
  prefStyle?: string | null;
}

export interface MatchResult {
  tutorId: string;
  tutorName: string;
  score: number;
  breakdown: { subject: number; availability: number; experience: number; preferences: number };
  explanation: string;
}

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function isAvailable(t: TutorCandidate, start: Date, durationMin: number): boolean {
  const end = new Date(start.getTime() + durationMin * 60000);
  const s = start.getUTCHours() * 60 + start.getUTCMinutes();
  const inWindow = t.availability.some(
    (a) => a.dayOfWeek === start.getUTCDay() && toMin(a.startTime) <= s && toMin(a.endTime) >= s + durationMin,
  );
  const free = !t.busy.some((b) => b.startsAt < end && b.endsAt > start);
  return inWindow && free;
}

export function rankTutors(req: MatchInput, tutors: TutorCandidate[]): MatchResult[] {
  const W = MATCHING_WEIGHTS;
  const rows = tutors.flatMap((t) => {
    const subj = t.subjects.find((s) => s.subjectId === req.subjectId);
    if (!subj || !isAvailable(t, req.startsAt, req.durationMin)) return []; // no recomendable
    const b = {
      subject: LEVEL_SCORE[subj.level],
      availability: 1,
      experience: Math.min(t.yearsExperience / 10, 1) * 0.6 + Math.min(t.rating / 5, 1) * 0.4,
      preferences: !req.prefStyle ? 0.5 : t.style === req.prefStyle ? 1 : 0,
    };
    const raw = b.subject * W.subject + b.availability * W.availability + b.experience * W.experience + b.preferences * W.preferences;
    const score = Math.round(raw * 100);
    const expLabel = b.experience >= 0.75 ? 'alta' : b.experience >= 0.45 ? 'media' : 'básica';
    const styleNote = req.prefStyle && b.preferences === 1 ? ` y coincide con tu estilo preferido (${req.prefStyle})` : '';
    const explanation = `${score}% de compatibilidad. Domina ${req.subjectName} a nivel ${LEVEL_ES[subj.level]}, está disponible en el horario solicitado y tiene ${expLabel} experiencia${styleNote}.`;
    return [{ raw, r: { tutorId: t.id, tutorName: t.name, score, breakdown: b, explanation } as MatchResult }];
  });
  return rows.sort((a, b) => b.raw - a.raw || a.r.tutorName.localeCompare(b.r.tutorName)).map((x) => x.r);
}
