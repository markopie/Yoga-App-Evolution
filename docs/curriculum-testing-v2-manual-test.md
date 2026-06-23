# Full Curriculum Manual Test

Active slug:

`iyengar_integrated_master_path_testing_v2`

Public name:

`Integrated Iyengar Practice Path`

## Seed And Validate

Run from the repo root:

```bash
npm run seed:curriculum-testing-v2
npm run validate:curriculum-testing-v2
npm run verify:completion-metadata
```

Expected baseline:

- 368 total courses.
- 368 playable courses.
- 0 excluded courses.
- 368 scheduled unique courses.
- 430 active visible curriculum nodes.
- 62 weeks.
- 6 practice days per complete week.
- 1 recovery day per week.
- 0 invalid course references.
- 0 unresolved composition references.

## Start The App

```bash
npm run dev
```

Open the Vite URL, usually `http://localhost:5173/`.

## Reset Progress

1. Sign in or continue as a known local test user.
2. Click `Start Today's Practice`.
3. On localhost, use `Reset Curriculum Test Progress`.
4. Confirm the reset. It deletes completion rows for this active curriculum and current user only.

## Start Today's Practice

1. Click `Start Today's Practice`.
2. Confirm the panel shows the next incomplete active visible node.
3. Confirm sequence nodes load a playable course.
4. Confirm recovery nodes can be acknowledged locally.
5. Confirm the final week can be partial while earlier weeks show six practice days.

## Complete And Rate

1. Complete a playable practice or use `Mark Node Complete` locally.
2. Choose a rating.
3. Ratings `1` or `2` should repeat the same curriculum node.
4. Ratings `3`, `4`, or `5` should advance to the next incomplete node.

## Inspect The Roadmap

1. Click `Curriculum Map` locally or as admin.
2. Confirm the public name is `Integrated Iyengar Practice Path`.
3. Confirm no `DEV` or `Testing v2` label is user-facing.
4. Confirm the roadmap shows all 430 active visible nodes.
5. Confirm roadmap sections follow source/course families rather than artificial Foundation/Development labels.
6. Confirm station taps are forgiving: click or tap near a station, not only directly on the visible dot.
7. Confirm keyboard focus and Enter/Space activation still select stations.

## Known Limitations

- This first full-program pass schedules every playable course exactly once and does not compose Light on Pranayama into shorter asana days.
- Recovery days are acknowledgement nodes.
- Validation verifies database coverage; it does not replace a browser walkthrough.
