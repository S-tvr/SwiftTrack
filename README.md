# ShiftTrack — Phase 1 (Single-Tenant)

Time-tracking & payroll app. Admin manages employees; employees clock in/out and view their pay.

Full spec: see `SwiftTrack.md`.

## Stack
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React (Vite) + Tailwind CSS
- Auth: JWT

## Project structure

ShiftTrack/
├── backend/     # NestJS API
├── frontend/    # React app
└── docker-compose.yml   # PostgreSQL (dev)


## Setup

### 1. Database
docker compose up -d

### 2. Backend
cd backend
npm install
cp .env.example .env   # fill in your own values
npx prisma migrate dev
npm run start:dev

### 3. Frontend
cd frontend
npm install
npm run dev

## Status
🚧 Work in progress — initial scaffold stage.