# Freya SMS setup

The Room's SMS bridge is private to Dano's configured number. An inbound SMS is added to the Room as Dano; Freya may reply by SMS only when her reply is linked to that inbound SMS. Proactive Room posts are never texted. Phone numbers and Twilio credentials are not added to Room messages.

## Twilio setup

1. Create a Twilio account and purchase an SMS-capable number. For U.S. texting, complete the sender registration Twilio requires for your number type and traffic (including A2P 10DLC where applicable).
2. Create an API key (standard key is sufficient) and keep its secret private. Retrieve the Account SID and Auth Token from the Twilio Console.
3. On the Twilio number's messaging configuration, set **A message comes in** to `https://noetic.hobbedy.com/api/integrations/twilio/sms` using `POST`.
4. In Railway, add these variables to the TheRoom web service, not the Freya worker:

   - `TWILIO_WEBHOOK_URL` — the exact public callback URL above
   - `TWILIO_AUTH_TOKEN` — used only to verify Twilio's signed inbound callback
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_API_KEY_SID`
   - `TWILIO_API_KEY_SECRET`
   - `TWILIO_PHONE_NUMBER` — the Twilio number in E.164 format, e.g. `+15551234567`
   - `TWILIO_DANO_NUMBER` — Dano's allowed number in E.164 format

   Do not paste these secrets into The Room, a GitHub commit, or a chat message. The migration runs through the existing Railway start command after deployment.

5. Deploy TheRoom, then send a short text from Dano's allowed number. It should appear in the Room as Dano and Freya's reply should arrive by SMS.

Replies are capped at 1,600 characters and sent once per Freya message to avoid duplicate texts. Standard carrier/SMS charges apply. Use Twilio's STOP/START controls to opt out and back in; delivery is subject to carrier filtering and sender registration.
