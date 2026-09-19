# Authentication Operations

**Status:** implemented boundary; provider deployment remains configuration-owned.

RITSEI uses the provider-neutral boundary in
[ADR-0058](../decisions/0058-define-provider-neutral-identity-and-authentication-boundary.md). The
API accepts either the explicitly selected transitional local profile or an OIDC/OAuth2
Authorization Code + PKCE profile. Provider claims never grant tenant membership or capabilities.

## Local bootstrap

Apply migrations, then run:

```sh
deno task auth:bootstrap
```

The command is trusted and idempotent by tenant slug. It creates the initial UserAccount, tenant,
active membership, bootstrap capabilities, organization, legal entity, branch, accounting
configuration, and warehouse. Optional `RITSEI_BOOTSTRAP_EXTERNAL_ISSUER` and
`RITSEI_BOOTSTRAP_EXTERNAL_SUBJECT` bind an OIDC subject to that UserAccount. A provider subject
cannot create ERP authority by itself.

Set `RITSEI_TRANSITIONAL_USER_ACCOUNT_EMAIL` (or the explicit account UUID) when using
`RITSEI_AUTH_PROFILE=transitional-local`. The profile must be selected explicitly; an unset profile
fails startup rather than enabling local login. Transitional authentication is for local/BFF
migration only.

## OIDC configuration

Set `RITSEI_AUTH_PROFILE=oidc` and configure:

- `RITSEI_OIDC_ISSUER_URL`;
- `RITSEI_OIDC_AUDIENCE`;
- `RITSEI_OIDC_CLIENT_ID`;
- authorization, token, and JWKS endpoints; and
- the browser redirect URI and scopes including `openid`.

The current adapter accepts JWT access tokens signed with RS256 and validates issuer, audience,
expiry, `nbf`, `iat`, signature, and the issuer+subject mapping. Opaque access tokens and other
algorithms are intentionally outside this adapter contract. Invalid assertions, provider
unavailability, disabled accounts, and ambiguous mappings fail closed.

## Browser flow

The SPA uses `/api/auth/config`, redirects through the configured provider with PKCE, exchanges the
callback code without storing credentials in `localStorage`, loads `/api/auth/session`, and lets the
user choose an accessible tenant. All business requests continue to send `x-tenant-id`; backend
authorization remains authoritative. Tenant switching re-reads the selected membership and direct
capabilities before remounting the tenant-scoped query runtime. A 401 clears in-memory credentials
and query caches before redirecting to `/login`.
