# Account Contract

`account-session.schema.json` defines the public desktop contract consumed by
Kition. The private account and billing service owns authentication, plan
entitlements, the credit ledger, and hosted-model routing.

All account timestamps use Unix milliseconds encoded as JSON integers. The
desktop contract does not accept formatted timestamp strings.

The desktop client may persist the complete session in secure storage, but it
must never display access tokens, refresh tokens, token prefixes, or internal
session identifiers. Customer-facing account surfaces consume only identity,
plan, subscription, credit, and action URL fields.

All action URLs are optional. The client validates their protocol before
opening them and uses public Kition fallbacks where the product already has a
documented destination.

## Referral summary

`referral-summary.schema.json` defines the on-demand response from
`GET /api/v1/desktop/portal/referral`. The response contains the server-issued
invite code and HTTPS invite URL, the fixed 10,000-credit reward per invite,
referral and rewarded-referral counts, rewarded credits, and invite limit and
remaining values. The client displays the returned invite URL without deriving
or reconstructing it. The invite URL must not contain embedded username or
password credentials.

All count, amount, and limit fields are finite non-negative safe integers. A
rewarded-referral count cannot exceed the referral count. A positive invite
limit is finite and the remaining count cannot exceed it; a zero limit is the
unlimited sentinel and requires a zero remaining value. The referral summary is
fetched after authentication and is not part of the persisted account session.

## Hosted authorization page

The desktop client starts the existing portal connection flow and opens the
returned `authorize_url` in the system browser. All credential entry belongs
to that hosted HTTPS page; the desktop client must never render, receive,
persist, or log an account password.

The hosted authorization page should present sign-in methods in this order:

1. GitHub as a primary sign-in option.
2. Google as a primary sign-in option.
3. Existing account and administrator-issued password as a lower-emphasis,
   infrequently used fallback.

The password fallback authenticates existing accounts only. Passwords are
provisioned or rotated by administrators in the private account service. The
hosted page must not expose registration, account creation, password creation,
or self-service password reset. On success, it completes the existing desktop
connection session; the desktop continues polling the connect-result endpoint
and stores only the returned account session.
