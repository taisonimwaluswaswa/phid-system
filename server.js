require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MULTER - MEMORY STORAGE (BASE64) =====
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
//  DATABASE
// ============================================================
const { query } = require('./config/database');

// ============================================================
//  GET MISSIONS
// ============================================================
app.get('/api/missions', async (req, res) => {
    try {
        const missions = await query('SELECT * FROM missions ORDER BY created_at DESC');
        res.json(missions);
    } catch (error) {
        console.error('❌ GET error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  POST MISSION - MEMORY STORAGE (BASE64)
// ============================================================
app.post('/api/missions', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('📥 ===== POST /api/missions =====');
        console.log('📥 Body keys:', Object.keys(req.body));
        console.log('📥 Files:', req.files ? Object.keys(req.files) : 'NONE');

        const { name, lat, lng, date, people, description, city } = req.body;

        if (!name || !lat || !lng || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // ===== PICHA - BASE64 =====
        let imageBase64 = null;
        let imageType = null;
        if (req.files && req.files.image && req.files.image[0]) {
            try {
                imageBase64 = req.files.image[0].buffer.toString('base64');
                imageType = req.files.image[0].mimetype;
                console.log('📸 Image OK, size:', req.files.image[0].size);
            } catch (e) {
                console.error('❌ Image error:', e.message);
            }
        }

        // ===== VIDEO - BASE64 =====
        let videoBase64 = null;
        let videoType = null;
        if (req.files && req.files.video && req.files.video[0]) {
            try {
                videoBase64 = req.files.video[0].buffer.toString('base64');
                videoType = req.files.video[0].mimetype;
                console.log('🎥 Video OK, size:', req.files.video[0].size);
            } catch (e) {
                console.error('❌ Video error:', e.message);
            }
        }

        // ===== INSERT KWENYE DATABASE (TUMIA image_base64 na video_base64) =====
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

        console.log('✅ Saved ID:', result[0].id);
        console.log('📸 Image saved:', imageBase64 ? 'YES' : 'NO');
        console.log('🎥 Video saved:', videoBase64 ? 'YES' : 'NO');

        const newMission = await query('SELECT * FROM missions WHERE id = $1', [result[0].id]);
        res.status(201).json({ success: true, data: newMission[0] });

    } catch (error) {
        console.error('❌ POST ERROR:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  EVENTS ROUTES
// ============================================================
app.get('/api/events', async (req, res) => {
    try {
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/events', async (req, res) => {
    try {
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
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  OTHER ROUTES
// ============================================================
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

// ============================================================
//  DEBUG VIEWER
// ============================================================
app.get('/api/debug', async (req, res) => {
    try {
        const missions = await query('SELECT * FROM missions ORDER BY created_at DESC');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head><title>PHID Database</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial; margin: 20px; background: #f0f2f5; }
            .container { max-width: 1200px; margin: auto; }
            h1 { color: #2c3e50; }
            .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
            .stat-card { background: white; padding: 15px 25px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .stat-card .number { font-size: 28px; font-weight: bold; }
            .stat-card .label { color: #7f8c8d; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; background: white; border-radius: 10px; overflow: hidden; }
            th { background: #2c3e50; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ecf0f1; vertical-align: middle; }
            .badge-yes { background: #d4edda; color: #155724; padding: 4px 10px; border-radius: 20px; font-size: 12px; }
            .badge-no { background: #f8d7da; color: #721c24; padding: 4px 10px; border-radius: 20px; font-size: 12px; }
            img, video { max-width: 150px; max-height: 120px; border-radius: 6px; }
            .nav-links { margin-top: 20px; display: flex; gap: 15px; flex-wrap: wrap; }
            .nav-links a { color: #3498db; text-decoration: none; padding: 8px 16px; border: 1px solid #3498db; border-radius: 6px; }
            .nav-links a:hover { background: #3498db; color: white; }
        </style>
        </head>
        <body>
        <div class="container">
            <h1>📊 PHID DATABASE</h1>
            <div class="stats">
                <div class="stat-card"><div class="number">${missions.length}</div><div class="label">Missions</div></div>
                <div class="stat-card"><div class="number">${events.length}</div><div class="label">Events</div></div>
                <div class="stat-card"><div class="number">${missions.filter(m => m.image_base64).length}</div><div class="label">With Images</div></div>
                <div class="stat-card"><div class="number">${missions.filter(m => m.video_base64).length}</div><div class="label">With Videos</div></div>
            </div>
            <h2>📋 MISSIONS</h2>
            <table>
                <tr><th>ID</th><th>Name</th><th>Location</th><th>Date</th><th>Image</th><th>Video</th></tr>
                ${missions.map(m => `
                    <tr>
                        <td>${m.id}</td>
                        <td>${m.name}</td>
                        <td>${m.lat}, ${m.lng}</td>
                        <td>${m.date}</td>
                        <td>${m.image_base64 ? `<span class="badge-yes">YES</span><br><img src="data:${m.image_type || 'image/png'};base64,${m.image_base64}" style="max-width:120px;">` : '<span class="badge-no">NO</span>'}</td>
                        <td>${m.video_base64 ? `<span class="badge-yes">YES</span><br><video controls src="data:${m.video_type || 'video/mp4'};base64,${m.video_base64}" style="max-width:180px;max-height:120px;"></video>` : '<span class="badge-no">NO</span>'}</td>
                    </tr>
                `).join('')}
            </table>
            <h2>📅 EVENTS</h2>
            <table>
                <tr><th>ID</th><th>Title</th><th>Date</th><th>Category</th></tr>
                ${events.map(e => `
                    <tr><td>${e.id}</td><td>${e.title}</td><td>${e.event_date}</td><td>${e.category}</td></tr>
                `).join('')}
            </table>
            <div class="nav-links">
                <a href="/api/debug">🔄 Refresh</a>
                <a href="/">🏠 Home</a>
                <a href="/mission-report">📋 Mission Form</a>
            </div>
        </div>
        </body>
        </html>
        `;
        res.send(html);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  START
// ============================================================
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('✅ PHID SYSTEM RUNNING ON PORT', PORT);
    console.log('==================================================');
    console.log(`📍 API: http://localhost:${PORT}/api/missions`);
    console.log(`🐛 Debug: http://localhost:${PORT}/api/debug`);
    console.log('==================================================');
});