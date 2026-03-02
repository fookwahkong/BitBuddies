# BitBuddies Testbench

This document is intended for graders to quickly set up, launch, and test the main BitBuddies features.

## Scope

This testbench covers:

- application launch
- onboarding and persona initialization
- DECODE (document checkpoint) flow
- PATH + GUIDE (ToDo + Study Buddy) flow

## Prerequisites

You will need:

- Node.js 20 or later
- `npm`
- the project root files `.env` and `serviceAccountKey.json`

Important:

- The project depends on the team-provided Firebase and OpenAI configuration.
- If these files are not present, please use the team demo machine or request the private setup bundle from the team.

## Launch Instructions

### 1. Install Dependencies

From the project root:

```bash
npm install
```

### 2. Start the Backend

In the project root:

```bash
node server.js
```

Expected result:

- backend starts on `http://localhost:3001`

### 3. Start the Frontend

In a second terminal:

```bash
npm run dev
```

Expected result:

- frontend starts locally, usually on `http://localhost:5173`

### 4. Open the Website

Open the frontend URL shown by Vite in your browser.

For full functionality, keep both frontend and backend running.

## Test Flow A: Onboarding and Persona Initialization

Purpose:

- verify that onboarding creates a student profile
- verify that the initial persona and radar baseline are generated

Steps:

1. Open the website.
2. Click `Start assessment`.
3. In the account step, enter:
   - a username
   - a valid email
   - a password
4. Continue to the persona quiz.
5. Answer all 10 questions.
6. Continue to the academic setup step.
7. Select:
   - an institution level
   - a course / track
   - at least one subject
8. Click `Create profile and open dashboard`.

Expected result:

- a new student profile is created
- the homepage loads
- a persona label is shown
- the initial radar is visible
- tracked subjects appear in the academic summary

What to verify:

- the same quiz pattern produces a consistent persona type
- the system does not allow progression with missing required inputs

## Test Flow B: DECODE (Document Checkpoint)

Purpose:

- verify that uploaded work is processed as a diagnostic checkpoint
- verify that a learning event is logged and analysis is generated

Steps:

1. From the homepage, open the document upload feature.
2. Upload a PDF or image file.
3. Wait for the detection step to complete.
4. Review the confirmation form.
5. Confirm or adjust:
   - subject
   - difficulty
   - detected topic
   - question type
   - result
   - time spent
   - attempt number
6. Click the submit button to log the checkpoint.

Expected result:

- the system accepts the upload
- subject / topic detection appears, or a manual fallback is available
- the attempt is logged
- subject mastery is updated internally
- a checkpoint analysis page opens after submission

What to verify:

- the uploaded file is converted into a structured checkpoint event
- the analysis page shows:
  - document signals
  - recommended next actions
  - persona-based advice
  - history-based recommendations

## Test Flow C: PATH + GUIDE (ToDo + Study Buddy)

Purpose:

- verify that the ToDo tree and Study Buddy work together
- verify that conversational suggestions can be approved and committed

Steps:

1. Open the ToDo page.
2. In the Study Buddy input, type a study-related prompt such as:

```text
I keep getting algebra questions wrong and I do not know what to revise first.
```

3. Wait for the Study Buddy to generate suggested study plans.
4. Select one of the suggested plans by:
   - clicking the recommendation, 
5. Confirm the selected recommendation by clicking `Add selected`
6. In the ToDo tree, select the new node.
7. Click `Commit this study plan`.
8. Send another study-related prompt to extend the path.

Expected result:

- the Study Buddy generates 1 to 3 study-plan proposals
- proposals are not added immediately; they require student confirmation
- after confirmation, the chosen plan appears as a new node in the ToDo tree
- after commit, the selected node becomes the current path anchor
- future suggestions extend from that committed node rather than restarting from the root

What to verify:

- persona and learner context influence the recommendation wording
- the tree remains interactive and updateable
- approved nodes can be turned into committed study actions

## Suggested Prompt Variations

You may also test with:

```text
I keep avoiding my weakest topic and I need a small step to start.
```

```text
I rush through questions and make careless mistakes.
```

```text
I study a lot but my scores are not improving.
```

Expected result:

- the Study Buddy should generate behavior-aware recommendations that reflect the student context

## Negative Test Checks

These are useful for confirming basic safeguards:

### Non-study prompt in Study Buddy

Try:

```text
hello
```

Expected result:

- the Study Buddy should not add a plan
- it should ask for a study-related prompt instead

### Missing required onboarding fields

Try submitting the onboarding flow with missing required fields.

Expected result:

- the system should block progression and show an error

### Upload without confirmation data

Try uploading a file but leave required checkpoint fields incomplete.

Expected result:

- the system should block submission until the required information is confirmed

## Notes for Graders

- This project relies on external services (Firebase and OpenAI), so internet access may be required.
- If credentials are not available locally, the preferred grading path is to use the team demo environment.
- The system is intentionally rule-based and explainable; the expected behavior is stable, interpretable adaptation rather than black-box inference.

## Quick Smoke Test

If time is limited, the fastest end-to-end validation path is:

1. Launch backend and frontend.
2. Create a student profile through onboarding.
3. Upload one document and log one checkpoint.
4. Open the ToDo page and submit one Study Buddy prompt.
5. Confirm one suggested node and commit it.

If all five steps work, the core BitBuddies flow is functioning.
