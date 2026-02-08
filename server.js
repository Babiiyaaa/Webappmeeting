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
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ---------- Upload Setup ----------
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, './public/uploads'),
    filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// ---------- Database Connection (Aiven Cloud / Online) ----------
const db = mysql.createPool({
    host: process.env.DB_HOST || 'mysql-2243ea6c-smartmeeting.j.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || 'smart_meeting',
    port: process.env.DB_PORT || 28535,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
});

// Test Connection
db.getConnection((err, conn) => {
    if (err) console.error('❌ DB Connect Error:', err.message);
    else {
        console.log('✅ Connected to Aiven Cloud Database');
        conn.release();
    }
});

// ---------- AUTH APIs ----------

// 1. Register
app.post('/api/register', (req, res) => {
    const { username, password, fullname, email } = req.body;

    db.query('SELECT id FROM users WHERE username = ?', [username], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (rows.length > 0) return res.json({ success: false, message: 'Username นี้ถูกใช้แล้ว' });

        const sql = 'INSERT INTO users (username, password, fullname, email, role) VALUES (?, ?, ?, ?, ?)';
        db.query(sql, [username, password, fullname, email, 'user'], (err2) => {
            if (err2) return res.json({ success: false, message: err2.message });
            return res.json({ success: true });
        });
    });
});

// 2. Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (rows.length === 0) return res.json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        return res.json({ success: true, user: rows[0] });
    });
});

// 3. Forgot Password (Validate User)
app.post('/api/forgot-password', (req, res) => {
    const { username, email } = req.body;
    db.query('SELECT id FROM users WHERE username = ? AND email = ?', [username, email], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (rows.length === 0) return res.json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้ที่ตรงกัน' });
        return res.json({ success: true, userId: rows[0].id });
    });
});

// 4. Reset Password
app.post('/api/reset-password', (req, res) => {
    const { userId, newPassword } = req.body;
    db.query('UPDATE users SET password = ? WHERE id = ?', [newPassword, userId], (err) => {
        if (err) return res.json({ success: false, message: err.message });
        return res.json({ success: true });
    });
});

// ---------- USER APIs ----------

// 5. Update Profile
app.put('/api/profile', upload.single('avatar'), (req, res) => {
    const { id, fullname, email, password } = req.body;
    let sql = 'UPDATE users SET fullname = ?, email = ?';
    let params = [fullname, email];

    if (password) {
        sql += ', password = ?';
        params.push(password);
    }

    if (req.file) {
        sql += ', avatar = ?';
        params.push(req.file.filename);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    db.query(sql, params, (err) => {
        if (err) return res.json({ success: false, message: err.message });
        // Return updated user data
        db.query('SELECT * FROM users WHERE id = ?', [id], (err2, rows) => {
             if (err2) return res.json({ success: false });
             return res.json({ success: true, user: rows[0] });
        });
    });
});

// ---------- BOOKING APIs ----------

app.post('/api/book', upload.single('document'), (req, res) => {
    const { userId, roomId, start, topic, equipment } = req.body;
    const file = req.file ? req.file.filename : null;

    const s = new Date(start);
    const e = new Date(s.getTime() + 3600000); // +1 Hour default
    const formatDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

    const sql = `
        INSERT INTO bookings (user_id, room_id, start_time, end_time, topic, status, document, equipment) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
        userId, 
        roomId, 
        formatDate(s), 
        formatDate(e), 
        topic, 
        'pending',
        file,
        equipment || ''
    ];

    db.query(sql, params, (err) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: err.message });
        }
        return res.json({ success: true });
    });
});

app.get('/api/bookings', (req, res) => {
    const sql = `
        SELECT b.*, r.name as room_name, u.fullname 
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
    db.query('DELETE FROM bookings WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

// ---------- ADMIN APIs ----------

app.put('/api/admin/bookings/:id', (req, res) => {
    db.query('UPDATE bookings SET status = ? WHERE id = ?', [req.body.status, req.params.id], (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.get('/api/admin/users', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id DESC', (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    const userId = req.params.id;
    db.query('DELETE FROM bookings WHERE user_id = ?', [userId], (err) => {
        if (err) return res.json({ success: false });
        db.query('DELETE FROM users WHERE id = ?', [userId], (err2) => {
            if (err2) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

app.get('/api/admin/rooms', (_, res) => {
    db.query('SELECT * FROM rooms', (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.post('/api/admin/rooms', (req, res) => {
    db.query('INSERT INTO rooms SET ?', req.body, (err) => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

app.delete('/api/admin/rooms/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE room_id = ?', [req.params.id], (err) => {
        if (err) return res.json({ success: false });
        db.query('DELETE FROM rooms WHERE id = ?', [req.params.id], (err2) => {
            if (err2) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
