require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); // Frontend yahi se serve hoga

const server = http.createServer(app);
const io = new Server(server);

// Database Connection (Aiven se judega)
const db = mysql.createPool(process.env.DATABASE_URL);

// Memory mein scores rakhenge (DB bachane ke liye)
let cityScores = {}; 

// Database se initial scores load karna
function loadScores() {
    db.query('SELECT city_name, total_taps FROM leaderboard', (err, results) => {
        if (err) {
            console.error("DB Load Error:", err);
            return;
        }
        results.forEach(row => {
            cityScores[row.city_name] = row.total_taps;
        });
        console.log("Scores loaded form DB:", cityScores);
    });
}
loadScores();

// Socket.io Connection (Jab user site kholega)
io.on('connection', (socket) => {
    console.log('New player connected');

    // Naye bande ko current score bhejo
    socket.emit('updateLeaderboard', cityScores);

    // Jab user TAP karega
    socket.on('tap', (cityName) => {
        if (!cityScores[cityName]) {
            cityScores[cityName] = 0;
        }
        cityScores[cityName]++; // Memory mein badhao
        
        // Sabko naya score dikhao (Real-time)
        io.emit('updateLeaderboard', cityScores);
    });
});

// MAGIC TRICK: Har 5 second mein DB update karo (Batching)
setInterval(() => {
    console.log("Syncing to Database...");
    for (const [city, score] of Object.entries(cityScores)) {
        const query = `INSERT INTO leaderboard (city_name, total_taps) VALUES (?, ?) ON DUPLICATE KEY UPDATE total_taps = ?`;
        db.query(query, [city, score, score], (err) => {
            if (err) console.error("Sync Error:", err);
        });
    }
}, 5000); // 5000ms = 5 seconds

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
