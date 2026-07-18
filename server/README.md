# CPAce Mobile Backend (Express.js)

A standalone Express.js backend for the CPAce mobile app. It connects directly to
the same `cpace_db` MySQL database as the web version (XAMPP/MariaDB) but is a
completely separate backend

It mirrors the web version's business logic:

- **Auth** — bearer tokens in `api_tokens` (128-char hex, 30-day expiry), bcrypt
  passwords compatible with Laravel's `$2y$` hashes, students only (role_id 2).
- **Quiz engine** — adaptive / topic / timed / challenge selection, deterministic
  per-session choice shuffling and question paraphrasing (crc32-seeded, same as
  the web's `QuestionParaphraser`), grading, `performance_records`,
  `points_log` + `student_profiles.total_points`.
- **SM-2 spaced repetition** — same SuperMemo-2 math as the web's
  `SpacedRepetitionScheduler`, writing `spaced_repetition_items`.
- **Weakness detection** — accuracy < 60% over ≥ 5 attempts or 3 consecutive
  wrong, syncing `weakness_reports`.
- **Streaks** — consecutive active days computed live from `quiz_sessions`,
  mirrored into `student_profiles.streak_days`.

## Run

1. Start MySQL in XAMPP (the `cpace_db` database must exist).
2. Check `server/.env` (defaults: root / no password / cpace_db / port 4000).
3. Install and start:

   ```
   cd server
   npm install
   npm start        # or: npm run dev (auto-restart on change)
   ```

4. Health check: http://localhost:4000/api/health

## Mobile app

`lib/api/client.ts` has `MOCK_MODE = false` and auto-derives the backend host
from the Expo dev server, so a physical phone on the same Wi-Fi and the Android
emulator both reach the server without editing IPs. Make sure Windows Firewall
allows Node on port 4000 for physical devices.

## Endpoints

Public: `POST /api/login`, `POST /api/signup`
Authenticated (Bearer token): `POST /api/logout`, `GET /api/user`,
`PUT /api/profile`, `GET /api/dashboard`, `GET /api/subjects`,
`POST /api/quizzes/start`, `GET /api/quizzes/history`, `GET /api/quizzes/:id`,
`POST /api/quizzes/:id/submit`, `POST /api/quizzes/:id/cancel`,
`GET /api/quizzes/:id/results`, `GET /api/performance`,
`GET/POST/PUT/DELETE /api/review-notes[...]`, `POST /api/review-notes/:id/favorite`,
`GET /api/calendar?year&month`, `GET /api/notifications`,
`POST /api/notifications/read-all`
