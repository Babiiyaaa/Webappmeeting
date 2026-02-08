const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const app = express();

app.set('trust proxy', true);
app.use(cors({ 
    origin: true, 
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Upload Config
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, './public/uploads'),
    filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_, file, cb) => {
        const ok = /pdf|doc|docx|jpg|jpeg|png/.test(file.mimetype);
        cb(null, ok);
    }
});

// Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-2243ea6c-smartmeeting.j.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || 'smart_meeting',
    port: process.env.DB_PORT || 28535,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false },
    timezone: '+07:00'
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Connect Error:', err.message);
    } else {
        console.log('✅ Database Connected Successfully');
        connection.release();
    }
});

// Helper: Format Date for MySQL (YYYY-MM-DD HH:mm:ss) - Local Time
function toLocalSQLString(dateObj) {
    const pad = n => n < 10 ? '0' + n : n;
    return dateObj.getFullYear() + '-' + 
           pad(dateObj.getMonth() + 1) + '-' + 
           pad(dateObj.getDate()) + ' ' + 
           pad(dateObj.getHours()) + ':' + 
           pad(dateObj.getMinutes()) + ':' + 
           pad(dateObj.getSeconds());
}

// ================= API ROUTES =================

// 1. REGISTER (แก้บั๊ก "Unknown column 'user'")
app.post('/api/register', (req, res) => {
    const { username, password, fullname, email } = req.body;
    
    // Check Duplicate
    db.query('SELECT id FROM users WHERE username = ?', [username], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (rows.length > 0) return res.json({ success: false, message: 'Username นี้ถูกใช้แล้ว' });

        // Insert (ใช้ Single Quote 'user', 'default.png')
        const sql = "INSERT INTO users (username, password, fullname, email, role, avatar) VALUES (?, ?, ?, ?, 'user', 'default.png')";
        db.query(sql, [username, password, fullname, email], (err2) => {
            if (err2) {
                console.error("Register Error:", err2);
                return res.json({ success: false, message: 'DB Insert Error: ' + err2.message });
            }
            return res.json({ success: true });
        });
    });
});

// 2. LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (!rows.length) return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านผิด' });
        return res.json({ success: true, user: rows[0] });
    });
});

// 3. BOOKING (แก้บั๊ก "Unknown column 'pending'" และเวลาเพี้ยน)
app.post('/api/book', upload.single('document'), (req, res) => {
    const { userId, roomId, start, topic, people, equipment, duration } = req.body;
    const file = req.file ? req.file.filename : null;

    // คำนวณเวลา (ใช้เวลา Local ไม่ใช้ UTC)
    const startDate = new Date(start);
    const hoursToAdd = parseInt(duration || 2);
    const endDate = new Date(startDate.getTime() + (hoursToAdd * 60 * 60 * 1000));

    const startSQL = toLocalSQLString(startDate);
    const endSQL = toLocalSQLString(endDate);

    const sql = `
        INSERT INTO bookings 
        (user_id, room_id, start_time, end_time, topic, status, document, attendees, equipment) 
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `;

    db.query(sql, [userId, roomId, startSQL, endSQL, topic, file, people || 0, equipment || ''], (err) => {
        if (err) {
            console.error("Booking Error:", err);
            return res.json({ success: false, message: err.message });
        }
        return res.json({ success: true });
    });
});

app.get('/api/bookings', (req, res) => {
    const sql = `
        SELECT b.*, r.name as room_name, u.fullname, u.avatar 
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id = r.id
        LEFT JOIN users u ON b.user_id = u.id
        ORDER BY b.start_time DESC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/bookings/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE id=?', [req.params.id], (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

// 4. ADMIN & OTHERS
app.put('/api/admin/bookings/:id', (req, res) => {
    db.query("UPDATE bookings SET status=? WHERE id=?", [req.body.status, req.params.id], (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.get('/api/admin/rooms', (req, res) => {
    db.query("SELECT * FROM rooms", (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.post('/api/admin/rooms', (req, res) => {
    db.query("INSERT INTO rooms SET ?", req.body, (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.put('/api/admin/rooms/:id', (req, res) => {
    const { name, capacity, facilities } = req.body;
    db.query("UPDATE rooms SET name=?, capacity=?, facilities=? WHERE id=?", 
        [name, capacity, facilities, req.params.id], 
        (err) => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
    });
});

app.delete('/api/admin/rooms/:id', (req, res) => {
    db.query("DELETE FROM bookings WHERE room_id=?", [req.params.id], () => {
        db.query("DELETE FROM rooms WHERE id=?", [req.params.id], (err) => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

app.get('/api/admin/users', (req, res) => {
    db.query("SELECT * FROM users", (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.query("DELETE FROM bookings WHERE user_id=?", [req.params.id], () => {
        db.query("DELETE FROM users WHERE id=?", [req.params.id], (err) => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

app.post('/api/profile', upload.single('avatar'), (req, res) => {
    const { id, fullname, password } = req.body;
    let sql = "UPDATE users SET fullname=?, password=?";
    let params = [fullname, password];

    if (req.file) {
        sql += ", avatar=?";
        params.push(req.file.filename);
    }
    sql += " WHERE id=?";
    params.push(id);

    db.query(sql, params, (err) => {
        if (err) return res.json({ success: false, message: err.message });
        db.query("SELECT * FROM users WHERE id=?", [id], (e, r) => {
            return res.json({ success: true, user: r[0] });
        });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { newPassword, username, email } = req.body;
    db.query("UPDATE users SET password=? WHERE username=? AND email=?", [newPassword, username, email], (err, r) => {
        if (err) return res.json({ success: false });
        return res.json({ success: r.affectedRows > 0 });
    });
});

// START SERVER
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Running on Port ${PORT}`);
});
