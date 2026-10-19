c# CineList: Containerized Movie Watchlist with CI/CD

A movie watchlist split into containers and deployed automatically by Jenkins. Push to Git → Jenkins tests the code, builds images tagged with the build number, deploys them with Docker Compose, and verifies they are healthy. No manual deploy commands.

Course project: **System Architecture and Integration — Containerized Infrastructure and CI/CD Automation using Docker and Jenkins**.

## Architecture

```
Browser ──► proxy (Nginx :8080, the ONLY published port)
             ├── /  (login-gated via auth_request) ──► frontend (Nginx static)
             ├── /api/login|logout|register|me     ──► auth-service (Express) ──┐
             └── /api/*                             ──► movies-api  (Express) ──┤
                                                                                 ▼
                                       db (PostgreSQL 16, volume db-data)   redis 7 (sessions, volume redis-data)
        [ frontend-net: proxy, frontend, auth-service, movies-api ]
        [ backend-net : auth-service, movies-api, db, redis       ]

Developer ─ git push ─► GitHub ─ webhook (ngrok) or polling ─► Jenkins (separate compose)
Jenkins: Checkout ► Test ► Build Images (tag = build #) ► Deploy ► Smoke Test
```

More detail and a diagram: [`docs/architecture.md`](docs/architecture.md).

| Container | Technology | Role |
|---|---|---|
| `proxy` | Nginx 1.27 (unprivileged) | Single entry point, routing, login gate |
| `frontend` | Static HTML/CSS/JS on Nginx | UI; footer shows the build number |
| `auth-service` | Node 20 + Express | Register, login, logout, session check |
| `movies-api` | Node 20 + Express | Watchlist CRUD, featured picks, OMDb lookup, trailers |
| `db` | PostgreSQL 16 (Alpine) | Users, movies, featured picks (named volume) |
| `redis` | Redis 7 (Alpine) | Shared session store (named volume) |
| `jenkins` | Jenkins LTS + Docker CLI | CI/CD (separate compose file) |

## Prerequisites

Git, Docker with Compose v2 (Docker Desktop with WSL 2 on Windows), 8 GB RAM recommended, and an [OMDb API key](https://www.omdbapi.com/apikey.aspx).

## Run the application

```bash
git clone <repo-url> && cd cinelist
cp .env.example .env          # then edit: DB_PASSWORD, SESSION_SECRET, OMDB_API_KEY
docker compose up -d --build
```

Open http://localhost:8080, register an account, and add movies. Data survives `docker compose down` followed by `docker compose up -d` (never use `-v` unless you want to wipe it).

> **First-run note:** `db/init.sql` runs only when the `db-data` volume is empty. If you change the schema later, either write a migration or run `docker compose down -v` once to start fresh (this deletes data).

## Run the tests

Tests run inside Docker, exactly as Jenkins does:

```bash
docker build --target test ./auth-service
docker build --target test ./movies-api
```

Or locally per service: `cd movies-api && npm install && npm test`.

## Set up Jenkins

```bash
cd infra/jenkins
docker compose up -d --build
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # unlock password
docker exec jenkins docker ps                                            # Jenkins can reach Docker
```

1. Open http://localhost:8081, install the suggested plugins, then also **Docker Pipeline** (and the **GitHub** plugin for webhooks).
2. **Manage Jenkins → Credentials**: add a **Secret file** with ID `cinelist-env` containing your real production `.env`. Add a Git token too if the repo is private.
3. **New Item → Pipeline → Pipeline script from SCM**: repository URL, branch `main`, Script Path `Jenkinsfile`.
4. *(Bonus)* Second Pipeline job named `cinelist-rollback` with Script Path `Jenkinsfile.rollback`.

### Trigger (automatic deployment)

The `Jenkinsfile` declares both triggers:

- **Webhook (fast):** GitHub → Settings → Webhooks → Payload URL `https://<public-url>/github-webhook/`, content type `application/json`, push events. Jenkins runs on a laptop, so expose it with `ngrok http 8081`.
- **Poll SCM (fallback):** `pollSCM('H/2 * * * *')` checks the repo every ~2 minutes. No public URL needed. After creating the job, run **Build Now once** so Jenkins registers the triggers.

## Pipeline stages

| Stage | What it does | On failure |
|---|---|---|
| Checkout | Pulls the commit | Pipeline stops |
| Test | `docker build --target test` for auth-service and movies-api | **Stops before Deploy; live app untouched** |
| Build Images | `docker compose build` with `TAG=<build number>` | Pipeline stops |
| Deploy | Copies `.env` from Jenkins credentials, `docker compose up -d --no-build` | Pipeline fails |
| Smoke Test | Polls `/health/auth`, `/health/movies`, `/login.html`, and checks the new build number is in the page | Pipeline fails, prints `docker compose ps` |
| post | Removes `.env`, prunes dangling layers, prints the result | n/a |

## Demo script

1. `docker compose ps` and open http://localhost:8080; note the footer **Build N**. Add a movie.
2. Change a heading or label, commit, `git push`.
3. Without touching Jenkins, watch the pipeline start and walk through the stages.
4. Refresh the browser: the new build number appears, and the movie you added is still there.
5. Push a commit that breaks a test (for example change an expected status code in `movies-api/tests/app.test.js`). The pipeline fails at **Test** and the site stays on the previous build. Revert; it passes again.
6. Show persistence: `docker compose down && docker compose up -d --no-build` (with the right `TAG`), and the movies are still there.
7. Roll back (below).

## Rollback

Every build leaves images tagged `cinelist/<service>:<build number>`.

```bash
# On the Docker host, from a checkout that has your .env:
TAG=14 docker compose -p cinelist up -d --no-build
```

Or run the `cinelist-rollback` Jenkins job with `TARGET_TAG=14`. The footer shows **Build 14** once it is live.

## Repository structure

```
Jenkinsfile, Jenkinsfile.rollback, docker-compose.yml, .env.example
proxy/          Nginx reverse proxy (Dockerfile, nginx.conf)
frontend/       static UI (Dockerfile, nginx.conf, src/)
auth-service/   Express: register/login/logout/me (Dockerfile, src/, tests/)
movies-api/     Express: watchlist, featured, lookup, trailers (Dockerfile, src/, tests/)
db/             PostgreSQL image + init.sql (schema + featured seed)
infra/jenkins/  Jenkins Dockerfile + separate compose
docs/           architecture.md (+ export architecture.png, technical-documentation.pdf)
```

## Security notes

- Secrets live in `.env` (git-ignored) locally and in a Jenkins Secret file credential in CI. Only `.env.example` is committed.
- The database and Redis are on a private network and are never published. Only the proxy publishes a port.
- All app containers run as non-root users.
- **Docker socket caveat:** mounting `/var/run/docker.sock` into Jenkins (running as root) gives Jenkins full control of the host's Docker. Acceptable in a lab, not in production. Safer options: dedicated build agents, rootless Docker, Docker-in-Docker with TLS, Kaniko.
- Because Jenkins talks to the *host* Docker daemon, this stack deliberately uses **no bind mounts** (config is baked into images); relative bind-mount paths would resolve on the host, not inside Jenkins.

## Team

| Member | Role |
|---|---|
| _name_ | Project Lead / Scrum Master |
| _name_ | DevOps / CI-CD Engineer |
| _name_ | Infrastructure Engineer |
| _name_ | Backend and Database Engineer |
| _name_ | Frontend, QA, and Documentation Lead |
