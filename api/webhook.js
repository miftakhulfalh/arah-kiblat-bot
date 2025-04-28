const axios = require('axios');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

// Mengambil variabel lingkungan
const botToken = process.env.BOT_TOKEN;
const telegramApiUrl = `https://api.telegram.org/bot${botToken}`;
const openCageApiKey = process.env.OPENCAGE_API_KEY;
const spreadsheetId = process.env.SPREADSHEET_ID;

// Koordinat Ka'bah dalam format DMS
const kaabahCoordinates = {
  lat: { d: 21, m: 25, s: 21.04 },  // Updated to more precise coordinates
  lon: { d: 39, m: 49, s: 34.25 }   // Updated to more precise coordinates
};

// Koordinat Ka'bah dalam desimal
const latKabah = 21.422511;  // Updated to more precise value
const lonKabah = 39.826181;  // Updated to more precise value

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
    console.log("Error fetching location: " + error);
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
      console.log('Telegram API Error: ' + JSON.stringify(response.data));
      throw new Error(`Telegram API Error: ${response.data.description}`);
    }
    
    return response;
  } catch (error) {
    console.log('Error sending message: ' + error);
    throw error;
  }
}

function dmsToDecimal(degree, minute, second, direction) {
  let decimal = degree + minute / 60 + second / 3600;
  
  // Jika arah S atau W, kalikan dengan -1
  if (direction === 'S' || direction === 'W') {
    decimal *= -1;
  }
  
  return decimal;
}

function toDMS(decimal) {
  const absDecimal = Math.abs(decimal);
  const d = Math.floor(absDecimal);
  const m = Math.floor((absDecimal - d) * 60);
  const s = Math.round(((absDecimal - d) * 60 - m) * 60);
  return { d, m, s };
}

function getQiblaBaseDirection(BkiblatDeg) {
  return BkiblatDeg >= 0 ? 'Utara' : 'Selatan';
}

function getQiblaDirection(lon) {
  return lon > lonKabah ? 'Barat' : 'Timur';
}

function calculateC(lon) {
  // Normalisasi longitude ke range -180 to +180
  let adjustedLon = lon;
  while (adjustedLon > 180) adjustedLon -= 360;
  while (adjustedLon < -180) adjustedLon += 360;
  
  // Hitung selisih longitude dengan Ka'bah (SBMD - Selisih Bujur Mekkah Daerah)
  let c = Math.abs(adjustedLon - lonKabah);
  
  // Jika selisih > 180, gunakan complementary angle
  if (c > 180) {
    c = 360 - c;
  }

  console.log(`Original longitude: ${lon}`);
  console.log(`Adjusted longitude: ${adjustedLon}`);
  console.log(`Calculated c value: ${c}`);

  return c;
}

// Fungsi untuk menghitung arah kiblat (menggunakan rumus original)
function arahKiblat(lat, lon) {
  // Mencari nilai a, b, c
  const a = 90 - lat;
  const b = 90 - latKabah;
  const c = Math.abs(lon - lonKabah);

  // Konversi derajat ke radian
  const aRad = a * (Math.PI / 180);
  const bRad = b * (Math.PI / 180);
  const cRad = c * (Math.PI / 180);

  // Menghitung cotangent b
  const cotanB = 1 / Math.tan(bRad);
  const sinA = Math.sin(aRad);
  const sinC = Math.sin(cRad);
  const cosA = Math.cos(aRad);
  const cotanC = 1 / Math.tan(cRad);

  // Rumus perhitungan arah kiblat
  const cotanBkiblat = ((cotanB * sinA) / sinC) - (cosA * cotanC);
  
  // Menghitung Bkiblat (dalam radian)
  const BkiblatRad = Math.atan(1 / cotanBkiblat);
  
  // Mengubah hasil dari radian ke derajat
  const BkiblatDeg = BkiblatRad * (180 / Math.PI);

  return {
    dms: toDMS(Math.abs(BkiblatDeg)),
    decimal: BkiblatDeg
  };
}

function calculateAzimuth(kiblatDecimal, baseDirection, qiblaDirection) {
  let azimuthDeg;
  
  // Take absolute value of kiblatDecimal for calculations
  const absKiblat = Math.abs(kiblatDecimal);
  
  if (baseDirection === 'Utara') {
    if (qiblaDirection === 'Timur') {
      azimuthDeg = absKiblat;
    } else { // Barat
      azimuthDeg = 360 - absKiblat;
    }
  } else { // Selatan
    if (qiblaDirection === 'Timur') {
      azimuthDeg = 180 - absKiblat;
    } else { // Barat
      azimuthDeg = 180 + absKiblat;
    }
  }

  return toDMS(azimuthDeg);
}

