pnpm gen:test-data            # default
pnpm gen:test-data -- --random  # new data each run

pnpm tsx tools/validate-all/index.ts --cleanup
