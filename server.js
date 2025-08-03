const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'VERIFY_TOKEN';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'TELEGRAM_CHAT_ID';
const WA_ACCESS_TOKEN = process.env.WA_ACCESS_TOKEN || 'YOUR_WHATSAPP_ACCESS_TOKEN';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID || 'PHONE_NUMBER_ID';

app.use(bodyParser.json());

// ✅ Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ WhatsApp → Telegram
app.post('/webhook', async (req, res) => {
  const data = req.body;

  try {
    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const phone = message?.from;
    const text = message?.text?.body;

    if (phone && text) {
      const formattedMessage = `From +${phone}:\n${text}`;
      console.log('📩 Incoming from WhatsApp:', formattedMessage);

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: formattedMessage
      });
    }
  } catch (err) {
    console.error('❌ Telegram forward error:', err?.response?.data || err.message);
  }

  res.sendStatus(200);
});

// ✅ Telegram → /sendwa
app.post(`/telegram/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  const body = req.body;
  const messageText = body?.message?.text;
  const chatId = body?.message?.chat?.id;

  if (!messageText?.startsWith('/sendwa')) return res.sendStatus(200);

  const parts = messageText.trim().split(/\s+/);
  const number = parts[1];
  const lang = (parts[2] || 'en').toLowerCase();

  // ❌ Block if message has more than 3 parts (e.g. custom text)
  if (parts.length > 3) {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "⚠️ Usage: /sendwa +2126xxxxxx [lang]\nOnly language allowed — no custom text."
    });
    return res.sendStatus(200);
  }

  if (!number) {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: "❗️ Usage: /sendwa +2126xxxxxx [lang]\nExample: /sendwa +212612345678 fr"
    });
    return res.sendStatus(200);
  }

  // ✅ Template map
  const templateMap = {
    en: { name: 'hello', code: 'en' },
    es: { name: 'hola', code: 'es' },
    fr: { name: 'bonjour', code: 'fr' },
    de: { name: 'hallo', code: 'de' },
    pt: { name: 'ola', code: 'pt' },
    tr: { name: 'merhaba', code: 'tr' }
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

    console.log(`✅ Sent '${selected.name}' (${selected.code}) to ${number}`);

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `✅ Sent WhatsApp template *${selected.name}* (${selected.code}) to ${number}`,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    const errorMsg = err?.response?.data?.error?.message || err.message;
    console.error('❌ WhatsApp send failed:', errorMsg);

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `❌ Failed to send WhatsApp message:\n${errorMsg}`
    });
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