function getQiblaDeviation(azimuthDeg) {
  // Normalize azimuth to 0-360 range
  while (azimuthDeg >= 360) azimuthDeg -= 360;
  while (azimuthDeg < 0) azimuthDeg += 360;
  
  let baseDirection = '';
  let deviation = 0;
  
  // Calculate deviation from nearest cardinal direction
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
  
  // Format the deviation text
  const absDeviation = Math.abs(deviation);
  const deviationDMS = toDMS(absDeviation);
  const direction = deviation >= 0 ? 'kanan' : 'kiri';
  
  return {
    baseDirection,
    deviationDMS,
    direction
  };
}

async function saveToSpreadsheet(data) {
  try {
    // Setup authentication
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });
    
    // Prepare values
    const values = [data];
    
    // Append to spreadsheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:N',
      valueInputOption: 'USER_ENTERED',
      resource: { values }
    });
    
    console.log('Data saved to spreadsheet');
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
    
    // Tentukan arah kiblat terlebih dahulu
    const qiblaDirection = getQiblaDirection(lon);
    const baseDirection = getQiblaBaseDirection(kiblatResult.decimal);

    // Sekarang kita bisa menghitung azimuth dengan parameter yang benar
    const azimuthResult = calculateAzimuth(
      kiblatResult.decimal,
      baseDirection,
      qiblaDirection
    );

    // Calculate deviation
    const azimuthDecimal = azimuthResult.d + (azimuthResult.m / 60) + (azimuthResult.s / 3600);
    const deviation = getQiblaDeviation(azimuthDecimal);

    // Nilai absolut untuk DMS kiblat
    const kiblatDMS = toDMS(Math.abs(kiblatResult.decimal));

    const latDirection = lat >= 0 ? "N" : "S";
    const lonDirection = lon >= 0 ? "E" : "W";

    // Save to spreadsheet
    await saveToSpreadsheet([
      chatId,
      username,
      firstName,
      lastName,
      lat,
      lon,
      `${latDMS.d}° ${latDMS.m}' ${latDMS.s}" ${latDirection}`,
      `${lonDMS.d}° ${lonDMS.m}' ${lonDMS.s}" ${lonDirection}`,
      city,
      state,
      `${kiblatDMS.d}° ${kiblatDMS.m}' ${kiblatDMS.s}"`,
      baseDirection,
      qiblaDirection,
      `${azimuthResult.d}° ${azimuthResult.m}' ${azimuthResult.s}"`
    ]);

    const messageReply = `
<b>PERHITUNGAN ARAH KIBLAT</b>

Latitude
------------------   ${lat.toFixed(6)} (${latDMS.d}° ${latDMS.m}' ${latDMS.s}" ${latDirection})
Longitude
------------------   ${lon.toFixed(6)} (${lonDMS.d}° ${lonDMS.m}' ${lonDMS.s}" ${lonDirection})
Lokasi Anda
------------------   ${city}, ${state}
Latitude Ka'bah
------------------   ${kaabahCoordinates.lat.d}° ${kaabahCoordinates.lat.m}' ${kaabahCoordinates.lat.s}" N
Longitude Ka'bah
------------------   ${kaabahCoordinates.lon.d}° ${kaabahCoordinates.lon.m}' ${kaabahCoordinates.lon.s}" E
Arah Kiblat
------------------   ${kiblatDMS.d}° ${kiblatDMS.m}' ${kiblatDMS.s}" dari ${baseDirection} ke ${qiblaDirection}
Azimuth Kiblat
------------------   ${azimuthResult.d}° ${azimuthResult.m}' ${azimuthResult.s}"
Kecondongan
------------------   ${deviation.deviationDMS.d}° ${deviation.deviationDMS.m}' ${deviation.deviationDMS.s}" ke ${deviation.direction} dari arah ${deviation.baseDirection}`;

    // Send message and log response
    await sendTelegramMessage(chatId, messageId, messageReply.trim());
    console.log('Calculation completed and message sent for coordinates: ' + lat + ', ' + lon);
  } catch (error) {
    console.log('Error in handleKiblatCalculation: ' + error);
    await sendTelegramMessage(chatId, messageId, 'Maaf, terjadi kesalahan dalam perhitungan. Silakan coba lagi.');
  }
}

