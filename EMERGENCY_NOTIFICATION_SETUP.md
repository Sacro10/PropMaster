Emergency Notification Provider Setup
=====================================

Use this guide to collect provider credentials and set the required environment variables.

Provider Credentials
--------------------

PagerDuty
- Create an "Events API v2" integration on your PagerDuty service.
- Use the Integration Key as `PAGERDUTY_INTEGRATION_KEY`.

Opsgenie
- Create an API key in Opsgenie: Settings → Integration → API Keys.
- Use it as `OPSGENIE_API_KEY`.
- Optional: `OPSGENIE_API_URL` (set if you use Opsgenie EU).

Twilio (SMS)
- Twilio Console → Account SID and Auth Token.
- Buy or verify a sender number for `TWILIO_FROM_NUMBER`.

Slack
- Create an Incoming Webhook for the emergency channel.
- Use the webhook URL as `SLACK_EMERGENCY_WEBHOOK_URL`.

Email (Resend)
- Resend dashboard → API Keys.
- Use `RESEND_API_KEY`.
- Use a verified sender as `RESEND_FROM_EMAIL`.

Custom Webhook
- Use your endpoint as `EMERGENCY_WEBHOOK_URL`.
- Optional: `EMERGENCY_WEBHOOK_TOKEN` if you want a bearer token.

Environment Variables (Server)
-------------------------------

Only set the providers you want to use.

PagerDuty
- `PAGERDUTY_INTEGRATION_KEY`
- Optional: `PAGERDUTY_SOURCE`

Opsgenie
- `OPSGENIE_API_KEY`
- Optional: `OPSGENIE_API_URL`

Twilio
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

Slack
- `SLACK_EMERGENCY_WEBHOOK_URL`

Email (Resend)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Custom Webhook
- `EMERGENCY_WEBHOOK_URL`
- Optional: `EMERGENCY_WEBHOOK_TOKEN`

App Settings (UI)
-----------------

In the app, go to `/app/settings`:
- Set Emergency phone (required for Twilio).
- Set Emergency email (required for Resend).
- Choose default notification channels.
- Use "Send Test" to verify each provider.
