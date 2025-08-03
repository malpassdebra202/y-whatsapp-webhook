const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'wa_secret_123';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8330614857:AAFTdO4gueQlSM0zsuQApE_N7KxW1rhrP0w';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-4617632325';

app.use(bodyParser.json());

// Webhook verification (GET)
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

// Handle WhatsApp messages (POST)
app.post('/webhook', async (req, res) => {
  const data = req.body;

  try {
    const message = data.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const phone = message?.from;
    const text = message?.text?.body;

    if (phone && text) {
      const formattedMessage = `From +${phone}:\n${text}`;

      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: formattedMessage
      });

      console.log('✅ Message sent to Telegram:\n', formattedMessage);
    }
  } catch (error) {
    console.error('❌ Error processing message:', error);
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Webhook listening on port ${PORT}`));
