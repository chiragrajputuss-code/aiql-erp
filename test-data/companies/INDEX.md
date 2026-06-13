# AIQL Test Data — 10 Indian SME Companies

Synthetic GL data covering 10 different industries, 3 quarters across FY24-25 to FY26-27,
mixed regular GST + composition scheme, with deliberately seeded data quality issues.

| # | Company | Industry | GST | Period | Rows | Convention |
|---|---------|----------|-----|--------|------|------------|
| 1 | SteelCo Industries | Manufacturing | Regular | Q1 FY25-26 | 3,380 | tally_classic |
| 2 | Sharma Electronics | Wholesale | Regular | Q2 FY25-26 | 2,912 | verbose |
| 3 | TechVista Solutions | IT Services | Regular | Q3 FY25-26 | 1,358 | hindi_mixed |
| 4 | Patel Distributors | FMCG Distribution | Regular | Q4 FY25-26 (year-end) | 4,192 | tally_with_party |
| 5 | BuildPro Infrastructure | Construction | Regular | Q1 FY24-25 | 2,538 | sap_style |
| 6 | Apollo Diagnostics | Healthcare | Regular | Q3 FY24-25 | 2,542 | canonical |
| 7 | Kumar Textile Mills | Textiles | Regular | Q4 FY24-25 (year-end) | 3,586 | shortened |
| 8 | Spice Garden Restaurants | F&B | Composition (5%) | Q2 FY24-25 | 2,250 | tally_classic |
| 9 | Speedy Cargo Logistics | Freight | Composition (6%) | Q1 FY26-27 | 2,650 | verbose |
| 10 | LearnRight Coaching | Education | Composition (1%) | Q2 FY26-27 | 2,082 | hindi_mixed |

**Total: 27,490 rows · 370 seeded issues**

## Regenerate

```bash
pnpm gen:test-data                    # default seed=42, ./test-data/companies/
pnpm gen:test-data -- --random        # different output every run
pnpm gen:test-data -- --only steelco  # one company only
pnpm gen:test-data -- --out /tmp/x    # custom directory
```

Each `<company>.README.md` documents the deliberately seeded issues for that company.

## Recommended demo flow

1. Pick a company (start with `steelco` — typical Indian SME manufacturer)
2. Upload `steelco.csv` via `/connections/new` → file upload
3. The column mapper should auto-detect ~95% of columns (`Date`, `Particulars`, etc.)
4. Visit `/connections/<id>/account-mapping` → confirm classifications
5. Visit `/connections/<id>/scan` → run scan → verify it finds the issues listed in `steelco.README.md`
6. Create a close period in `/close` (Adaptive mode) → the engine generates tasks specific to the issues found
7. Verify Close Readiness Score correctly shows BLOCKED until issues are addressed

