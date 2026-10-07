# TutorMatch — El tutor perfecto para cada estudiante (MVP)

Stack: React + TypeScript + Tailwind · Node + Express + TypeScript · Prisma · PostgreSQL 17 · Docker Compose.

## Arranque (un solo comando)
```
docker compose up --build
```
- Web: http://localhost:8080 · API: http://localhost:4000/api/health
- Al iniciar, el backend aplica el esquema (`prisma db push`) y carga el seed (solo si la BD está vacía). Los datos persisten en el volumen `pgdata`.
- `JWT_SECRET` es opcional (ver `.env.example`).

## Usuarios demo (clave `demo1234`)
Estudiantes: `ana@demo.com`, `pablo@demo.com` · Tutores: `laura@demo.com`, `carlos@demo.com`, `marta@demo.com`, `diego@demo.com`, `sofia@demo.com`

## Demo de 3-5 minutos
1. Entra como **ana@demo.com** → *Nueva solicitud*: **Matemáticas**, un **martes o jueves** futuro a las **10:00**, estilo **practico**.
2. El ranking muestra 3 tutores: **Laura 100%** (experta, 10 años, estilo práctico, recomendada), Marta 89%, Carlos 66%. Diego (no enseña Matemáticas) y Sofía (disponible solo desde las 14:00) quedan excluidos.
3. Confirma a Laura → entra como **laura@demo.com** → Notificaciones/Solicitudes → *Proponer otro horario* (p. ej. 11:00 ese día).
4. Vuelve como **ana** → *Aceptar horario propuesto* → tutoría **CONFIRMADA**.
5. Ambos ven la tutoría en **Calendario**. (Si Laura rechaza, Ana vuelve al ranking y elige a Marta.)

## Matching (`backend/src/matching.service.ts`)
Score 0-100 = Materia 40% (nivel de dominio) + Disponibilidad 30% + Experiencia 20% (años + valoración) + Preferencias 10% (estilo). Sin la materia o sin ventana libre (disponibilidad − tutorías ya confirmadas) → no se recomienda. Cada resultado trae su explicación.

## Tests y tipos
```
docker compose run --rm backend npm test
docker compose run --rm backend npm run typecheck
```

## Notas
- Las horas son "hora de pared" (se guardan en UTC y se muestran sin conversión); las tutorías duran 1 h.
- Seguridad: bcrypt, JWT, autorización por rol, validación Zod en todas las entradas.
- Se usa `prisma db push` en lugar de migraciones para simplificar el arranque del MVP.
