const express = require('express');
const router = express.Router();
const geolib = require('geolib');
const mysql = require('mysql2');
const axios=require("axios")
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: "",
    database: "sql12718865",
    port: process.env.DB_PORT 
   
});

router.post('/data', async (req, res) => {
    try {
        const userLocation = req.body;
        const userId = req.user.id;

        // Fetch geofences
        const response = await axios.post('http://localhost:3000/admin-o/curr-geos');
        const geofences = response.data;

        // Find the closest geofence
        let closestGeofence = null;
        let minDistance = Infinity;

        geofences.forEach(geofence => {
            const distance = geolib.getDistance(
                { latitude: userLocation.latitude, longitude: userLocation.longitude },
                { latitude: geofence.latitude, longitude: geofence.longitude }
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestGeofence = geofence;
            }
        });

        if (!closestGeofence) {
            return res.status(404).json({ message: 'No geofence found' });
        }

        const t = new Date();
        const currentHour = t.getHours();
        const startHour = 9;
        const endHour = 17;

        const ad = new Date();
        const indiaTime = new Date(ad.getTime() + (330 * 60000));
        const year = indiaTime.getFullYear();
        const month = indiaTime.getMonth() + 1;
        const day = indiaTime.getDate();
        const ourdate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const currentTime = `${hours}:${minutes}:${seconds}`;

        let acc = (currentHour >= startHour && currentHour < endHour) ? "present" : "absent";

        if (minDistance <= closestGeofence.radius) {
            console.log('Inside closest geofence');
            db.query('SELECT * FROM attendance WHERE userid = ? AND date = ?', [userId, ourdate], (err, results) => {
                if (err) {
                    console.error('Error executing query:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                if (results.length === 0) {
                    db.query('INSERT INTO attendance (userid, status, date, signin_time, accounted_for) VALUES (?, ?, ?, ?, ?)', 
                    [userId, 'online', ourdate, currentTime, acc], (err, results) => {
                        if (err) {
                            console.error('Error executing query:', err);
                            return res.status(500).json({ message: 'Server error' });
                        }
                        res.json({ message: 'Inside closest geofence, attendance recorded' });
                    });
                } else {
                    db.query('UPDATE attendance SET status = ?, signout_time = NULL WHERE userid = ? AND date = ?', 
                    ['online', userId, ourdate], (err, results) => {
                        if (err) {
                            console.error('Error executing query:', err);
                            return res.status(500).json({ message: 'Server error' });
                        }
                        res.json({ message: 'Inside closest geofence, status updated' });
                    });
                }
            });
        } else {
            console.log('Outside closest geofence');
            db.query('UPDATE attendance SET status = ?, signout_time = ? WHERE userid = ? AND date = ?', 
            ['offline', currentTime, userId, ourdate], (err, results) => {
                if (err) {
                    console.error('Error executing query:', err);
                    return res.status(500).json({ message: 'Server error' });
                }
                res.json({ message: 'Outside closest geofence, status updated' });
            });
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
module.exports = router;
