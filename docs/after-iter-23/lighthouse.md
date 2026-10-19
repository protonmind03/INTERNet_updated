## Lighthouse (mobile), 2026-10-19T21:06:49.879Z

Lighthouse 12.8.2, its mobile settings, 3 runs, the middle one kept per page. Full reports are in the lighthouse-reports artifact.

| Page | Performance | Accessibility | Best practices | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|---|
| Landing page | 100 | 100 | 100 | 100 | 0.9 s | 10 ms | 0 |
| Trainee door (sign-in) | 100 | 100 | 96 | 100 | 0.6 s | 60 ms | 0 |
| Student: Today | 97 | 100 | 96 | 100 | 2.1 s | 150 ms | 0.022 |
| Supervisor: Review | 98 | 100 | 96 | 100 | 2.1 s | 130 ms | 0 |
| Coordinator: Dashboard | 99 | 100 | 96 | 100 | 1.5 s | 110 ms | 0.011 |

- **Landing page** below 90: Max Potential First Input Delay; Minimize main-thread work; Serve static assets with an efficient cache policy; Defer offscreen images; Serve images in next-gen formats; Use efficient cache lifetimes; Render blocking requests
- **Trainee door (sign-in)** below 90: Browser errors were logged to the console; Serve static assets with an efficient cache policy; Serve images in next-gen formats; Use efficient cache lifetimes; Network dependency tree; Render blocking requests
- **Student: Today** below 90: Max Potential First Input Delay; Browser errors were logged to the console; Minimize main-thread work; Preconnect to required origins; Serve static assets with an efficient cache policy; Enable text compression; Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests
- **Supervisor: Review** below 90: Browser errors were logged to the console; Preconnect to required origins; Serve static assets with an efficient cache policy; Enable text compression; Use efficient cache lifetimes; Forced reflow; Network dependency tree; Render blocking requests
- **Coordinator: Dashboard** below 90: Browser errors were logged to the console; Preconnect to required origins; Serve static assets with an efficient cache policy; Enable text compression; Use efficient cache lifetimes; Network dependency tree; Render blocking requests
