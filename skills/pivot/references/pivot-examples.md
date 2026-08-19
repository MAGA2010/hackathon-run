# pivot — worked examples

## Example 1: from notes app to flashcard generator

### Before

plan.json: 6 features, 4 KEEP (auth, notes CRUD, sync, search)
demo.json: 60s script about notes
review.json: 3.7 overall; judge feedback: "what problem does this solve?"

### After pivot

new_direction: "Type a chapter, get 5 flashcards in 3 seconds."

pivot-report.md:

| Feature       | Action                |
| ------------- | --------------------- |
| Auth          | preserve              |
| Notes CRUD    | cut (lost: auth work) |
| Sync          | cut (lost: 2h infra)  |
| Search        | cut                   |
| Flashcard gen | new (proposed)        |

Recommended next: `hackathon run scope-knife --demo-goal "Type a chapter, get 5 flashcards in 3 seconds."`

## Example 2: from chat to dashboard

(similar structure; auth preserved, chat rewritten to dashboard, storage preserved)
