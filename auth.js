import session from 'express-session';
import SQLiteStore from 'connect-sqlite3';
import { authenticateUser, createUser } from './db.js';

const SQLiteStoreSession = SQLiteStore(session);

// Session configuration
export const sessionConfig = {
    store: new SQLiteStoreSession({
        db: 'sessions.db',
        dir: './logs'
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
};

// Authentication middleware
export const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Login handler
export const handleLogin = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await authenticateUser(email, password);
        if (user) {
            req.session.userId = user.id;
            res.redirect('/dashboard');
        } else {
            res.render('login', { error: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred during login' });
    }
};

// Register handler
export const handleRegister = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const success = await createUser(email, password);
        if (success) {
            res.redirect('/login?registered=true');
        } else {
            res.render('register', { error: 'This email is already registered' });
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', { error: 'An error occurred during registration' });
    }
};

// Logout handler
export const handleLogout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
}; 