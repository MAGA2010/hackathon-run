# idea-clarify — worked examples

## Example 1: empty repo + vague brief

User says: "We want to use AI to help students study better."

After the 4 questions:

| #   | Answer                                                               |
| --- | -------------------------------------------------------------------- |
| 1   | High-schoolers preparing for AP exams; one-shot study sessions       |
| 2   | At the demo, a student types a chapter and the tool gives flashcards |
| 3   | A web app that turns pasted text into 5 flashcards in <3 seconds     |
| 4   | The flashcard generation step (we cannot fake this)                  |

demo_goal: "Type a chapter, get 5 flashcards in 3 seconds."
mvp_axis: "input text -> flashcard list"

## Example 2: contradiction

User says (Q1): "we want a teacher dashboard"
User says (Q3): "no login; one-shot study session"

Skill surfaces the contradiction and refuses to write the brief
until resolved. After the user picks "no login; student types email
to get a per-student history", the skill proceeds.
