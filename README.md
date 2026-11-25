# Nova Banking App

Nova is a full-stack digital banking and investing platform built for the Nigerian market — send money instantly, buy airtime and pay bills, and invest in Nigerian and U.S. stocks, ETFs, bonds and more, all from one account.

![stack](https://img.shields.io/badge/stack-React%20%C2%B7%20Express%20%C2%B7%20MongoDB%20%C2%B7%20Docker%20%C2%B7%20Kubernetes-00c896)

## Features

- **Accounts & Onboarding** — email + phone registration, 6-digit email verification, password policy enforcement, tier-based identity verification (Tier 1 / Tier 2)
- **Payments** — peer-to-peer transfers by email, instant airtime (MTN, Glo, Airtel, 9mobile), utility bills
- **Investing** — US & NG portfolios, stocks and ETFs watchlists, fixed income (FGN bonds, T-bills, Eurobonds), primary offers / IPOs, stock gifts
- **International wallets** — USD, GBP, EUR and more, from a single login
- **Security** — bcrypt password hashing, JWT sessions, two-step OTP verification on every login, internal service authentication
- **Activity** — full transaction history with running balance

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19 + Vite, mobile-first design |
| Services   | Node.js + Express (auth, accounts, transactions) |
| Database   | MongoDB 8 |
| Proxy      | nginx (public API paths only) |
| Containers | Docker Compose, Kubernetes (K3s), ECR |
| CI/CD      | GitHub Actions → auto-deploy to EC2 |
| Edge       | Caddy (automatic HTTPS via Let's Encrypt) |

## Architecture

```
Browser / Mobile
      │  HTTPS
      ▼
   Caddy ──► nginx (frontend)
                 │  /api/v1/auth/*         ▼
                 │  /api/v1/accounts/*   auth-service :4001 ─┐
                 │  /api/v1/transactions/* accounts :4002   │ x-internal-secret
                 ▼                        transactions :4003 ┘
              MongoDB (per-service databases)
```

Internal routes (`/internal/*`) are never exposed through the reverse proxy and require a shared `INTERNAL_SERVICE_SECRET` header — even if a route were exposed, it refuses unauthenticated callers. Each user can only ever read their own account via `GET /api/v1/accounts/me`, verified against their JWT.

## Getting Started

### Prerequisites
- Docker with the Compose plugin

### Run locally

```bash
cp .env.example .env
# Fill the three secrets with distinct generated values (hex keeps them URL-safe):
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^INTERNAL_SERVICE_SECRET=.*/INTERNAL_SERVICE_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^MONGO_ROOT_PASSWORD=.*/MONGO_ROOT_PASSWORD=$(openssl rand -hex 32)/" .env
docker compose up --build
```

Open `http://localhost:5173`.

The services refuse to start if `JWT_SECRET` or `INTERNAL_SERVICE_SECRET` is missing, shorter than 32 characters, a known default, or if the two are equal. Compose refuses to start if any secret is unset.

Every new account is provisioned automatically with a ₦5,000 starting balance. Email verification and login codes are delivered via SMTP when configured; otherwise they're printed in the auth container logs: `docker compose logs auth`.

**Upgrading an existing install:** reset the volume with `docker compose down -v`. MongoDB only creates the root user on an empty volume, and balances are now stored in integer kobo, so old data is not compatible.

## Environment Variables

| Variable | Description |
|---|---|
| `JWT_SECRET` | Signing key for session tokens |
| `INTERNAL_SERVICE_SECRET` | Shared secret for service-to-service calls (must differ from `JWT_SECRET`) |
| `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` | MongoDB root credentials (Mongo is not published on the host) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Transactional email (verification codes) |
| `MAIL_FROM` | Sender identity for outbound email |

## Deployment

- **Docker Compose** — `docker compose up --build -d`
- **CI/CD** — pushing to `main` triggers `.github/workflows/deploy.yml`, which SSHes into the EC2 host, pulls, rebuilds and restarts the stack
- **Kubernetes** — manifests in `k8s/` (StatefulSet MongoDB, service deployments) for K3s clusters

## Security

- Passwords: bcrypt (cost 12), min 8 chars, charset `A-Z a-z 0-9 @#$%^&*()_+!`
- Short-lived JWT sessions (2h) with OTP challenge on every login
- Whitelist-only reverse proxy: internal endpoints structurally unreachable from the internet
- Secrets live in environment variables / your secret manager — never in source control
- OTP codes come from a CSPRNG, are stored only as HMAC hashes, expire (15 min verify, 10 min login) and allow 5 attempts per code; auth routes are rate-limited per email
- Session: the JWT is kept in memory only (no localStorage), so refreshing the page means logging in again. An XSS bug could still act during an open session; the upgrade path is an httpOnly SameSite=Strict cookie
- Transfers and airtime require an `Idempotency-Key` header and apply exactly once. If the accounts service crashes between debiting the sender and crediting the recipient, the money is in flight until a retry with the same key or the background sweep completes it (within about 2 minutes)

## License

Proprietary — © Nova Financial Technologies. All rights reserved.