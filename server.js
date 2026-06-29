require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const missionRoutes = require('./api/missions');
const eventRoutes = require('./api/events');

const app = express();
const PORT = process.env.PORT || 3000;

// Multer setup (for handling files in fallback routes)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== ROUTES =====
app.use('/api', missionRoutes);
app.use('/api', eventRoutes);

// ===== FALLBACK DIRECT ROUTES WITH MULTER =====

// GET missions
app.get('/api/missions', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const missions = await query('SELECT * FROM missions ORDER BY created_at DESC');
        res.json(missions);
    } catch (error) {
        console.error('❌ GET /api/missions error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST missions - WITH MULTER (handles images and videos)
app.post('/api/missions', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        const { query } = require('./config/database');
        const { name, lat, lng, date, people, description, city } = req.body;

        if (!name || !lat || !lng || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Process image
        let imageBase64 = null;
        let imageType = null;
        if (req.files && req.files.image && req.files.image[0]) {
            imageBase64 = req.files.image[0].buffer.toString('base64');
            imageType = req.files.image[0].mimetype;
        }

        // Process video
        let videoBase64 = null;
        let videoType = null;
        if (req.files && req.files.video && req.files.video[0]) {
            videoBase64 = req.files.video[0].buffer.toString('base64');
            videoType = req.files.video[0].mimetype;
        }

        const result = await query(`
            INSERT INTO missions 
            (name, lat, lng, city, date, people_reached, description, 
             image_base64, image_type, video_base64, video_type, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING id
        `, [
            name, parseFloat(lat), parseFloat(lng), city || '', date,
            parseInt(people) || 0, description || '',
            imageBase64, imageType, videoBase64, videoType
        ]);

        const newMission = await query('SELECT * FROM missions WHERE id = $1', [result[0].id]);
        res.status(201).json({ success: true, data: newMission[0] });

    } catch (error) {
        console.error('❌ POST /api/missions error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// GET events
app.get('/api/events', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        res.json(events);
    } catch (error) {
        console.error('❌ GET /api/events error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// POST events
app.post('/api/events', async (req, res) => {
    try {
        const { query } = require('./config/database');
        const { title, description, event_date, event_time, category, is_holiday } = req.body;
        if (!title || !event_date) {
            return res.status(400).json({ error: 'Missing title or event_date' });
        }

        const result = await query(`
            INSERT INTO events (title, description, event_date, event_time, category, is_holiday, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
        `, [title, description || '', event_date, event_time || null, category || 'Nyingine', is_holiday || false]);

        const newEvent = await query('SELECT * FROM events WHERE id = $1', [result[0].id]);
        res.status(201).json(newEvent[0]);
    } catch (error) {
        console.error('❌ POST /api/events error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Legacy routes
app.get('/converts', (req, res) => res.json([]));
app.get('/needs', (req, res) => res.json([]));
app.get('/events', (req, res) => res.json([]));

app.get('/ping', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

app.get('/mission-report', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mission-report.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('==================================================');
    console.log('✅ PHID SYSTEM RUNNING SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`📋 Form: http://localhost:${PORT}/mission-report`);
    console.log(`📍 API Missions: http://localhost:${PORT}/api/missions`);
    console.log(`📍 API Events:   http://localhost:${PORT}/api/events`);
    console.log('==================================================');
});