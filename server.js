const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

// ===== ADD =====
const PORT = process.env.PORT || 3000;

const app = express();

// ===== ADD =====
app.set('trust proxy', true);

app.use(cors({ 
    origin: true, 
    credentials: true,
    methods: ['GET','POST','PUT','DELETE','OPTIONS']
}));

app.use(bodyParser.json());

// ===== ADD =====
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ---------- Upload ----------
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, './public/uploads'),
    filename: (_, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ 
    storage,
    limits:{fileSize:10*1024*1024},
    fileFilter:(_,file,cb)=>{
        const ok = /pdf|doc|docx|jpg|png/.test(file.mimetype);
        cb(null,ok);
    }
});

// ---------- DB ----------
const dbConfig = { 
    host: process.env.DB_HOST || 'localhost', 
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASS || '', 
    database: process.env.DB_NAME || 'smart_meeting',
    port: process.env.DB_PORT || 3306,
    connectTimeout: 10000,
    ssl: { rejectUnauthorized: false }
};
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }
});

// ===== ADD AUTO RECONNECT =====
function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(function(err) {
        if (err) {
            console.log('❌ error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000);
        }
    });

    db.on('error', function(err) {
        console.log('❌ db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}
handleDisconnect();
// ===== ADD CHECK ENV =====
console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_USER =", process.env.DB_USER);
console.log("DB_NAME =", process.env.DB_NAME);
console.log("DB_PORT =", process.env.DB_PORT);
// ---------- AUTH ----------
app.post('/api/register', (req, res) => {
    const { username, password, fullname, email } = req.body;

    db.query('SELECT id FROM users WHERE username = ?', [username], (err, rows) => {
        if (err) return res.json({ success: false, message: err.message });
        if (rows.length > 0) return res.json({ success: false, message: 'Username ซ้ำ' });

        db.query(
            'INSERT INTO users (username,password,fullname,email,role) VALUES (?,?,?,?, "user")',
            [username, password, fullname, email],
            err2 => {
                if (err2) return res.json({ success: false, message: err2.message });
                return res.json({ success: true });
            }
        );
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query(
        'SELECT * FROM users WHERE username = ? AND password = ?',
        [username, password],
        (err, rows) => {
            if (err) return res.json({ success: false, message: err.message });
            if (!rows.length) return res.json({ success: false, message: 'รหัสผ่านผิด' });
            return res.json({ success: true, user: rows[0] });
        }
    );
});

app.post('/api/reset-password', (req, res) => {
    const { newPassword, username, email } = req.body;
    db.query(
        'UPDATE users SET password=? WHERE username=? AND email=?',
        [newPassword, username, email],
        (err, r) => {
            if (err) return res.json({ success: false });
            return res.json({ success: r.affectedRows > 0 });
        }
    );
});

// ---------- CORE ----------
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

// ---------- BOOKING + FILE ----------
app.post('/api/book', upload.single('document'), (req, res) => {
    const { userId, roomId, start, topic } = req.body;
    const file = req.file ? req.file.filename : null;

    const s = new Date(start);
    const e = new Date(s.getTime() + 3600000);
    const f = d => d.toISOString().slice(0, 19).replace('T', ' ');

    db.query(
        'INSERT INTO bookings (user_id,room_id,start_time,end_time,topic,status,document) VALUES (?,?,?,?,?, "pending", ?)',
        [userId, roomId, f(s), f(e), topic, file],
        err => {
            if (err) return res.json({ success: false, message: err.message });
            return res.json({ success: true });
        }
    );
});

app.get('/api/bookings', (req, res) => {
    const sql = `
        SELECT b.*, r.name room_name, u.fullname
        FROM bookings b
        LEFT JOIN rooms r ON b.room_id=r.id
        LEFT JOIN users u ON b.user_id=u.id
        ORDER BY b.start_time DESC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/bookings/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE id=?', [req.params.id], err => {
        if (err) return res.json({ success: false });
        return res.json({ success: true });
    });
});

// ---------- AI ----------
app.post('/api/ai/recommend', (req, res) => {
    const { attendees, needProjector } = req.body;
    db.query('SELECT * FROM rooms WHERE status="active"', (err, rooms) => {
        if (err) return res.json([]);
        const ranked = rooms
            .map(r => {
                let score = 0;
                if (r.capacity < attendees) return null;
                score += (attendees / r.capacity) * 50;
                if (needProjector && (r.facilities || '').includes('Projector')) score += 30;
                return { ...r, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score);
        return res.json(ranked);
    });
});

// ---------- ADMIN ----------
app.put('/api/admin/bookings/:id', (req, res) => {
    db.query(
        'UPDATE bookings SET status=? WHERE id=?',
        [req.body.status, req.params.id],
        err => {
            if (err) return res.json({ success: false });
            return res.json({ success: true });
        }
    );
});

app.get('/api/admin/users', (_, res) => {
    db.query('SELECT * FROM users', (err, rows) => {
        if (err) return res.json([]);
        return res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE user_id=?', [req.params.id], err => {
        if (err) return res.json({ success: false });
        db.query('DELETE FROM users WHERE id=?', [req.params.id], err2 => {
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
            if (err) return res.json({ success: false, message: err.message });
            return res.json({ success: true });
        }
    );
});

app.delete('/api/admin/rooms/:id', (req, res) => {
    db.query('DELETE FROM bookings WHERE room_id=?', [req.params.id], err => {
        if (err) return res.json({ success: false });
        db.query('DELETE FROM rooms WHERE id=?', [req.params.id], err2 => {
            if (err2) return res.json({ success: false });
            return res.json({ success: true });
        });
    });
});

// ===== ADD =====
process.on('uncaughtException', err => {
    console.error('❌ Uncaught:', err);
});
process.on('unhandledRejection', err => {
    console.error('❌ Rejection:', err);
});


// ===== FIX FOR RENDER (ADD ONLY) =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
db.connect((err) => {
    if (err) {
        console.error("❌ DB ERROR:", err);
        return;
    }
    console.log('✅ Database Connected');
});
// ✅ IMPORTANT FIX
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server Ready at http://localhost:${PORT}`);
});
