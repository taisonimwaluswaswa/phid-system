const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ====== SERVE STATIC FILES ======
// Thibitisha folder ya uploads ipo
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
    console.log('📁 Creating uploads folder...');
    fs.mkdirSync(uploadsPath, { recursive: true });
}

// Serve static files from uploads
app.use('/uploads', express.static(uploadsPath));
app.use(express.static(path.join(__dirname, 'public')));

// ====== LOGGING MIDDLEWARE ======
app.use((req, res, next) => {
    console.log(`📨 ${req.method} ${req.url}`);
    next();
});

// ====== DATABASE CONNECTION ======
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'PHID',
    password: '1234',
    port: 5432,
});

pool.connect(async (err) => {
    if (err) {
        console.error('❌ DATABASE ERROR:', err.message);
        console.error('💡 Check: PostgreSQL running? Password correct? Database "PHID" exists?');
        process.exit(1);
    } else {
        console.log('✅ Database connected successfully');
    }
});

// ====== SSE (Server-Sent Events) ======
const clients = [];
app.get('/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });
    clients.push(res);
    req.on('close', () => {
        const idx = clients.indexOf(res);
        if (idx > -1) clients.splice(idx, 1);
    });
});

function broadcast(data) {
    clients.forEach(c => c.write(`data: ${JSON.stringify(data)}\n\n`));
}

