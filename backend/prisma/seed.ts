import { PrismaClient, Level } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
const wk = [1, 2, 3, 4, 5];
const av = (days: number[], startTime: string, endTime: string) => days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }));

async function main() {
  if ((await db.user.count()) > 0) return console.log('Seed omitido: ya hay datos');
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const subj: Record<string, string> = {};
  for (const name of ['Matemáticas', 'Física', 'Química', 'Programación', 'Inglés']) subj[name] = (await db.subject.create({ data: { name } })).id;

  const tutors: { name: string; email: string; years: number; rating: number; style: string; bio: string; subjects: [string, Level][]; availability: ReturnType<typeof av> }[] = [
    { name: 'Laura Gómez', email: 'laura@demo.com', years: 10, rating: 4.9, style: 'practico', bio: 'Doctora en matemáticas, 10 años enseñando.', subjects: [['Matemáticas', 'EXPERT'], ['Física', 'ADVANCED']], availability: av(wk, '08:00', '18:00') },
    { name: 'Carlos Ruiz', email: 'carlos@demo.com', years: 3, rating: 4.2, style: 'teorico', bio: 'Estudiante de último año de ingeniería.', subjects: [['Matemáticas', 'INTERMEDIATE'], ['Química', 'BASIC']], availability: av(wk, '09:00', '12:00') },
    { name: 'Marta Silva', email: 'marta@demo.com', years: 6, rating: 4.6, style: 'practico', bio: 'Ingeniera y docente universitaria.', subjects: [['Matemáticas', 'ADVANCED'], ['Programación', 'INTERMEDIATE']], availability: av([2, 4], '08:00', '20:00') },
    { name: 'Diego Torres', email: 'diego@demo.com', years: 8, rating: 4.7, style: 'teorico', bio: 'Físico, especialista en olimpiadas.', subjects: [['Física', 'EXPERT'], ['Química', 'ADVANCED'], ['Inglés', 'INTERMEDIATE']], availability: av(wk, '08:00', '20:00') },
    { name: 'Sofía Peña', email: 'sofia@demo.com', years: 2, rating: 4.0, style: 'visual', bio: 'Desarrolladora y profesora de inglés.', subjects: [['Programación', 'EXPERT'], ['Inglés', 'ADVANCED'], ['Matemáticas', 'BASIC']], availability: av(wk, '14:00', '20:00') },
  ];
  for (const t of tutors) {
    await db.user.create({
      data: {
        email: t.email, name: t.name, role: 'TUTOR', passwordHash,
        tutor: { create: { bio: t.bio, yearsExperience: t.years, rating: t.rating, style: t.style,
          subjects: { create: t.subjects.map(([n, level]) => ({ subjectId: subj[n], level })) },
          availability: { create: t.availability } } },
      },
    });
  }
  for (const [name, email, grade, style] of [['Ana Martínez', 'ana@demo.com', '11° grado', 'practico'], ['Pablo Díaz', 'pablo@demo.com', '1er año universidad', 'teorico']]) {
    await db.user.create({ data: { email, name, role: 'STUDENT', passwordHash, student: { create: { grade, style, bio: 'Quiero mejorar mis notas.' } } } });
  }
  console.log('Seed listo (password: demo1234)');
}
main().finally(() => db.$disconnect());
