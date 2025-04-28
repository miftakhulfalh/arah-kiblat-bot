import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

export const config = {
  api: {
    bodyParser: false
  }
};

const botToken = process.env.BOT_TOKEN;
const telegramApiUrl = `https://api.telegram.org/bot${botToken}`;
const openCageApiKey = process.env.OPENCAGE_API_KEY;
const spreadsheetId = process.env.SPREADSHEET_ID;

const kaabahCoordinates = {
  lat: { d: 21, m: 25, s: 21.04 },
  lon: { d: 39, m: 49, s: 34.25 }
};

const latKabah = 21.422511;
const lonKabah = 39.826181;

async function getLocationName(lat, lon) {
  const url = `https://api.opencagedata.com/geocode/v1/json?key=${openCageApiKey}&q=${lat},${lon}&pretty=1&no_annotations=1`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    if (data.results && data.results.length > 0) {
      const components = data.results[0].components;
      const city = components.county || components.city || "Tidak Diketahui";
      const state = components.state || "Tidak Diketahui";
      return { city, state };
    }
    return { city: "Tidak Diketahui", state: "Tidak Diketahui" };
  } catch (error) {
    console.error("Error fetching location:", error);
    return { city: "Error", state: "Error" };
  }
}

async function sendTelegramMessage(chatId, messageId, textMessage) {
  const url = `${telegramApiUrl}/sendMessage`;
  const data = {
    chat_id: chatId,
    text: textMessage,
    reply_to_message_id: messageId,
    parse_mode: 'HTML'
  };

  try {
    const response = await axios.post(url, data);
    if (!response.data.ok) {
      console.error('Telegram API Error:', response.data);
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

function dmsToDecimal(degree, minute, second, direction) {
  let decimal = degree + minute / 60 + second / 3600;
  if (direction === 'S' || direction === 'W') decimal *= -1;
  return decimal;
}

function toDMS(decimal) {
  const absDecimal = Math.abs(decimal);
  const d = Math.floor(absDecimal);
  const m = Math.floor((absDecimal - d) * 60);
  const s = Math.round(((absDecimal - d) * 60 - m) * 60);
  return { d, m, s };
}

function arahKiblat(lat, lon) {
  const a = 90 - lat;
  const b = 90 - latKabah;
  const c = Math.abs(lon - lonKabah);

  const aRad = a * (Math.PI / 180);
  const bRad = b * (Math.PI / 180);
  const cRad = c * (Math.PI / 180);

  const cotanB = 1 / Math.tan(bRad);
  const sinA = Math.sin(aRad);
  const sinC = Math.sin(cRad);
  const cosA = Math.cos(aRad);
  const cotanC = 1 / Math.tan(cRad);

  const cotanBkiblat = ((cotanB * sinA) / sinC) - (cosA * cotanC);
  const BkiblatRad = Math.atan(1 / cotanBkiblat);
  const BkiblatDeg = BkiblatRad * (180 / Math.PI);

  return { dms: toDMS(Math.abs(BkiblatDeg)), decimal: BkiblatDeg };
}

function getQiblaBaseDirection(BkiblatDeg) {
  return BkiblatDeg >= 0 ? 'Utara' : 'Selatan';
}

function getQiblaDirection(lon) {
  return lon > lonKabah ? 'Barat' : 'Timur';
}

function calculateAzimuth(kiblatDecimal, baseDirection, qiblaDirection) {
  const absKiblat = Math.abs(kiblatDecimal);
  let azimuthDeg;

  if (baseDirection === 'Utara') {
    azimuthDeg = qiblaDirection === 'Timur' ? absKiblat : 360 - absKiblat;
  } else {
    azimuthDeg = qiblaDirection === 'Timur' ? 180 - absKiblat : 180 + absKiblat;
  }

  return toDMS(azimuthDeg);
}

function getQiblaDeviation(azimuthDeg) {
  while (azimuthDeg >= 360) azimuthDeg -= 360;
  while (azimuthDeg < 0) azimuthDeg += 360;

  let baseDirection = '';
  let deviation = 0;

  if (azimuthDeg > 315 || azimuthDeg <= 45) {
    baseDirection = 'Utara';
    deviation = azimuthDeg > 315 ? azimuthDeg - 360 : azimuthDeg;
  } else if (azimuthDeg > 45 && azimuthDeg <= 135) {
    baseDirection = 'Timur';
    deviation = azimuthDeg - 90;
  } else if (azimuthDeg > 135 && azimuthDeg <= 225) {
    baseDirection = 'Selatan';
    deviation = azimuthDeg - 180;
  } else {
    baseDirection = 'Barat';
    deviation = azimuthDeg - 270;
  }

  const absDeviation = Math.abs(deviation);
  const deviationDMS = toDMS(absDeviation);
  const direction = deviation >= 0 ? 'kanan' : 'kiri';

  return { baseDirection, deviationDMS, direction };
}

async function saveToSpreadsheet(data) {
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:N',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [data] }
    });
  } catch (error) {
    console.error('Error saving to spreadsheet:', error);
  }
}

