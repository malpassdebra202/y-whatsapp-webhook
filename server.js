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

// ✅ WhatsApp → Telegram forward
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

// ✅ Telegram → send WhatsApp TEXT message
app.post(`/telegram/${TELEGRAM_BOT_TOKEN}`, async (req, res) => {
  const body = req.body;
  const messageText = body?.message?.text;
  const chatId = body?.message?.chat?.id;

  if (!messageText) return res.sendStatus(200);

  // --- /sendwa → plain WhatsApp message
  if (messageText.startsWith('/sendwa')) {
    const parts = messageText.trim().split(/\s+/);
    const number = parts[1];
    const textMsg = parts.slice(2).join(' ');

    if (!number || !textMsg) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "❗️ Usage: /sendwa +2126xxxxxx Your message here"
      });
      return res.sendStatus(200);
    }

    try {
      const waResp = await axios.post(`https://graph.facebook.com/v18.0/${WA_PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: number,
        type: "text",
        text: { body: textMsg }
      }, {
        headers: {
          Authorization: `Bearer ${WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Sent WhatsApp text to ${number}`);
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Sent WhatsApp message to ${number}`
      });
    } catch (err) {
      const errorMsg = err?.response?.data?.error?.message || err.message;
      console.error('❌ WhatsApp text send failed:', errorMsg);

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Failed to send message:\n${errorMsg}`
      });
    }

    return res.sendStatus(200);
  }

  // --- /sendtemplate → template message
  if (messageText.startsWith('/sendtemplate')) {
    const parts = messageText.trim().split(/\s+/);
    const number = parts[1];
    const lang = (parts[2] || 'en').toLowerCase();

    if (!number || parts.length > 3) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: "❗️ Usage: /sendtemplate +2126xxxxxx [lang]\nExample: /sendtemplate +905xxx tr"
      });
      return res.sendStatus(200);
    }

    // 🧩 Template map
    const templateMap = {
  hello_en: { name: 'hello', code: 'en' },
  hello_fr: { name: 'bonjour', code: 'fr' },
  hello_it: { name: 'ciao', code: 'it' },
  hello_es: { name: 'hola', code: 'es' },
  hello_de: { name: 'hallo', code: 'de' },
  hello_pt: { name: 'ola', code: 'pt' },
  hello_tr: { name: 'merhaba', code: 'tr' },

  ready_en: { name: 'ready_en', code: 'en' },
  ready_fr: { name: 'ready_fr', code: 'fr' },
  ready_it: { name: 'ready_it', code: 'it' },
  ready_es: { name: 'ready_es', code: 'es' },
  ready_de: { name: 'ready_de', code: 'de' },
  ready_pt: { name: 'ready_pt', code: 'pt' },
  ready_tr: { name: 'ready_tr', code: 'tr' }
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

      console.log(`✅ Sent template '${selected.name}' (${selected.code}) to ${number}`);
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✅ Sent WhatsApp template *${selected.name}* (${selected.code}) to ${number}`,
        parse_mode: 'Markdown'
      });
    } catch (err) {
      const errorMsg = err?.response?.data?.error?.message || err.message;
      console.error('❌ Template send failed:', errorMsg);

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `❌ Failed to send WhatsApp template:\n${errorMsg}`
      });
    }

    return res.sendStatus(200);
  }

  // If command doesn't match
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text: "⚠️ Unknown command. Use /sendwa or /sendtemplate."
  });

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
