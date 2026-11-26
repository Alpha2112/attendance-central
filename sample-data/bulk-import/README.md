# Bulk Employee-Mapping Import — Sample CSVs

Test files for the **Mappings → Bulk Import** wizard (`/mappings/import`).
Values reference real orgs (`ORG-TECHIVE`, `dev`, `ts`, `try`) and terminals
(`DEV-HQ-HIK01`, `DEV-HQ-ZK01`, `sup-gsdk-01`) in this environment.

| File | Purpose |
|------|---------|
| `1-valid-employees.csv` | 10 valid rows across orgs/terminals. Includes a quoted comma in a name, an empty card, and an INACTIVE row. Upload it twice to see idempotent **Update** warnings (no duplicates). |
| `2-validation-showcase.csv` | Triggers every validation error: duplicate vendor id, duplicate employee on a terminal, unknown org, missing employee id, missing vendor id, invalid status, unknown terminal. Only `EMP-3001` imports. |
| `3-minimal-global-assignment.csv` | No org/terminal columns — use the **Configure Assignments** step to set a Default Organization + global Target Terminals, then *Apply to all*. |
| `4-multi-terminal.csv` | One employee → **multiple terminals** via a `;`-separated terminal cell. Row 1 and 2 each expand to **2 mappings** (same vendor id on 2 terminals); row 3 is a single terminal. 5 mappings from 3 rows. |

## Multiple terminals per employee
The terminal column may list several codes separated by `;` (e.g.
`DEV-HQ-HIK01;DEV-HQ-ZK01`) — the same vendor id is mapped to each, one mapping
per terminal. You can also set terminals in the **Configure Assignments** step:
pick terminals globally and *Apply to all / selected*, or click an employee's
terminal cell to choose per-employee. The preview summary counts **mappings**
(terminals), not just employees.

## Cleanup after testing
Files 1 and 3 create real mappings. Remove the `EMP-2xxx` / `EMP-4xxx` rows from
the Mappings table afterward (or set them INACTIVE). File 2 only writes `EMP-3001`.
