const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'wa_secret_123';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8330614857:AAFTdO4gueQlSM0zsuQApE_N7KxW1rhrP0w';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4617632325';
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || 'YOUR_WHATSAPP_ACCESS_TOKEN';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || '656578180881838';

app.use(bodyParser.json());

// ✅ WhatsApp Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Handle incoming WhatsApp replies → forward to Telegram
app.post('/webhook', async (req, res) => {
  const data = req.body;

  try {
    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const phone = message?.from;
    const text = message?.text?.body;

    if (phone && text) {
      const formattedMessage = `From +${phone}:\n${text}`;

      console.log('Sending to Telegram:', formattedMessage);

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: formattedMessage
      });
    } else {
      console.log('No valid message to forward.');
    }
  } catch (err) {
    console.error('❌ Error sending to Telegram:', err?.response?.data || err.message || err);
  }

  res.sendStatus(200);
});

// ✅ Telegram → Send WhatsApp message via /sendwa command
// ✅ Telegram → Send WhatsApp message via /sendwa command
app.post(`/telegram/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  const body = req.body;
  const messageText = body?.message?.text;
  const chatId = body?.message?.chat?.id;

  if (!messageText?.startsWith('/sendwa')) return res.sendStatus(200);

  const parts = messageText.split(' ');
  const number = parts[1];
  const lang = parts[2]?.toLowerCase() || 'en';

  if (!number) {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "❗️ Usage: /sendwa +2126xxxxxx [lang]\nExample: /sendwa +212612345678 es"
    });
    return res.sendStatus(200);
  }

  // ✅ Language to template map
  const templateMap = {
    en: { name: 'hello', code: 'en' },
    es: { name: 'hola', code: 'es' },
    fr: { name: 'bonjour', code: 'fr' },
    de: { name: 'hallo', code: 'de' },
    pt: { name: 'ola', code: 'pt' }
  };

  const selected = templateMap[lang] || templateMap['en'];

  try {
    const waResp = await axios.post(`https://graph.facebook.com/v18.0/${WA_PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      to: number,
      type: "template",
      template: {
        name: selected.name,
        language: { code: selected.code }
      }
    }, {
      headers: {
        Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`✅ Sent template '${selected.name}' to ${number}`);

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `✅ Sent WhatsApp template *${selected.name}* (${selected.code}) to ${number}`,
      parse_mode: "Markdown"
    });
  } catch (err) {
    const errorMsg = err?.response?.data?.error?.message || err.message;
    console.error('❌ WhatsApp template send failed:', errorMsg);

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `❌ Failed to send WhatsApp message:\n${errorMsg}`
    });
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook listening on port ${PORT}`));
