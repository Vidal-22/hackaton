import test from 'node:test';
import assert from 'node:assert/strict';
import { rankTutors, isAvailable, MATCHING_WEIGHTS } from './matching.service';
import type { TutorCandidate, MatchInput } from './matching.service';

const mk = (id: string, over: Partial<TutorCandidate> = {}): TutorCandidate => ({
  id, name: id, yearsExperience: 5, rating: 4, style: null,
  subjects: [{ subjectId: 'math', level: 'ADVANCED' }],
  availability: [{ dayOfWeek: 2, startTime: '08:00', endTime: '18:00' }],
  busy: [], ...over,
});
// 2030-01-01 es martes (dayOfWeek 2)
const req: MatchInput = { subjectId: 'math', subjectName: 'Matemáticas', startsAt: new Date('2030-01-01T10:00:00Z'), durationMin: 60, prefStyle: 'practico' };

test('los pesos suman 1', () => {
  assert.ok(Math.abs(Object.values(MATCHING_WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});
test('excluye tutores sin la materia', () => {
  assert.equal(rankTutors(req, [mk('a', { subjects: [{ subjectId: 'fis', level: 'EXPERT' }] })]).length, 0);
});
test('excluye tutores sin disponibilidad o con choque de horario', () => {
  assert.equal(rankTutors(req, [mk('a', { availability: [{ dayOfWeek: 3, startTime: '08:00', endTime: '18:00' }] })]).length, 0);
  const busy = [{ startsAt: new Date('2030-01-01T10:30:00Z'), endsAt: new Date('2030-01-01T11:30:00Z') }];
  assert.equal(isAvailable(mk('a', { busy }), req.startsAt, 60), false);
});
test('el mejor tutor queda primero, score 0-100 y explicación', () => {
  const best = mk('best', { subjects: [{ subjectId: 'math', level: 'EXPERT' }], yearsExperience: 10, rating: 5, style: 'practico' });
  const mid = mk('mid');
  const weak = mk('weak', { subjects: [{ subjectId: 'math', level: 'BASIC' }], yearsExperience: 0, rating: 2 });
  const r = rankTutors(req, [weak, mid, best]);
  assert.deepEqual(r.map((x) => x.tutorId), ['best', 'mid', 'weak']);
  assert.equal(r[0].score, 100);
  assert.ok(r.every((x) => x.score >= 0 && x.score <= 100));
  assert.match(r[0].explanation, /100% de compatibilidad\. Domina Matemáticas a nivel experto/);
});
