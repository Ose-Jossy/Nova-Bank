# NovaBank — production-oriented learning/demo banking app

NovaBank is a simulated banking application for learning and demonstrations. **It is not a real bank and must not be used for real money, real KYC, real securities orders, real crypto custody, or real utility settlement.**

## Architecture
- React + Vite frontend
- Express microservices (`auth`, `accounts`, `transactions`)
- MongoDB
- Docker Compose (Kubernetes manifests coming next — see `k8s/`)

## Security fix applied in this version

The original build proxied `/accounts/` and `/transactions/` wholesale through nginx, which meant each service's **unauthenticated internal routes** (`/internal/provision`, `/internal/by-user/:id`, `/internal/change`) were reachable directly from the public internet — anyone could credit or debit any account with no login at all.

This version fixes that with two layers of defense:
1. **nginx now only proxies specific public `/api/v1/...` paths.** Internal routes are never listed, so they're structurally unreachable through the reverse proxy.
2. **A shared `INTERNAL_SERVICE_SECRET`** is required on every internal route, checked via an `x-internal-secret` header — so even if something else ever exposes them, they still refuse unauthenticated callers.
3. **`accounts-service` gained a proper public endpoint**, `GET /api/v1/accounts/me`, which verifies the caller's JWT and returns only *their own* account — this is what the frontend calls now, instead of reaching into `/internal/by-user/:id` directly.

## Password policy
At least 8 characters. Allowed characters are:
`A-Z a-z 0-9 @ # $ % ^ & * ( ) _ + !`

## Run with Docker
1. Install Docker Desktop.
2. Copy `.env.example` to `.env` and set a strong, unique value for both `JWT_SECRET` and `INTERNAL_SERVICE_SECRET`.
3. Run `docker compose up --build`.
4. Open `http://localhost:5173`.

SMTP is optional for local learning. Without SMTP, verification codes are printed in the auth container logs. For production email, configure SMTP credentials through your secret manager.

## GitHub + VS Code

This is a normal source repository. Push it to GitHub, clone it anywhere, open it in VS Code, edit any file, and commit/push as usual:

```bash
git init
git add .
git commit -m "Initial NovaBank production learning environment"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## Before real production

This project remains a learning/demo system. A genuine financial product would require regulated banking/payment partners, double-entry ledgering, idempotency, reconciliation, audit trails, fraud/AML controls, secrets management, rate limiting, observability, backups, high availability, security testing, and applicable regulatory/compliance work. Do not connect real customer funds to this code without a substantial security and architecture review.
