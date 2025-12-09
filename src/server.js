require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for image uploads

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'POS Changarro API is running' });
});

// Import routes
const syncRoutes = require('./routes/sync.routes');
const paymentRoutes = require('./routes/payment.routes');
app.use('/api/sync', syncRoutes);
app.use('/api/payment', paymentRoutes);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Initialize DB if needed
    db.init();
});
