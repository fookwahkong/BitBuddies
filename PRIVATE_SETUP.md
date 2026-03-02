# Private Setup Note

This project expects two local secret files in the project root:

- `.env`
- `serviceAccountKey.json`

These files are not committed to the public repo.


## For Hackathon Demo

The preferred setup is to run the project on the team demo machine, where:

- `.env` is already configured
- `serviceAccountKey.json` is already present
- the app has already been tested end to end

```bash
npm install
node server.js
npm run dev
```