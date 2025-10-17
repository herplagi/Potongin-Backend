const express = require('express');
require('dotenv').config();
const cors = require('cors');
const sequelize = require('./src/config/database');
const cron = require('node-cron');

// Impor Model
const User = require('./src/models/User.model');
const Barbershop = require('./src/models/Barbershop.model');
const Service = require('./src/models/Service.model');
const Staff = require('./src/models/Staff.model');
const Booking = require('./src/models/Booking.model');
const Notification = require('./src/models/Notification.model');
const Review = require('./src/models/Review.model');

// Impor Rute
const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const barbershopRoutes = require('./src/routes/barbershop.routes');
const serviceRoutes = require('./src/routes/service.routes');
const staffRoutes = require('./src/routes/staff.routes');
const bookingRoutes = require('./src/routes/booking.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const reviewRoutes = require('./src/routes/review.routes');

const bookingController = require('./src/controllers/booking.controller');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

cron.schedule('*/5 * * * *', async () => {
    console.log('⏰ Cron Job: Memanggil fungsi expirePendingBookings...');
    await bookingController.expirePendingBookings(); 
});

console.log('✅ Cron job untuk cek booking expired telah dijadwalkan (setiap 5 menit).');

sequelize.sync({ alter: true });

// Pendaftaran Rute
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/barbershops', barbershopRoutes);
app.use('/api/barbershops/:barbershopId/services', serviceRoutes);
app.use('/api/barbershops/:barbershopId/staff', staffRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});