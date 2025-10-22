**CSCI-310 Development Notebook**

---

**Guideline:**

- Please document all your development activities, whether you use any AI coding tool or not. You
  might mix your manual coding or AI tool usage. Just document the entire process.
  - If this is a team project or assignment, list all team members’ names in the “Name” field. For
    each iteration, record the name of the person who contributed any part of the work in the “What
    do you do?” field.
- Any interactions with AI coding tools such as ChatGPT, Gemini, Copilot, and others must capture
  the full conversation history.
- Use the format below to record your development activities in a clear and consistent manner.
  - Adding more iteration sections if needed.

---

#### **Name: Harrison Sternberg, Cole Snipes**

#### **Project/Assignment: Grand Theft Scooter**

##### **Problem/Task: Develop a game using threejs in a 3D environment.**

##### **Development Log**

- **Iteration 1:** Story
  - **Goal/Task/Rationale:** Create a story for the game
  - **What do you do?**  
    {If you ask AI, provide your prompt and link. If you fix it yourself, describe how you do it.}  
     Grandma Joanne has just learned that the government cut off her socail security benefits and can
    no longer afford rent and groceries. Grandma Joanne is now very pissed and has decided to get revenge
    by creating damages to the city. She uses her scooter to run down anyone who tries to stop her. -Harrison
    S.
- **Response/Result:**

- **Your Evaluation:** {Issues/errors/your decision:done/discard/revise prompt}

- **Iteration 2:Set Up and Assets**
  - **Goal/Task/Rationale:Base Build of Game**
  - **What do you do?**  
    {If you ask AI, provide your prompt and link. If you fix it yourself, describe how you do it.}  
     Added assets from Poly.Pizza and Sketchfab as base models. Created environment. -Cole S.
- **Response/Result:**

- **Your Evaluation:** {Issues/errors/your decision:done/discard/revise prompt}

  **Iteration 3:Physics**

  - **Goal/Task/Rationale:Design phsyics model**
  - **What do you do?**  
    {If you ask AI, provide your prompt and link. If you fix it yourself, describe how you do it.}  
     Added physics files and ran three.js physics engine to compile and run gmae interactions. -Cole
    S.

- **Response/Result:**

- **Your Evaluation:** {Issues/errors/your decision:done/discard/revise prompt}

  **Iteration 4:Making it run on Windows**

  - **Goal/Task/Rationale:Built on Mac**
  - **What do you do?**  
    {If you ask AI, provide your prompt and link. If you fix it yourself, describe how you do it.}  
     Created extensions and securities to make the game run on Windows since the base was built on a
    Mac system. -Cole S.

- **Response/Result:**

- **Your Evaluation:** {Issues/errors/your decision:done/discard/revise prompt}

### Iteration 5: Asset Validation (Models Only)

- **Goal/Task/Rationale:** Ensure each asset pack includes at least one 3D model file for runtime
  loading.

- **What do you do?**  
  Wrote a Python script `scripts/check_assets.py` that recursively scans each folder under
  `public/assets` and verifies there is at least one `.glb` or `.gltf` per pack. Non-model files are
  ignored in the pass/fail decision.
  - Command: `python3 scripts/check_assets.py`
  - Noted that `public/assets/evil_old_lady/` currently contains no model files and will fail the
    check until a `.glb` or `.gltf` is added.
- **Response/Result:**  
  The checker reports a concise summary with a non-zero exit code when any pack lacks models. Most
  folders passed; one folder requires a model file to be added.

- **Your Evaluation:**  
  Useful guardrail prior to builds and Docker runs. Next step: add missing model(s) or configure an
  allowlist if a pack is intentionally model-less.

### Iteration 6: Local Dev and Build Flow

Goal: confirm local dev and production build steps.

What was done: `npm run dev` serves at `http://localhost:5173/`; `npm run build` creates production
output; `npm run preview` serves the build.

Result: dev server and preview work.

Evaluation: keep `public/assets` lean and validated.

### Iteration 7: Docker Compose Notes

Goal: bring up local containers with Compose.

What was done: the dev Compose file is `docker/docker-compose.dev.yml`.

- Start: `docker compose -f docker/docker-compose.dev.yml up -d`
- Validate: `docker compose -f docker/docker-compose.dev.yml config`
- Check: `docker ps -a --filter "name=grand-theft-scooter-web-1"`

Result: works with the correct `-f` path; `web` maps port 5173.

Evaluation: document the `-f docker/docker-compose.dev.yml` flag.

### Iteration 8: Formatting and Housekeeping

Goal: keep code style consistent across JS, CSS, HTML, and docs.

What was done: updated Prettier config/ignore and ran `npx prettier --write .` (assets and build
artifacts excluded).

Result: unified style across the repo.

Evaluation: improves readability and diffs.

### Iteration 9: Next Steps

- Add a model file to `public/assets/evil_old_lady/`
- Add the asset check to the dev workflow (Makefile/CI).
- Confirm Docker image build end-to-end and update README with the exact Compose command.
- Continue refining scene performance and loading order.