async function handleKiblatCalculation(chatId, messageId, lat, lon, username, firstName, lastName) {
  try {
    const kiblatResult = arahKiblat(lat, lon);
    const { city, state } = await getLocationName(lat, lon);
    const latDMS = toDMS(Math.abs(lat));
    const lonDMS = toDMS(Math.abs(lon));

    const qiblaDirection = getQiblaDirection(lon);
    const baseDirection = getQiblaBaseDirection(kiblatResult.decimal);

    const azimuthResult = calculateAzimuth(kiblatResult.decimal, baseDirection, qiblaDirection);
    const azimuthDecimal = azimuthResult.d + (azimuthResult.m / 60) + (azimuthResult.s / 3600);
    const deviation = getQiblaDeviation(azimuthDecimal);

    const kiblatDMS = toDMS(Math.abs(kiblatResult.decimal));
    const latDirection = lat >= 0 ? "N" : "S";
    const lonDirection = lon >= 0 ? "E" : "W";

    await saveToSpreadsheet([
      chatId, username, firstName, lastName,
      lat, lon,
      `${latDMS.d}° ${latDMS.m}' ${latDMS.s}" ${latDirection}`,
      `${lonDMS.d}° ${lonDMS.m}' ${lonDMS.s}" ${lonDirection}`,
      city, state,
      `${kiblatDMS.d}° ${kiblatDMS.m}' ${kiblatDMS.s}"`,
      baseDirection, qiblaDirection,
      `${azimuthResult.d}° ${azimuthResult.m}' ${azimuthResult.s}"`
    ]);

    const messageReply = `...`; // potong untuk singkat

    await sendTelegramMessage(chatId, messageId, messageReply.trim());
  } catch (error) {
    console.error('Error in handleKiblatCalculation:', error);
    await sendTelegramMessage(chatId, messageId, 'Maaf, terjadi kesalahan dalam perhitungan. Silakan coba lagi.');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const contents = JSON.parse(rawBody);

    const chatId = contents.message?.chat?.id;
    const message = contents.message;
    const messageId = message?.message_id;
    const from = message?.from || {};
    const username = from.username || "Tidak Ada";
    const firstName = from.first_name || "Tidak Ada";
    const lastName = from.last_name || "Tidak Ada";

    // Proses pesan terlebih dahulu sebelum mengirim respons 200
    if (message?.text?.toLowerCase() === '/start') {
      await sendTelegramMessage(chatId, messageId, 'Selamat datang...');
    } else if (message?.text?.toLowerCase() === '/about') {
      await sendTelegramMessage(chatId, messageId, 'Tentang bot ini...');
    } else if (message?.location) {
      await handleKiblatCalculation(chatId, messageId, message.location.latitude, message.location.longitude, username, firstName, lastName);
    } else if (message?.text) {
      const dmsPattern = /(\d+)\s*\u00b0\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([NSns])\s*,\s*(\d+)\s*\u00b0\s*(\d+)'\s*(\d+(?:\.\d+)?)"\s*([EWew])/i;
      const decimalPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;
      
      if (dmsPattern.test(message.text)) {
        // Proses koordinat DMS
      } else if (decimalPattern.test(message.text)) {
        // Proses koordinat desimal
      } else {
        await sendTelegramMessage(chatId, messageId, 'Format koordinat tidak valid...');
      }
    }

    // Kirim respons 200 setelah semua operasi selesai
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
