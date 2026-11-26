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

## What changed in v2, and why it's better

v2 is the `fix/core-security-and-accounts` branch. It fixes the core features that broke on the previous `main` (v1) and closes several security holes. It adds no new features.

| Area | v1 (previous `main`) | v2 | Why it matters |
|---|---|---|---|
| Accounts service | `accounts-service/src/server.js` had been overwritten with a copy of the auth service in commit 2fd24d7, so `/accounts/me` and the `/internal/*` routes were missing | Restored from 2738bc6 and hardened | Login, the ₦5,000 starting balance, transfers and airtime all work again; in v1 they all failed |
| OTP check | `req.body.code` went straight into the database query, so `{"code":{"$ne":null}}` passed verification | Code must be a 6-digit string; it is stored as an HMAC hash; 5 attempts per code; rate limit per email | Closes a 2FA and email-verification bypass |
| OTP delivery | Without SMTP, the code came back in the API response (`demoCode`) and showed in the UI; codes came from `Math.random()` | Code goes only to email or the server log; codes come from `crypto.randomInt` | Anyone reading the response could log in as someone else |
| Money format | JS floats, no upper limit | Integer kobo; amounts parsed from naira strings without float maths; ₦1,000,000 cap | No rounding errors (for example 0.1 + 0.2); no absurd amounts |
| Overspending | Balance check and debit were separate steps, so parallel requests could overspend | One atomic conditional debit | Tested: 10 parallel ₦1,000 transfers from ₦5,000 give exactly 5 successes and a final balance of ₦0 |
| Transfer safety | Debit and credit were two HTTP calls whose responses were never checked, so a failed credit lost the money | One `/internal/transfer` call; a crash part-way is finished exactly once by a retry or a background sweep | Money can't disappear between accounts |
| Repeated requests | A double click or a network retry could send the money twice | `Idempotency-Key` required; a replay returns the original result | Each payment applies exactly once |
| Ledger | Only the sender got a history row | Both sides get a row | The recipient can see incoming transfers |
| Recipient checks | Self-transfer allowed; an unknown email returned "Recipient not found" | Self-transfer rejected; generic error for unknown recipients | No sending money to yourself; nobody can probe which emails have accounts |
| Secrets | Fell back to `change-this-in-production` / `dev-only-secret` | Services refuse to start on missing, weak (under 32 characters) or identical secrets | Stops a deploy from silently running with guessable keys |
| Database | Published on host port 27017 with no auth | Not published; login required | The database is no longer open to the network |
| Session token | Stored in `localStorage` | Kept in memory only | An XSS bug can no longer read and steal it |
| Tests and CI | No tests; `npm test` failed; every push deployed | 17 unit tests; deploy waits for `npm test` | A broken commit no longer goes live automatically |

**Verified:** all 17 unit tests pass. A smoke test against a real MongoDB 8 (with auth) passed every check: OTP injection blocked, attempt cap enforced, balances exact, replays rejected, concurrent overspend prevented, airtime correct, and the database refusing unauthenticated access.

**Not yet changed:** one secret is still shared by all services, the Kubernetes MongoDB still has no auth, there are no lockfiles, and the AWS account ID is still in `k8s/`.

## License

Proprietary — © Nova Financial Technologies. All rights reserved.