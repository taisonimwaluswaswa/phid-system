require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const missionRoutes = require('./api/missions');
const eventRoutes = require('./api/events');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
//  ROUTES ZA API – HAPA NDIPO TUNASAHIHISHA
// ============================================================

// 1. Missions – tayari ziko kwenye missionRoutes
app.use('/api', missionRoutes);

// 2. Events – tunatumia eventRoutes lakini kwa '/api' prefix
//    Hivyo routes zote kwenye events.js zinapaswa kuwa '/events' (bila /api)
app.use('/api', eventRoutes);

// 3. Fallback direct kwa /api/events – ikiwa eventRoutes haifanyi kazi
app.get('/api/events', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        res.json(events);
    } catch (error) {
        console.error('❌ /api/events error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Legacy routes (zilizokuwa zikitumika kwenye HTML)
app.get('/converts', (req, res) => res.json([]));
app.get('/needs', (req, res) => res.json([]));
app.get('/events', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        res.json(events);
    } catch (e) {
        res.json([]);
    }
});

// Ping
app.get('/ping', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// HTML pages
app.get('/mission-report', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mission-report.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('✅ PHID SYSTEM RUNNING SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`📋 Form: http://localhost:${PORT}/mission-report`);
    console.log(`📍 API Missions: http://localhost:${PORT}/api/missions`);
    console.log(`📍 API Events:   http://localhost:${PORT}/api/events`);
    console.log('==================================================');
});