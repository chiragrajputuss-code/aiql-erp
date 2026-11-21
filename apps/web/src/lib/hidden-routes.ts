// Screens from earlier product ideas, or unfinished ones. Hidden from customers:
// the code stays, but the URL sends a signed-in user to Practice. Enforced in
// middleware.ts. Their sidebar links were removed in components/app-shell.tsx. Delete a line to bring one back.
const HIDDEN_ROUTES: RegExp[] = [
  /^\/dashboard(\/|$)/,
  /^\/onboarding(\/|$)/,
  /^\/query(\/|$)/,
  /^\/history(\/|$)/,
  /^\/close(\/|$)/,
  /^\/knowledge(\/|$)/,
  /^\/usage(\/|$)/,
  /^\/api-keys(\/|$)/,
  /^\/settings\/(llm|api-keys)(\/|$)/,
  /^\/tokenisation(\/|$)/,
  /^\/llm-privacy-demo(\/|$)/,
  /^\/connections\/[^/]+\/(account-mapping|chat|doc-scan|flux|pulse|reconcile|scan|schema|vendor-compliance)(\/|$)/,
];

export function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ROUTES.some((re) => re.test(pathname));
}

