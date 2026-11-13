# Eval results

Sessions: inventory. Agent: fake-noop. Runs: plain 2, symcc 2.

**Dry run with a fake agent: no model was called. These numbers only show the pipeline works.**

Each cell is mean / median (min-max) over runs. Billed-equivalent = input x1 + cache write x1.25 + cache read x0.1 + output x5, in input-token units: an estimate, not a bill.

| metric | plain | symcc |
|---|---|---|
| input tokens | 223 / 223 (198-248) | 592 / 592 (557-628) |
| output tokens | 3,415 / 3,415 (3,324-3,506) | 7,535 / 7,535 (6,978-8,092) |
| cache write tokens | 17,226 / 17,226 (16,294-18,157) | 40,118 / 40,118 (39,578-40,659) |
| cache read tokens | 158,295 / 158,295 (155,181-161,409) | 398,384 / 398,384 (381,819-414,949) |
| billed-equivalent tokens (estimate) | 54,660 / 54,660 (52,704-56,615) | 128,254 / 128,254 (126,414-130,094) |
| billed-equivalent per passed request (estimate) | - | - |
| wall-clock minutes | 0.06 / 0.06 (0.06-0.06) | 0.06 / 0.06 (0.06-0.06) |
| owner interventions | 0 / 0 (0-0) | 0 / 0 (0-0) |
| hidden test pass rate | 0 / 0 (0-0) | 0 / 0 (0-0) |
| regressions | 0 / 0 (0-0) | 0 / 0 (0-0) |
| forgotten requests | 10 / 10 (10-10) | 10 / 10 (10-10) |
| lint errors | 0 / 0 (0-0) | 0 / 0 (0-0) |
| type errors | 0 / 0 (0-0) | 0 / 0 (0-0) |

## Hidden tests passed per request (runs passing / runs)

| request | plain | symcc |
|---|---|---|
| R01 | 0/2 | 0/2 |
| R02 | 0/2 | 0/2 |
| R03 | 0/2 | 0/2 |
| R04 | 0/2 | 0/2 |
| R05 | 0/2 | 0/2 |
| R06 | 0/2 | 0/2 |
| R07 | 0/2 | 0/2 |
| R08 | 0/2 | 0/2 |
| R09 | 0/2 | 0/2 |
| R10 | 0/2 | 0/2 |

Requests in one run are linked, so compare runs, not requests. With few runs the ranges matter more than the means.
