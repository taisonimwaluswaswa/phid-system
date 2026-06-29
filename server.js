require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

const missionRoutes = require('./api/missions');
const eventRoutes = require('./api/events');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MULTER SETUP =====
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB - ILIYOPANULIWA
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
//  ROUTES ZA API
// ============================================================
app.use('/api', missionRoutes);
app.use('/api', eventRoutes);

// ============================================================
//  FALLBACK ROUTES
// ============================================================

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

// ============================================================
//  POST missions - WITH MULTER (ILIYOREKEBISHWA NA LOGGING)
// ============================================================
app.post('/api/missions', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('📥 ===== POST /api/missions =====');
        console.log('📥 Body keys:', Object.keys(req.body));
        console.log('📥 Files received:', req.files ? Object.keys(req.files) : 'NONE');

        // ===== LOG YA KINA KWA FILES =====
        if (req.files) {
            if (req.files.image) {
                console.log('📸 Image file:', req.files.image[0].originalname, req.files.image[0].size, 'bytes');
            }
            if (req.files.video) {
                console.log('🎥 Video file:', req.files.video[0].originalname, req.files.video[0].size, 'bytes');
                console.log('🎥 Video mimetype:', req.files.video[0].mimetype);
            }
        }

        const { query } = require('./config/database');
        const { name, lat, lng, date, people, description, city } = req.body;

        if (!name || !lat || !lng || !date) {
            console.log('❌ Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // ===== PICHA =====
        let imageBase64 = null;
        let imageType = null;
        if (req.files && req.files.image && req.files.image[0]) {
            try {
                imageBase64 = req.files.image[0].buffer.toString('base64');
                imageType = req.files.image[0].mimetype;
                console.log('📸 Image converted to base64, length:', imageBase64.length);
            } catch (e) {
                console.error('❌ Image conversion error:', e.message);
            }
        }

        // ===== VIDEO =====
        let videoBase64 = null;
        let videoType = null;
        if (req.files && req.files.video && req.files.video[0]) {
            try {
                videoBase64 = req.files.video[0].buffer.toString('base64');
                videoType = req.files.video[0].mimetype;
                console.log('🎥 Video converted to base64, length:', videoBase64.length);
            } catch (e) {
                console.error('❌ Video conversion error:', e.message);
            }
        }

        console.log('📝 Saving to database...');
        console.log('📸 Image saved:', imageBase64 ? 'YES' : 'NO');
        console.log('🎥 Video saved:', videoBase64 ? 'YES' : 'NO');

        // ===== INSERT KWENYE DATABASE =====
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

        console.log('✅ Saved with ID:', result[0].id);

        const newMission = await query('SELECT * FROM missions WHERE id = $1', [result[0].id]);
        res.status(201).json({ success: true, data: newMission[0] });

    } catch (error) {
        console.error('❌ POST /api/missions ERROR:', error.message);
        console.error('❌ Stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
//  EVENTS ROUTES
// ============================================================

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

// ============================================================
//  LEGACY ROUTES
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
//  DEBUG DATABASE VIEWER
// ============================================================
app.get('/api/debug', async (req, res) => {
    try {
        const { query } = require('./config/database');
        
        const missions = await query('SELECT * FROM missions ORDER BY created_at DESC');
        const events = await query('SELECT * FROM events ORDER BY event_date ASC');
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>PHID Database Viewer</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #f0f2f5; }
                .container { max-width: 1400px; margin: 0 auto; }
                h1 { color: #2c3e50; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
                h1 small { font-size: 16px; font-weight: normal; color: #7f8c8d; }
                h2 { color: #34495e; margin-top: 30px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
                .stats { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
                .stat-card { background: white; padding: 15px 25px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex: 1; min-width: 150px; }
                .stat-card .number { font-size: 28px; font-weight: bold; color: #2c3e50; }
                .stat-card .label { color: #7f8c8d; font-size: 14px; }
                .table-wrapper { overflow-x: auto; background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 10px; }
                table { width: 100%; border-collapse: collapse; font-size: 14px; }
                th { background: #2c3e50; color: white; padding: 12px 10px; text-align: left; position: sticky; top: 0; z-index: 10; }
                td { padding: 10px; border-bottom: 1px solid #ecf0f1; vertical-align: middle; }
                tr:hover td { background: #f8f9fa; }
                .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
                .badge-yes { background: #d4edda; color: #155724; }
                .badge-no { background: #f8d7da; color: #721c24; }
                .media-preview { max-width: 120px; max-height: 120px; border-radius: 8px; margin-top: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; }
                video.media-preview { max-width: 180px; max-height: 120px; }
                .nav-links { margin-top: 30px; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; gap: 20px; flex-wrap: wrap; }
                .nav-links a { color: #3498db; text-decoration: none; padding: 8px 16px; border: 1px solid #3498db; border-radius: 6px; transition: all 0.3s; }
                .nav-links a:hover { background: #3498db; color: white; }
                .empty { text-align: center; color: #95a5a6; padding: 40px; font-size: 18px; }
                .footer { margin-top: 20px; color: #95a5a6; font-size: 12px; text-align: center; }
                @media (max-width: 768px) {
                    table { font-size: 12px; }
                    td, th { padding: 6px 4px; }
                    .media-preview { max-width: 60px; max-height: 60px; }
                    video.media-preview { max-width: 80px; max-height: 60px; }
                    .stat-card .number { font-size: 20px; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>📊 PHID DATABASE VIEWER <small>Potters House International Dar es Salaam</small></h1>
                
                <div class="stats">
                    <div class="stat-card">
                        <div class="number">${missions.length}</div>
                        <div class="label">📋 Missions</div>
                    </div>
                    <div class="stat-card">
                        <div class="number">${events.length}</div>
                        <div class="label">📅 Events</div>
                    </div>
                    <div class="stat-card">
                        <div class="number">${missions.filter(m => m.image_base64).length}</div>
                        <div class="label">📸 With Images</div>
                    </div>
                    <div class="stat-card">
                        <div class="number">${missions.filter(m => m.video_base64).length}</div>
                        <div class="label">🎥 With Videos</div>
                    </div>
                </div>
                
                <h2>📋 MISSIONS (${missions.length})</h2>
                ${missions.length === 0 ? '<div class="empty">No missions found yet.</div>' : `
                <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name / Description</th>
                            <th>Location</th>
                            <th>City</th>
                            <th>Date</th>
                            <th>People</th>
                            <th>Image</th>
                            <th>Video</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${missions.map(m => `
                            <tr>
                                <td><strong>${m.id}</strong></td>
                                <td>
                                    <strong>${m.name}</strong>
                                    ${m.description ? `<br><small style="color:#666;">${m.description.substring(0, 60)}${m.description.length > 60 ? '...' : ''}</small>` : ''}
                                </td>
                                <td>${m.lat}, ${m.lng}</td>
                                <td>${m.city || '-'}</td>
                                <td>${m.date}</td>
                                <td>${m.people_reached || 0}</td>
                                <td>
                                    ${m.image_base64 ? `
                                        <span class="badge badge-yes">✅ YES</span><br>
                                        <img src="data:${m.image_type || 'image/png'};base64,${m.image_base64}" 
                                             class="media-preview" 
                                             onclick="window.open(this.src)" 
                                             alt="Image">
                                    ` : `<span class="badge badge-no">❌ NO</span>`}
                                </td>
                                <td>
                                    ${m.video_base64 ? `
                                        <span class="badge badge-yes">✅ YES</span><br>
                                        <div class="video-wrapper">
                                            <video controls class="media-preview" 
                                                   onclick="this.paused ? this.play() : this.pause();">
                                                <source src="data:${m.video_type || 'video/mp4'};base64,${m.video_base64}">
                                            </video>
                                        </div>
                                    ` : `<span class="badge badge-no">❌ NO</span>`}
                                </td>
                                <td style="font-size:12px; color:#666;">${new Date(m.created_at).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
                `}
                
                <h2>📅 EVENTS (${events.length})</h2>
                ${events.length === 0 ? '<div class="empty">No events found yet.</div>' : `
                <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Title / Description</th>
                            <th>Date</th>
                            <th>Time</th>
                            <th>Category</th>
                            <th>Holiday</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${events.map(e => `
                            <tr>
                                <td>${e.id}</td>
                                <td>
                                    <strong>${e.title}</strong>
                                    ${e.description ? `<br><small style="color:#666;">${e.description.substring(0, 50)}${e.description.length > 50 ? '...' : ''}</small>` : ''}
                                </td>
                                <td>${e.event_date}</td>
                                <td>${e.event_time || '-'}</td>
                                <td><span style="background:#e8f0fe; padding:3px 10px; border-radius:12px;">${e.category || 'Nyingine'}</span></td>
                                <td>${e.is_holiday ? '✅ Yes' : '❌ No'}</td>
                                <td style="font-size:12px; color:#666;">${new Date(e.created_at).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                </div>
                `}
                
                <div class="nav-links">
                    <a href="/api/debug">🔄 Refresh</a>
                    <a href="/">🏠 Home</a>
                    <a href="/mission-report">📋 Mission Form</a>
                    <a href="/api/missions">📡 Missions API (JSON)</a>
                    <a href="/api/events">📡 Events API (JSON)</a>
                </div>
                
                <div class="footer">
                    PHID System v1.0 | ${new Date().toLocaleString()}
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
//  START SERVER
// ============================================================
app.listen(PORT, () => {
    console.log('==================================================');
    console.log('✅ PHID SYSTEM RUNNING SUCCESSFULLY!');
    console.log('==================================================');
    console.log(`📋 Form: http://localhost:${PORT}/mission-report`);
    console.log(`📍 API Missions: http://localhost:${PORT}/api/missions`);
    console.log(`📍 API Events:   http://localhost:${PORT}/api/events`);
    console.log(`🐛 Debug:        http://localhost:${PORT}/api/debug`);
    console.log('==================================================');
});