// ====== CONVERTS ======
app.get('/converts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM converts ORDER BY id DESC');
        console.log(`📊 GET /converts: ${result.rows.length} records`);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /converts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/converts', async (req, res) => {
    const { name, phone, status, latitude, longitude, gender, branch, partner_id, location_name, photo_url } = req.body;
    console.log('📝 POST /converts:', { name, status });

    try {
        const result = await pool.query(
            `INSERT INTO converts (name, phone, status, latitude, longitude, gender, branch, partner_id, location_name, photo_url) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [name, phone, status, latitude, longitude, gender, branch, partner_id, location_name, photo_url]
        );
        const newRecord = result.rows[0];
        console.log('✅ Convert saved:', newRecord.id, name);
        broadcast({ type: 'convert', payload: newRecord });
        res.json(newRecord);
    } catch (err) {
        console.error('❌ POST /converts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/converts/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM converts WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
        console.log('🗑️ DELETE /converts:', id);
        broadcast({ type: 'delete', payload: { id: parseInt(id) } });
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        console.error('❌ DELETE /converts error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ====== EVENTS ======
app.get('/events', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM events ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /events error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/events', async (req, res) => {
    const { name, latitude, longitude } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO events (name, latitude, longitude) VALUES ($1,$2,$3) RETURNING *',
            [name, latitude, longitude]
        );
        const newRecord = result.rows[0];
        console.log('✅ Event saved:', newRecord.id, name);
        broadcast({ type: 'event', payload: newRecord });
        res.json(newRecord);
    } catch (err) {
        console.error('❌ POST /events error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ====== NEEDS ======
app.get('/needs', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM needs ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /needs error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/needs', async (req, res) => {
    const { need, latitude, longitude } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO needs (need, latitude, longitude) VALUES ($1,$2,$3) RETURNING *',
            [need, latitude, longitude]
        );
        const newRecord = result.rows[0];
        console.log('✅ Need saved:', newRecord.id, need);
        broadcast({ type: 'need', payload: newRecord });
        res.json(newRecord);
    } catch (err) {
        console.error('❌ POST /needs error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ====== DEPARTMENTS ======
app.get('/departments', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT d.*,
                (SELECT COUNT(*) FROM department_members dm WHERE dm.department_id = d.id AND dm.is_current = true)::int AS member_count,
                (SELECT json_build_object('id', dm.id, 'name', dm.member_name, 'start_date', dm.start_date) 
                 FROM department_members dm WHERE dm.department_id = d.id AND dm.role = 'leader' AND dm.is_current = true LIMIT 1) AS current_leader
            FROM departments d
            ORDER BY d.name
        `);
        console.log('📊 GET /departments:', result.rows.length, 'departments');
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /departments error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/departments/:id', async (req, res) => {
    const { id } = req.params;
    console.log('📋 GET /departments/' + id);
    try {
        const deptResult = await pool.query('SELECT * FROM departments WHERE id = $1', [id]);
        if (deptResult.rows.length === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }

        let members = [];
        try {
            const membersResult = await pool.query(
                `SELECT id, member_name, phone, role, start_date, end_date, is_current 
                 FROM department_members 
                 WHERE department_id = $1 AND is_current = true 
                 ORDER BY role DESC, member_name`,
                [id]
            );
            members = membersResult.rows;
        } catch (err) {
            console.warn('⚠️ department_members table error:', err.message);
        }

        let leaders = [];
        try {
            const leadersResult = await pool.query(
                `SELECT id, member_name, start_date, end_date 
                 FROM department_members 
                 WHERE department_id = $1 AND role = 'leader' 
                 ORDER BY start_date DESC`,
                [id]
            );
            leaders = leadersResult.rows;
        } catch (err) {
            console.warn('⚠️ department_members table error (leaders):', err.message);
        }

        let activities = [];
        try {
            const activitiesResult = await pool.query(
                `SELECT id, title, description, activity_date, location, created_at 
                 FROM department_activities 
                 WHERE department_id = $1 
                 ORDER BY activity_date DESC, created_at DESC`,
                [id]
            );
            activities = activitiesResult.rows;
        } catch (err) {
            console.warn('⚠️ department_activities table error:', err.message);
        }

        res.json({
            department: deptResult.rows[0],
            members: members,
            leaders: leaders,
            activities: activities
        });
    } catch (err) {
        console.error('❌ GET /departments/:id error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/departments/:id/members', async (req, res) => {
    const { id } = req.params;
    const { member_name, phone, role } = req.body;
    if (!member_name) return res.status(400).json({ error: 'Member name required' });
    try {
        const result = await pool.query(
            `INSERT INTO department_members (department_id, member_name, phone, role, start_date, is_current)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, true) RETURNING *`,
            [id, member_name, phone, role || 'member']
        );
        console.log('✅ Member added to department:', member_name);
        broadcast({ type: 'department_member', payload: result.rows[0] });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ POST /departments/:id/members error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.put('/departments/:id/leader', async (req, res) => {
    const { id } = req.params;
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required' });
    try {
        const member = await pool.query(
            'SELECT * FROM department_members WHERE id = $1 AND department_id = $2',
            [member_id, id]
        );
        if (member.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

        await pool.query(
            `UPDATE department_members SET end_date = CURRENT_DATE, is_current = false 
             WHERE department_id = $1 AND role = 'leader' AND is_current = true`,
            [id]
        );

        const result = await pool.query(
            `UPDATE department_members SET role = 'leader', start_date = CURRENT_DATE, end_date = NULL, is_current = true 
             WHERE id = $1 RETURNING *`,
            [member_id]
        );

        console.log('👑 Leader changed for department', id);
        broadcast({ type: 'leader_changed', payload: { department_id: id, new_leader: result.rows[0] } });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ PUT /departments/:id/leader error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/departments/:id/activities', async (req, res) => {
    const { id } = req.params;
    const { title, description, activity_date, location } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    try {
        const result = await pool.query(
            `INSERT INTO department_activities (department_id, title, description, activity_date, location)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id, title, description, activity_date || new Date(), location]
        );
        console.log('📅 Activity added to department:', title);
        broadcast({ type: 'department_activity', payload: result.rows[0] });
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ POST /departments/:id/activities error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ====== ATTENDANCE ======
app.get('/attendance', async (req, res) => {
    const { date, convert_id } = req.query;
    try {
        let query = `SELECT a.*, c.name as convert_name 
                     FROM attendance a 
                     JOIN converts c ON a.convert_id = c.id 
                     WHERE 1=1`;
        const params = [];
        if (date) {
            params.push(date);
            query += ` AND a.attendance_date = $${params.length}`;
        }
        if (convert_id) {
            params.push(convert_id);
            query += ` AND a.convert_id = $${params.length}`;
        }
        query += ` ORDER BY a.attendance_date DESC, a.created_at DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /attendance error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/attendance', async (req, res) => {
    const { convert_id, service_type, status } = req.body;
    const attendance_date = new Date().toISOString().split('T')[0];
    if (!convert_id || !service_type) {
        return res.status(400).json({ error: 'convert_id and service_type required' });
    }
    try {
        const check = await pool.query(
            'SELECT * FROM attendance WHERE convert_id = $1 AND attendance_date = $2 AND service_type = $3',
            [convert_id, attendance_date, service_type]
        );
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'Attendance already recorded for this service today' });
        }
        const result = await pool.query(
            `INSERT INTO attendance (convert_id, attendance_date, service_type, status)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [convert_id, attendance_date, service_type, status || 'Present']
        );
        console.log('✅ Attendance recorded:', convert_id, service_type);
        broadcast({ type: 'attendance', payload: result.rows[0] });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ POST /attendance error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/attendance-summary', async (req, res) => {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    try {
        const result = await pool.query(`
            SELECT 
                c.id, c.name,
                (SELECT status FROM attendance a WHERE a.convert_id = c.id AND a.attendance_date = $1 AND a.service_type = 'Friday' LIMIT 1) as friday,
                (SELECT status FROM attendance a WHERE a.convert_id = c.id AND a.attendance_date = $1 AND a.service_type = 'Sunday' LIMIT 1) as sunday,
                (SELECT status FROM attendance a WHERE a.convert_id = c.id AND a.attendance_date = $1 AND a.service_type = 'J5' LIMIT 1) as j5,
                (SELECT COUNT(*) FROM attendance a WHERE a.convert_id = c.id AND a.attendance_date = $1 AND a.status = 'Present')::int as services_attended,
                EXISTS (SELECT 1 FROM attendance a WHERE a.convert_id = c.id AND a.attendance_date = $1 AND a.status = 'Present') as attended_any
            FROM converts c
            ORDER BY c.name
        `, [targetDate]);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ GET /attendance-summary error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ====== PING ======
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'ok', 
        time: new Date().toISOString(), 
        message: 'PHID Backend is alive!' 
    });
});

// ====== ROOT - Serve HTML ======
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== LIST FILES IN UPLOADS (Kwa debugging) ======
app.get('/debug/uploads', (req, res) => {
    const uploadsPath = path.join(__dirname, 'uploads');
    try {
        const files = fs.readdirSync(uploadsPath);
        res.json({ 
            uploads_folder: uploadsPath,
            files: files,
            exists: fs.existsSync(path.join(uploadsPath, 'yesu.mp4'))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ====== START SERVER ======
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PHID Backend running on http://localhost:${PORT}`);
    console.log(`📸 Serving static files from /uploads`);
    console.log(`🌐 Serving HTML from /public`);
    console.log(`🔑 Database password: 1234`);
    console.log(`📹 Video: http://localhost:${PORT}/uploads/yesu.mp4`);
    console.log(`🐛 Debug: http://localhost:${PORT}/debug/uploads`);
});

// ====== ERROR HANDLING ======
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err.message);
    console.error(err.stack);
});

process.on('unhandledRejection', (err) => {
    console.error('💥 Unhandled Rejection:', err.message);
    console.error(err.stack);
});