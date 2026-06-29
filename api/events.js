const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

// =========================================================
//   GET ALL EVENTS
// =========================================================
router.get('/events', async (req, res) => {
    try {
        const events = await query(`
            SELECT * FROM events 
            ORDER BY event_date ASC
        `);
        res.json(events);
    } catch (error) {
        console.error('❌ Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// =========================================================
//   GET UPCOMING EVENTS
// =========================================================
router.get('/events/upcoming', async (req, res) => {
    try {
        const events = await query(`
            SELECT * FROM events 
            WHERE event_date >= CURRENT_DATE
            ORDER BY event_date ASC
            LIMIT 10
        `);
        res.json(events);
    } catch (error) {
        console.error('❌ Error fetching upcoming events:', error);
        res.status(500).json({ error: 'Failed to fetch upcoming events' });
    }
});

// =========================================================
//   GET SINGLE EVENT
// =========================================================
router.get('/events/:id', async (req, res) => {
    try {
        const event = await query(`
            SELECT * FROM events WHERE id = $1
        `, [req.params.id]);
        
        if (event.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        res.json(event[0]);
    } catch (error) {
        console.error('❌ Error fetching event:', error);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

// =========================================================
//   POST NEW EVENT
// =========================================================
router.post('/events', async (req, res) => {
    try {
        const { title, description, event_date, event_time, category, is_holiday } = req.body;
        
        if (!title || !event_date) {
            return res.status(400).json({ error: 'Missing required fields: title, event_date' });
        }
        
        const result = await query(`
            INSERT INTO events 
            (title, description, event_date, event_time, category, is_holiday, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
        `, [
            title,
            description || '',
            event_date,
            event_time || null,
            category || 'Nyingine',
            is_holiday || false
        ]);
        
        const newEvent = await query(`
            SELECT * FROM events WHERE id = $1
        `, [result[0].id]);
        
        res.status(201).json(newEvent[0]);
        
    } catch (error) {
        console.error('❌ Error saving event:', error);
        res.status(500).json({ error: 'Failed to save event' });
    }
});

// =========================================================
//   UPDATE EVENT
// =========================================================
router.put('/events/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { title, description, event_date, event_time, category, is_holiday } = req.body;
        
        const existing = await query(`
            SELECT * FROM events WHERE id = $1
        `, [id]);
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        await query(`
            UPDATE events 
            SET title = $1, description = $2, event_date = $3, 
                event_time = $4, category = $5, is_holiday = $6
            WHERE id = $7
        `, [
            title || existing[0].title,
            description || existing[0].description,
            event_date || existing[0].event_date,
            event_time || existing[0].event_time,
            category || existing[0].category,
            is_holiday !== undefined ? is_holiday : existing[0].is_holiday,
            id
        ]);
        
        const updated = await query(`
            SELECT * FROM events WHERE id = $1
        `, [id]);
        
        res.json(updated[0]);
        
    } catch (error) {
        console.error('❌ Error updating event:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
});

// =========================================================
//   DELETE EVENT
// =========================================================
router.delete('/events/:id', async (req, res) => {
    try {
        const id = req.params.id;
        
        const existing = await query(`
            SELECT * FROM events WHERE id = $1
        `, [id]);
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        await query(`DELETE FROM events WHERE id = $1`, [id]);
        
        res.json({ 
            success: true, 
            message: 'Event deleted successfully' 
        });
        
    } catch (error) {
        console.error('❌ Error deleting event:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

module.exports = router;