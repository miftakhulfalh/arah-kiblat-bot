# Bot Arah Kiblat Telegram

Bot Telegram untuk menghitung arah kiblat berdasarkan lokasi atau koordinat pengguna. Bot ini didesain untuk di-deploy di Vercel.

## Fitur

- Menghitung arah kiblat berdasarkan lokasi pengguna saat ini
- Menghitung arah kiblat dari koordinat dalam format desimal
- Menghitung arah kiblat dari koordinat dalam format DMS (Derajat, Menit, Detik)
- Menampilkan informasi lokasi (kota, provinsi)
- Menyediakan arah kiblat dalam format relatif dan azimuth
- Menunjukkan penyimpangan dari arah mata angin utama

## Langkah-langkah Deployment

### Prasyarat

1. Node.js (v18 atau lebih baru)
2. Akun Vercel
3. Akun GitHub
4. Kredensial Google Service Account untuk akses Spreadsheet
5. Bot Telegram (dapatkan token dari BotFather)
6. API Key OpenCage untuk geocoding

### Langkah Setup

1. Clone repository ini
2. Install dependensi:
   ```
   npm install
   ```

3. Salin file `.env.example` menjadi `.env` dan isi dengan kredensial asli:
   ```bash
   cp .env.example .env
   ```
   
   Kemudian edit file `.env` dan isi nilai-nilai yang sesuai.

4. Setup Google Cloud:
   - Buat service account di Google Cloud Console
   - Berikan akses ke Google Sheets
   - Download file JSON key

5. Push ke GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/username/telegram-qibla-bot.git
   git push -u origin main
   ```

## Setup Deployment di Vercel

1. Masuk ke [Vercel](https://vercel.com)
2. Klik "Add New" kemudian "Project"
3. Import repository GitHub Anda
4. Di bagian "Environment Variables", tambahkan:
   - `BOT_TOKEN` (token bot Telegram)
   - `SPREADSHEET_ID` (ID spreadsheet Google)
   - `OPENCAGE_API_KEY` (API key OpenCage)
   - Tambahkan kredensial Google service account sebagai JSON string pada variabel `GOOGLE_CREDENTIALS`
5. Klik "Deploy"
6. Setelah deployment selesai, dapatkan URL deployment (misal `https://telegram-qibla-bot.vercel.app`)

## Mengatur Webhook Telegram

Setelah deployment, jalankan script setup webhook:

```bash
# Install dotenv jika belum
npm install dotenv --save-dev

# Jalankan script setup webhook dengan URL deployment
node setup-webhook.js https://telegram-qibla-bot.vercel.app/api/webhook
```

## Perintah Bot

- `/start` - Menampilkan pesan selamat datang dan instruksi
- `/about` - Menampilkan informasi tentang bot

## Metode Perhitungan

Bot ini menggunakan rumus berikut untuk menghitung arah kiblat:
```
cotan B = tan latitude Ka'bah × sin latitude tempat / sin C - sin latitude tempat / tan C
```
dimana C adalah selisih bujur antara lokasi dan Ka'bah.
