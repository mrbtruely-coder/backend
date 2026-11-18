# backend

Saranam Ayyappa Devotional Portal & Mobile App - Backend API.

## Tech Stack
- **Framework:** NestJS 10 (Express)
- **Database / ORM:** MariaDB / MySQL with Prisma ORM 6
- **Language:** TypeScript / Node.js
- **Auth:** Firebase Admin (Phone OTP) & Google OAuth
- **Entry Points:** `app.js` (cPanel Passenger) / `src/main.ts`

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your database credentials and API port:
```bash
cp .env.example .env
```

### 3. Database Migration & Prisma Client
```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Build Project
```bash
npm run build
```

### 5. Start Server
```bash
# Production mode
npm run start:prod

# Development mode
npm run dev
```
