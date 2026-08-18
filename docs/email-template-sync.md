# Supabase Email Template Sync

## Background

The branded HTML templates live in `supabase/templates/` and `supabase/config.toml` maps them to each auth flow. Supabase's hosted project **does not read `config.toml` at runtime** -- it only respects changes pushed via the Supabase CLI or applied through the Dashboard. Until the push is done, production sends Supabase's default plain-text templates.

---

## Option A -- CLI push (preferred)

Run from the project root (requires the Supabase CLI and a project-scoped access token):

```bash
# 1. Authenticate (skip if already logged in)
supabase login

# 2. Link to the production project
supabase link --project-ref yeklvhpuimgjbrsfcqmq

# 3. Push templates only (does NOT touch DB or migrations)
supabase email template set confirmation   --html  supabase/templates/confirmation.html  --subject "Confirm your Feastpot account"
supabase email template set recovery       --html  supabase/templates/recovery.html       --subject "Reset your Feastpot password"
supabase email template set magic_link     --html  supabase/templates/magic_link.html     --subject "Your Feastpot sign-in link"
supabase email template set email_change   --html  supabase/templates/email_change.html   --subject "Confirm your new Feastpot email"
supabase email template set invite         --html  supabase/templates/invite.html         --subject "You have been invited to Feastpot"
```

**Must run this every time** a template file changes.

---

## Option B -- Dashboard (FOUNDER ACTION if CLI push not available)

Paste the contents of each file into **Authentication → Email Templates** in the Supabase Dashboard at https://supabase.com/dashboard/project/yeklvhpuimgjbrsfcqmq/auth/templates.

| Template name  | File                                   | Subject                           |
| -------------- | -------------------------------------- | --------------------------------- |
| Confirm signup | `supabase/templates/confirmation.html` | Confirm your Feastpot account     |
| Reset password | `supabase/templates/recovery.html`     | Reset your Feastpot password      |
| Magic link     | `supabase/templates/magic_link.html`   | Your Feastpot sign-in link        |
| Change email   | `supabase/templates/email_change.html` | Confirm your new Feastpot email   |
| Invite user    | `supabase/templates/invite.html`       | You have been invited to Feastpot |

Copy the full HTML of each file into the template editor, update the **Subject** field, and click **Save**.

---

## Verification

After pushing (either Option A or B), send a **test email** from Authentication → Email Templates → "Send test email" (or trigger a real sign-up flow to a Gmail address you control):

1. **Branded template arrives** -- Feastpot logo, brand green `#00843D`, styled button.
2. **Button link goes to `/auth/confirm`** (the interstitial page) -- NOT directly to the raw `ConfirmationURL`. Check the URL in the email source or hover the button.
3. Repeat for the password-reset flow (recovery template / `/auth/reset/start`).

---

## Scope note

These templates cover Supabase Auth emails only (confirmation, magic link, password reset, email change, invite). **Transactional emails** (order confirmations, payout statements, etc.) are sent via Resend through the NestJS notification processor and are NOT affected by this template sync. The suppression check added in Prompt 57 protects that Resend sending path.
