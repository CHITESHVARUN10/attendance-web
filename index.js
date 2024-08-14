const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2');
dotenv.config();
const { v4: uuidv4 } = require('uuid');

const app = express();
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: "",
    database: "sql12718865",
    port: process.env.DB_PORT 
   
});


// Predefined admin credentials
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASS;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const sessionStore = new MySQLStore({}, db.promise());

app.use(session({ secret: 'your-secret-key', resave: false, saveUninitialized: false, store: sessionStore }));
app.use(passport.initialize());
app.use(passport.session());
app.use(cors());
app.use('/admin', require('./routes/admin'));
app.use('/geo', require('./routes/geo'));
app.use(express.static('public'));

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the MySQL database');
});

passport.use('user-local', new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password'
    },
    (email, password, done) => {
        const query = 'SELECT * FROM users WHERE email = ?';
        db.query(query, [email], (err, results) => {
            if (err) return done(err);
            if (results.length === 0) return done(null, false, { message: 'Incorrect email.' });

            const user = results[0];
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) return done(err);
                if (isMatch) {
                    return done(null, user);
                } else {
                    return done(null, false, { message: 'Incorrect password.' });
                }
            });
        });
    }
));

passport.use('admin-local', new LocalStrategy(
    {
        usernameField: 'email',
        passwordField: 'password'
    },
    (email, password, done) => {
        if (email === adminEmail && password === adminPassword) {
            return done(null, { id: 1, email: adminEmail, type: 'admin' });
        } else {
            return done(null, false, { message: 'Incorrect admin credentials.' });
        }
    }
));

passport.serializeUser((user, done) => {
    done(null, { id: user.id, type: user.type || 'user' });
});

passport.deserializeUser((obj, done) => {
    if (obj.type === 'admin') {
        done(null, { id: obj.id, email: adminEmail, type: 'admin' });
    } else {
        const query = 'SELECT * FROM users WHERE id = ?';
        db.query(query, [obj.id], (err, results) => {
            if (err) return done(err);
            done(null, results[0]);
        });
    }
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.type === 'admin') {
        return next();
    }
    res.redirect('/admin/login');
}

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/', (req, res) => {
    res.render('cover');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/home', isAuthenticated, (req, res) => {
    const admin = req.user.type === 'admin';
    const onlineUsersQuery = "SELECT COUNT(DISTINCT userid) as count FROM attendance WHERE status = 'online'";
    const offlineUsersQuery = "SELECT COUNT(DISTINCT userid) as count FROM attendance WHERE status = 'offline'";

    try {
        db.query(onlineUsersQuery, (err, onlineUsersResults) => {
            if (err) {
                console.error('Error fetching online users:', err);
                res.status(500).send('Server Error');
                return;
            }
            const onlineUsers = onlineUsersResults[0].count;

            db.query(offlineUsersQuery, (err, offUsersResults) => {
                if (err) {
                    console.error('Error fetching online users:', err);
                    res.status(500).send('Server Error');
                    return;
                }
                const offlineUsers = offUsersResults[0].count;

                res.render('home', { admin, offlineUsers, onlineUsers });
            });
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('Server Error');
    }
});
async function idmake(table, column) {
    let id = uuidv4();
    const query = `SELECT * FROM ${table} WHERE ${column} = ?`;

    return new Promise((resolve, reject) => {
        db.query(query, [id], (err, rows) => {
            if (err) {
                console.error('Error executing query:', err);
                return reject(err);  // Reject the promise if there's an error
            }

            if (rows.length === 0) {
                return resolve(id);  // Resolve the promise with the unique ID
            } else {
                // Recursively call idmake until a unique ID is found
                idmake(table, column).then(resolve).catch(reject);
            }
        });
    });
}

  
app.post('/signup', async (req, res) => {
    let ide= await idmake("users","id")
console.log(ide);
    const { username, eid, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)';
        db.query(query, [ide, username, email, hashedPassword], (err, results) => {
            if (err) {
                console.error('Error executing query:', err);
                res.status(500).send('Server Error');
                return;
            }
            console.log(results);
            res.redirect('/admin/users');
        });
    } catch (err) {
        console.error('Error hashing password:', err);
        res.status(500).send('Server Error');
    }
});

app.post('/login', (req, res, next) => {
    console.log(req.body);
    passport.authenticate('user-local', (err, user, info) => {
        if (err) {
            console.error('Authentication error:', err);
            return next(err);
        }
        if (!user) {
            console.log('Authentication failed:', info.message);
            return res.redirect('/login');
        }
        req.logIn(user, (err) => {
            if (err) {
                console.error('Login error:', err);
                return next(err);
            }
            console.log('Authentication successful, redirecting to home');
            return res.redirect('/home');
        });
    })(req, res, next);
});

app.post('/admin-login', passport.authenticate('admin-local', {
    successRedirect: '/admin/dashboard',
    failureRedirect: '/admin/login'
}));

app.post('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Error logging out:', err);
            res.status(500).send('Server Error');
            return;
        }
        res.redirect('/');
    });
});

process.on('SIGINT', () => {
    db.end((err) => {
        if (err) {
            console.error('Error closing the database connection:', err);
        }
        console.log('Database connection closed');
        process.exit();
    });
});

app.get('/users', (req, res) => {
    
    const q = "SELECT * FROM attendance;";
    const ad = new Date();
    const indiaTime = new Date(ad.getTime() + (330 * 60000));
    const year = indiaTime.getFullYear();
    const month = indiaTime.getMonth() + 1;
    const day = indiaTime.getDate();
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    console.log(formattedDate);

    try {
        db.query(q, (err, results) => {
            if (err) {
                res.send("Error: " + err);
            }
            res.json(results);
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        res.status(500).send('Server Error');
    }
});



const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
