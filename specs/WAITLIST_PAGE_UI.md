# WAITLIST_PAGE_UI

Specification for WAITLIST_PAGE_UI.

## High-Level User POV

As a visitor landing on the Codeplane waitlist page, I want a polished, informative, and conversion-optimized sign-up experience that clearly communicates Codeplane's value proposition as a jj-native software forge, collects my email/GitHub handle, and gives me immediate feedback on my waitlist position so I feel confident I've joined the right product early.

## Acceptance Criteria

1. Waitlist page renders at /waitlist route with marketing layout (no auth-gated sidebar).
2. Hero section displays Codeplane tagline, subtitle emphasizing jj-native forge + agent-assisted development, and a primary CTA button.
3. Sign-up form collects email (required) and optional GitHub username, with client-side validation.
4. On successful submission, POST to /api/admin/waitlist endpoint; display success state with estimated queue position.
5. If user is already on the waitlist, display appropriate messaging (not a raw error).
6. Feature highlight section showcases at least 4 key capabilities: jj-native collaboration, workflow orchestration, workspaces, and agent sessions.
7. Page is fully responsive (mobile-first) with dark theme consistent with Codeplane design system.
8. Page loads without authentication; unauthenticated users can sign up.
9. Social proof or open-source callout section references Community Edition availability.
10. All interactive elements have keyboard navigation and aria labels for accessibility.

## Design

The waitlist page is a standalone marketing surface mounted at /waitlist in the SolidJS web app, using the marketing layout (no sidebar, no auth requirement). It consists of: (1) a full-viewport hero with headline, subheadline, and animated CTA; (2) a compact inline sign-up form with email + optional GitHub input, validation states, and loading/success/error feedback; (3) a features grid (2×2 on desktop, stacked on mobile) highlighting jj-native repos, workflows, workspaces, and agents with icons and short descriptions; (4) a footer section with links to docs, GitHub repo, and community. The page uses existing @codeplane/ui-core design tokens and components where available. The form submission hits the existing admin waitlist API endpoint. Client state is managed with SolidJS signals (no global store needed). The page is statically renderable and requires no server-side session.

## Permissions & Security

The waitlist page is publicly accessible — no authentication or authorization required to view or submit the form. The POST to /api/admin/waitlist may need to be evaluated for rate-limiting (already covered by server middleware rate limiter). Admin-side waitlist management (whitelist, approve, reject) remains behind admin auth as currently implemented. No new permission scopes are introduced.

## Telemetry & Product Analytics

Track the following client-side events: (1) waitlist_page_view — fired on page mount; (2) waitlist_form_start — fired on first interaction with the form; (3) waitlist_form_submit — fired on form submission with success/failure status; (4) waitlist_feature_click — fired if feature cards link to docs or deeper content. Server-side: the existing admin waitlist endpoint should log submission counts. No PII beyond email and optional GitHub username is collected. All telemetry respects any future consent/cookie-banner integration.

## Observability

Server-side: monitor POST /api/admin/waitlist for error rate, latency p50/p95/p99, and 429 rate-limit hits. Alert if error rate exceeds 5% over a 5-minute window or if p99 latency exceeds 2s. Client-side: track Core Web Vitals (LCP, CLS, INP) for the /waitlist route. Log client-side form validation errors and API call failures to the structured logging pipeline. Dashboard: add a waitlist submissions counter to the admin health view.

## Verification

1. Unit tests: SolidJS component tests for WaitlistForm — valid submission, validation errors, duplicate email handling, loading state.
2. Integration tests: API round-trip test — submit waitlist entry, verify 201 response, verify duplicate returns appropriate status.
3. E2E tests: Playwright test navigating to /waitlist, filling form, submitting, and asserting success state renders. Test responsive layout at mobile (375px) and desktop (1280px) viewports.
4. Accessibility: axe-core audit of /waitlist with zero critical/serious violations.
5. Visual regression: screenshot comparison for hero, form states (empty, filled, error, success), and feature grid.
6. Load test: verify rate limiter correctly throttles burst submissions (>10 requests/minute from same IP).
