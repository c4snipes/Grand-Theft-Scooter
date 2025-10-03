# Grand Theft Scooter 🛵
### A sweet old grandma has had enough of slow sidewalks and nosy neighbors. She takes her mobility scooter on a joyride through town, leaving destruction in her wake.

## Play Locally
```sh
npm ci
npm run dev
```
These two commands install dependencies and launch the Vite dev server at `http://localhost:5173` so you can start the game in your browser.

## Make Shortcuts
```sh
make setup
make dev
```
Use these if you prefer Make targets; they wrap the same install and dev-server workflow.

## Docker Development Stack
```sh
docker compose -f docker-compose.dev.yml up
# ...hit Ctrl+C when you are done playing
docker compose -f docker-compose.dev.yml down
```
This spins the project up inside containers and tears it down when finished.

## Additional Commands
```sh
# Build artifacts
make build
npm run build

# Preview production build
make preview
npm run preview -- --host 0.0.0.0 --port 8080

# Clean workspace
make clean
rm -rf node_modules dist

# Docker images
make docker-build
docker build -t Grand-Theft-Scooter.
make docker-run
docker run --rm -p 8080:80 Grand-Theft-Scooter
make docker-dev
docker compose -f docker-compose.dev.yml up --build

# Testing & linting (currently stubbed)
make lint
npm run lint
make typecheck
npm run typecheck
make test
npm test
```
