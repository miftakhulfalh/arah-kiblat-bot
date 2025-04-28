require('dotenv').config();
const axios = require('axios');

// Mengambil token bot dari variabel lingkungan
const botToken = process.env.BOT_TOKEN;
const telegramApiUrl = `https://api.telegram.org/bot${botToken}`;

// Ganti ini dengan URL deployment Vercel Anda
const webhookUrl = process.argv[2] || 'https://arah-kiblat-bot.vercel.app/api/webhook';

async function setWebhook() {
  const url = `${telegramApiUrl}/setWebhook?url=${webhookUrl}`;
  try {
    const response = await axios.get(url);
    console.log('Respons setup webhook:', response.data);
    
    if (response.data.ok) {
      console.log('Webhook berhasil diatur ke:', webhookUrl);
    } else {
      console.log('Gagal mengatur webhook:', response.data.description);
    }
  } catch (error) {
    console.error('Error saat setup webhook:', error.message);
  }
}

// Jalankan fungsi
setWebhook();
