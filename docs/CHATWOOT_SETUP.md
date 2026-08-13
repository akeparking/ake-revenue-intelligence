# Chatwoot channel setup

## Website widget

1. Create a Website inbox in Chatwoot and copy its website token.
2. Add the generated Chatwoot SDK snippet to the independent site.
3. Before opening chat, copy landing-page attribution into Chatwoot contact or conversation custom attributes: `gclid`, `gbraid`, `wbraid`, `fbc`, `fbp`, `campaign_id`, `landing_url`, and consent status.
4. Configure an account webhook pointing to `https://<API_DOMAIN>/webhooks/chatwoot` for `conversation_created` and `message_created`.

The Revenue Core consumes only Chatwoot API/Webhooks. It never reads or writes the Chatwoot database.

## WhatsApp Cloud API

Use Chatwoot's official WhatsApp channel and a Meta test number for the pilot. The production path must not use WPPConnect or Baileys. Preserve the WhatsApp `wa_id` in a custom attribute named `wa_id`; CTWA traffic should also preserve `ctwa_clid`, `fbc`, `fbp`, `campaign_id`, and `ad_id` when available.

## CRM panel

Set `NEXT_PUBLIC_CHATWOOT_APP_URL` to the Chatwoot base URL. The context rail opens the matching Chatwoot workspace; a later hardening step can register the CRM route as a Chatwoot Dashboard App and pass signed contact/conversation context.

Never expose the internal Revenue API key inside the browser widget. Browser-to-core actions are proxied server-side by `workspace-web`.
