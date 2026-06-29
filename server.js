require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const missionRoutes = require('./api/missions');
const eventRoutes = require('./api/events');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROUTES =====
app.use('/api', missionRoutes);
app.use('/api', eventRoutes);

// Legacy routes (converts, needs, events)
app.get('/converts', (req, res) => res.json([]));
app.get('/needs', (req, res) => res.json([]));
app.get('/events', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        res.json(events);
    } catch(e) {
        res.json([]);
    }
});
app.get('/ping', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/mission-report', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mission-report.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mission-report.html'));
});

app.listen(PORT, () => {
    console.log('==================================================');
    console.log('✅ PHID SYSTEM RUNNING SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`📋 Form: http://localhost:${PORT}/mission-report`);
    console.log(`📍 API:  http://localhost:${PORT}/api/missions`);
    console.log('==================================================');
});