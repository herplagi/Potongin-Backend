// src/config/midtrans.config.js
const midtransClient = require('midtrans-client');

// ✅ VALIDASI ENVIRONMENT VARIABLES
if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    console.error('❌ MIDTRANS_SERVER_KEY atau MIDTRANS_CLIENT_KEY tidak ditemukan di .env');
    throw new Error('Midtrans credentials tidak lengkap. Periksa file .env');
}

console.log('🔑 Midtrans Config Loaded:', {
    serverKey: process.env.MIDTRANS_SERVER_KEY.substring(0, 10) + '...',
    clientKey: process.env.MIDTRANS_CLIENT_KEY.substring(0, 10) + '...',
    isProduction: false,
    backendUrl: process.env.BACKEND_URL,
    frontendUrl: process.env.FRONTEND_URL
});

// ✅ SNAP API (untuk membuat transaksi)
const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// ✅ CORE API (untuk cek status transaksi)
const core = new midtransClient.CoreApi({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

/**
 * Get Frontend URL for callbacks
 * Untuk mobile app, gunakan deep link
 */
const getFrontendUrl = () => {
    return process.env.FRONTEND_URL || 'potong://payment';
};

/**
 * Get Backend URL for webhooks
 * Untuk development dengan ngrok, gunakan ngrok URL
 * Untuk production, gunakan domain asli
 */
const getBackendUrl = () => {
    if (process.env.NODE_ENV === 'development') {
        // Gunakan ngrok URL jika ada, fallback ke localhost
        return process.env.BACKEND_URL || 'http://localhost:5000';
    }
    return process.env.BACKEND_URL || 'https://yourdomain.com';
};

/**
 * Get Notification URL for Midtrans Webhook
 * Ini adalah URL yang akan dipanggil Midtrans saat status pembayaran berubah
 */
const getNotificationUrl = () => {
    const backendUrl = getBackendUrl();
    return `${backendUrl}/api/bookings/payment-notification`;
};

module.exports = { 
    snap, 
    core, 
    getFrontendUrl, 
    getBackendUrl,
    getNotificationUrl 
};