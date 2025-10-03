# Grand Theft Scooter 🛵
### A sweet old grandma has had enough of slow sidewalks and nosy neighbors. She takes her mobility scooter on a joyride through town, leaving destruction in her wake.

```sh
# Setup
make setup
npm ci

# Development
make dev
docker compose -f docker-compose.dev.yml up
make down
docker compose -f docker-compose.dev.yml down

# Build
make build
npm run build
make preview
npm run preview -- --host 0.0.0.0 --port 8080
make clean
rm -rf node_modules dist

# Docker
make docker-build
docker build -t Grand-Theft-Scooter.
make docker-run
docker run --rm -p 8080:80 Grand-Theft-Scooter
make docker-dev
docker compose -f docker-compose.dev.yml up --build

# Testing & Linting
make lint
npm run lint
make typecheck
npm run typecheck
make test
npm test