module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    const contents = req.body;
    
    // Check if it's a valid Telegram update
    if (!contents.message) {
      return res.status(400).json({ message: 'Invalid Telegram update' });
    }
    
    const chatId = contents.message.chat.id;
    const message = contents.message;
    const messageId = message.message_id;

    const from = message.from || {};
    const username = from.username || "Tidak Ada";
    const firstName = from.first_name || "Tidak Ada";
    const lastName = from.last_name || "Tidak Ada";

    console.log('Received message: ' + JSON.stringify(message));

    // Process message asynchronously to respond to Telegram quickly
    res.status(200).json({ message: 'Processing' });

    // Start message handling
    if (message.text && message.text.toLowerCase() === '/start') {
      const welcomeMessage = `
Selamat datang di Perhitungan Arah Kiblat.

Anda memiliki dua pilihan:
1. Kirim lokasi Anda (gunakan fitur share location)
2. Kirim koordinat manual dalam formatDMS:
   10° 30' 45" N, 20° 15' 30" E
   (pastikan menggunakan simbol ° untuk derajat)
3. Kirim koordinat dalam format desimal:
   -0.022892, 109.338894`;
      
      await sendTelegramMessage(chatId, messageId, welcomeMessage.trim());
      return;
    }

    if (message.text && message.text.toLowerCase() === '/about') {
      const aboutMessage = `
Perhitungan arah kiblat ini menggunakan rumus 
cotan B = tan latitude Ka'bah + sin latitude tempat  / sin C - sin latitude tempat / tan C
Terima kasih telah menggunakan bot ini.
Contact x.com/miftahelfalh`;
      
      await sendTelegramMessage(chatId, messageId, aboutMessage.trim());
      return;
    }

    if (message.location) {
      console.log('Processing location message: ' + JSON.stringify(message.location));
      await handleKiblatCalculation(chatId, messageId, message.location.latitude, message.location.longitude, username, firstName, lastName);
      return;
    }

    if (message.text) {
      console.log('Processing text message: ' + message.text);
      
      // Pattern untuk format DMS
      const dmsPattern = /(\d+)\s*°\s*(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*"\s*([NSns])\s*,\s*(\d+)\s*°\s*(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*"\s*([EWew])/i;
      
      // Pattern untuk format desimal (menerima angka positif/negatif dengan koma atau titik sebagai pemisah)
      const decimalPattern = /(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/;

      if (dmsPattern.test(message.text)) {
        const match = message.text.match(dmsPattern);
        console.log('DMS format match: ' + JSON.stringify(match));

        const lat = dmsToDecimal(
          parseFloat(match[1]), 
          parseFloat(match[2]), 
          parseFloat(match[3]), 
          match[4].toUpperCase()
        );
        const lon = dmsToDecimal(
          parseFloat(match[5]), 
          parseFloat(match[6]), 
          parseFloat(match[7]), 
          match[8].toUpperCase()
        );

        console.log('Converted DMS coordinates: ' + lat + ', ' + lon);
        await handleKiblatCalculation(chatId, messageId, lat, lon, username, firstName, lastName);
        return;
      }
      
      if (decimalPattern.test(message.text)) {
        const match = message.text.match(decimalPattern);
        console.log('Decimal format match: ' + JSON.stringify(match));
        
        const lat = parseFloat(Number(match[1]).toFixed(6));
        const lon = parseFloat(Number(match[2]).toFixed(6));
        
        console.log('Rounded decimal coordinates: ' + lat + ', ' + lon);
        await handleKiblatCalculation(chatId, messageId, lat, lon, username, firstName, lastName);
        return;
      }

      await sendTelegramMessage(chatId, messageId, `
Format koordinat tidak valid. Silakan kirim lokasi atau koordinat dengan salah satu format berikut:

1. Format DMS:
   10° 30' 45.5" N, 20° 15' 30.0" E
   Pastikan menggunakan:
   - Simbol derajat (°)
   - Tanda petik satu (')
   - Tanda petik dua (")
   - Arah mata angin (N/S untuk latitude, E/W untuk longitude)

2. Format Desimal:
   -0.022892, 109.338894
   - Gunakan tanda minus (-) untuk latitude Selatan atau longitude Barat
   - Gunakan tanda koma (,) sebagai pemisah antara latitude dan longitude`);
    }
  } catch (error) {
    console.error('Error in webhook handler:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
