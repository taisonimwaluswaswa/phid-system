const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const { query } = require('../config/database');

// ===== MULTER - INARUHUSU PICHA NA VIDEO =====
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// =========================================================
//   GET ALL MISSIONS
// =========================================================
router.get('/missions', async (req, res) => {
    try {
        const missions = await query(`
            SELECT id, name, lat, lng, city, date, people_reached, 
                   description, image_base64, image_type, video_base64, video_type, created_at 
            FROM missions 
            ORDER BY created_at DESC
        `);
        res.json(missions);
    } catch (error) {
        console.error('Error fetching missions:', error);
        res.status(500).json({ error: 'Failed to fetch missions' });
    }
});

// =========================================================
//   POST NEW MISSION - KUKUBALI PICHA NA VIDEO
// =========================================================
router.post('/missions', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('📥 ===== POST /missions =====');
        console.log('📥 Body keys:', Object.keys(req.body));
        console.log('📥 Files:', req.files);
        
        const { name, lat, lng, date, people, description, city } = req.body;
        
        if (!name || !lat || !lng || !date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // ===== PICHA =====
        let imageBase64 = null;
        let imageType = null;
        if (req.files && req.files.image && req.files.image[0]) {
            imageBase64 = req.files.image[0].buffer.toString('base64');
            imageType = req.files.image[0].mimetype;
            console.log('📸 Image size:', req.files.image[0].size, 'bytes');
        }
        
        // ===== VIDEO =====
        let videoBase64 = null;
        let videoType = null;
        if (req.files && req.files.video && req.files.video[0]) {
            videoBase64 = req.files.video[0].buffer.toString('base64');
            videoType = req.files.video[0].mimetype;
            console.log('🎥 Video size:', req.files.video[0].size, 'bytes');
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
        
        console.log('✅ Saved with ID:', result[0].id);
        console.log('📸 Image saved:', imageBase64 ? 'YES' : 'NO');
        console.log('🎥 Video saved:', videoBase64 ? 'YES' : 'NO');
        
        const newMission = await query(`
            SELECT * FROM missions WHERE id = $1
        `, [result[0].id]);
        
        res.status(201).json({
            success: true,
            data: newMission[0],
            message: 'Mission saved successfully'
        });
        
    } catch (error) {
        console.error('❌ ERROR:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;