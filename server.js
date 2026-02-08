const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

// Config
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

// Upload Setup
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, './public/uploads'),
    filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ 
    storage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limit 10MB
});

// ==========================================
// 🔵 เชื่อมต่อ Cloud Database (Aiven) ข้อมูลเดิมจะกลับมา
// ==========================================
const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-2243ea6c-smartmeeting.j.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || 'smart_meeting',
    port: process.env.DB_PORT || 28535,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }, // จำเป็นสำหรับ Aiven
    timezone: '+07:00'
});

db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Cloud DB Connection Failed:', err.message);
    } else {
        console.log('✅ Cloud DB Connected Successfully (ข้อมูลเก่ากลับมาแล้ว)');
        connection.release();
    }
});

// ================= API ROUTES =================

// --- 1. AUTHENTICATION ---

app.post('/api/register', (req, res) => {
    const { username, password, fullname, email } = req.body;
    db.query('SELECT id FROM users WHERE username = ?', [username], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (rows.length > 0) return res.json({ success: false, message: 'Username นี้ถูกใช้แล้ว' });

        // ✅ FIX: ใส่ default.png ให้ avatar เสมอ
        db.query(
            'INSERT INTO users (username,password,fullname,email,role,avatar) VALUES (?,?,?,?, "user", "default.png")',
            [username, password, fullname, email],
            err2 => {
                if (err2) {
                    console.error("Register Error:", err2);
                    return res.status(500).json({ success: false, message: 'Register Error: ' + err2.message });
                }
                return res.json({ success: true });
            }
        );
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'DB Error: ' + err.message });
        if (!rows.length) return res.json({ success: false, message: 'รหัสผ่านผิด' });
        return res.json({ success: true, user: rows[0] });
    });
});

app.post('/api/reset-password', (req, res) => {
    const { newPassword, username, email } = req.body;
    db.query(
        'UPDATE users SET password=? WHERE username=? AND email=?',
        [newPassword, username, email],
        (err, r) => {
            if (err) return res.json({ success: false });
            if (r.affectedRows === 0) return res.json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้หรืออีเมลไม่ถูกต้อง' });
            return res.json({ success: true });
        }
    );
});

// --- 2. USER PROFILE ---

app.post('/api/profile', upload.single('avatar'), (req, res) => {
    const { id, fullname, password } = req.body;
    let sql = 'UPDATE users SET fullname=?, password=?';
    let params = [fullname, password];

    if (req.file) {
        sql += ', avatar=?';
        params.push(req.file.filename);
    }
    sql += ' WHERE id=?';
    params.push(id);

    db.query(sql, params, err => {
        if (err) return res.json({ success: false, message: err.message });
        db.query('SELECT * FROM users WHERE id=?', [id], (e, r) => {
            if (e) return res.json({ success: false });
            return res.json({ success: true, user: r[0] });
        });
    });
});

// --- 3. BOOKINGS ---

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

// Helper: Format Date for SQL (Fixes Booking Issue)
function toLocalSQLString(date) {
    const pad = n => n < 10 ? '0' + n : n;
    return date.getFullYear() + '-' + 
           pad(date.getMonth() + 1) + '-' + 
           pad(date.getDate()) + ' ' + 
           pad(date.getHours()) + ':' + 
           pad(date.getMinutes()) + ':' + 
           pad(date.getSeconds());
}

app.post('/api/book', upload.single('document'), (req, res) => {
    const { userId, roomId, start, topic, people, equipment } = req.body; 
    const file = req.file ? req.file.filename : null;

    // ✅ FIX: Date Calculation & Formatting
    const startDate = new Date(start); 
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000)); // +2 Hours

    const startSQL = toLocalSQLString(startDate);
    const endSQL = toLocalSQLString(endDate);

    db.query(
        'INSERT INTO bookings (user_id, room_id, start_time, end_time, topic, status, document, attendees, equipment) VALUES (?,?,?,?,?, "pending", ?, ?, ?)',
        [userId, roomId, startSQL, endSQL, topic, file, people || 5, equipment || ''],
        err => {
            if (err) {
                console.error("Booking Error:", err);
                return res.status(500).json({ success: false, message: err.message });
            }
            return res.json({ success: true });
        }
    );
});

app.delete('/api/bookings/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE id=?', [req.params.id], err => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

// --- 4. ADMIN & MANAGEMENT ---

app.put('/api/admin/bookings/:id', (req, res) => {
    db.query('UPDATE bookings SET status=? WHERE id=?', [req.body.status, req.params.id], err => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.get('/api/admin/rooms', (req, res) => {
    db.query('SELECT * FROM rooms', (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.post('/api/admin/rooms', (req, res) => {
    db.query('INSERT INTO rooms SET ?', req.body, err => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.put('/api/admin/rooms/:id', (req, res) => {
    const { name, capacity, facilities } = req.body;
    db.query(
        'UPDATE rooms SET name=?, capacity=?, facilities=? WHERE id=?',
        [name, capacity, facilities, req.params.id],
        err => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
});

app.delete('/api/admin/rooms/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE room_id=?', [req.params.id], () => {
        db.query('DELETE FROM rooms WHERE id=?', [req.params.id], err => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

app.get('/api/admin/users', (req, res) => {
    db.query('SELECT * FROM users', (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE user_id=?', [req.params.id], () => {
        db.query('DELETE FROM users WHERE id=?', [req.params.id], err => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

// --- SERVER START ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
