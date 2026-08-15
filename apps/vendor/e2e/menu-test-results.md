# Menu Screen - Automated Usability Test Results

Fill this table after running `npm run test:e2e --workspace=@feastpot/vendor`.
Copy elapsed times and click counts from the console output lines printed at the end of each passing test.

---

## Results table

| Task | Criterion                         | Target     | Actual | Extra clicks vs target | Pass / Fail |
| ---- | --------------------------------- | ---------- | ------ | ---------------------- | ----------- |
| T1   | Elapsed time                      | < 90 s     |        | -                      |             |
| T1   | Page navigations                  | 0          |        | -                      |             |
| T2   | Elapsed time                      | < 45 s     |        | -                      |             |
| T2   | Page navigations                  | 0          |        | -                      |             |
| T3   | Click count                       | exactly 1  |        |                        |             |
| T3   | Panel opened                      | no         |        | -                      |             |
| T3   | Page navigations                  | 0          |        | -                      |             |
| T4   | Elapsed time                      | < 20 s     |        | -                      |             |
| T4   | Page navigations                  | 0          |        | -                      |             |
| T5   | Order persists after reload       | yes        |        | -                      |             |
| T5   | Navigations during drag phase     | 0          |        | -                      |             |
| T6   | Save blocked without allergens    | yes        |        | -                      |             |
| T6   | Allergen section in viewport      | yes        |        | -                      |             |
| T6   | Error explanation visible         | yes        |        | -                      |             |
| T6   | Page navigations                  | 0          |        | -                      |             |
| T7   | allergensFreeFrom stored as true  | yes        |        | -                      |             |
| T7   | allergens stored as []            | yes        |        | -                      |             |
| T7   | Dish appears as Live              | yes        |        | -                      |             |
| T7   | Page navigations                  | 0          |        | -                      |             |
| T8   | Name preserved after photo staged | yes        |        | -                      |             |
| T8   | Page navigations                  | 0          |        | -                      |             |
| T9   | Grid render time                  | < 2 000 ms |        | -                      |             |
| T9   | Search filters correctly          | yes        |        | -                      |             |
| T9   | Page navigations                  | 0          |        | -                      |             |
| T10  | No element overlap                | yes        |        | -                      |             |
| T10  | Nav item height single-line       | <= 40 px   |        | -                      |             |

---

## Efficiency failures

List every point where a test needed more clicks than the target, or where elapsed
time exceeded the ceiling. A task that eventually completed but breached a target
is a **fail** - do not mark it passed on the basis of eventual completion.

| Task | Target | Actual | What caused the extra interaction |
| ---- | ------ | ------ | --------------------------------- |
|      |        |        |                                   |

---

## Notes on test run

**Date:**  
**Playwright version:**  
**Browser:**  
**Base URL:**  
**Test vendor account:**

---

## Acceptance statement

All T1-T8 tests passing with ZERO page navigations is the primary acceptance
criterion for the single-screen rebuild. A single unexpected navigation in any
of those eight tasks is a blocking failure, not a warning.

T3 passing at exactly one click is the acceptance criterion for the quick
sold-out toggle. If it takes two or more clicks, the DishCard action bar
design must be revised before release.
