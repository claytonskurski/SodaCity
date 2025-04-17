const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
console.log('Environment loaded successfully');

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const eventRoutes = require('./routes/eventRoutes');
const submitEvent = require('./routes/submitEvent');
const forumRoutes = require('./routes/forumRoutes');
const contactRoutes = require('./routes/contactRoutes');
const galleryRoutes = require('./routes/gallery');
const authMiddleware = require('./middleware/authMiddleware');
const cron = require('node-cron');
const User = require('./models/user');
const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_API_KEY);
const expressLayouts = require('express-ejs-layouts');
const fs = require('fs');
const moment = require('moment-timezone');

const app = express();

// Set moment as a global variable for all templates
app.locals.moment = moment;

// Ensure Express recognizes HTTPS behind a proxy
app.set('trust proxy', 1);

// CORS headers middleware
app.use((req, res, next) => {
    const allowedOrigins = ['https://sodacityoutdoors.com', 'http://localhost:3000'];
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Validate environment variables
if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not defined in the environment variables');
    process.exit(1);
}

if (!process.env.SESSION_SECRET) {
    console.warn('SESSION_SECRET not defined, using fallback secret');
}

if (!process.env.STRIPE_API_KEY) {
    console.error('STRIPE_API_KEY is not defined in the environment variables');
    process.exit(1);
}

// Session configuration with connect-mongo
let sessionStore;
try {
    sessionStore = MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    });
    console.log('MongoStore initialized successfully');
} catch (error) {
    console.error('Error initializing MongoStore:', error);
    process.exit(1);
}

app.use(session({
    secret: process.env.SESSION_SECRET || '9ae0cb8c445e7320568f23ae9a4ce36b5f470a14a3801d0d7ade841ae9b49695',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        secure: 'auto',
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Middleware to debug session data and cookies
app.use((req, res, next) => {
    console.log('Request URL:', req.url);
    console.log('Protocol:', req.protocol);
    console.log('X-Forwarded-Proto:', req.get('X-Forwarded-Proto'));
    console.log('Secure:', req.secure);
    console.log('Session ID:', req.sessionID);
    console.log('Session data:', req.session);
    console.log('Cookies:', req.headers.cookie || 'No cookies');
    res.locals.user = req.session.user || null;
    console.log('Middleware - req.session.user:', req.session.user);
    console.log('Middleware - req.session.userData:', req.session.userData);

    const originalJson = res.json;
    res.json = function (body) {
        console.log('Set-Cookie header:', res.get('Set-Cookie') || 'No Set-Cookie header');
        return originalJson.call(this, body);
    };

    next();
});

// Set up EJS as the view engine with layouts
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');

// Debugging static file requests
app.use((req, res, next) => {
    if (req.url.startsWith('/static/')) {
        console.log(`Serving static file: ${req.url}`);
    }
    next();
});

// Serve static files from 'public_html'
app.use('/static', express.static(path.join(__dirname, 'public_html')));

// Copy moment.min.js from node_modules to public_html/js with error handling
const momentPath = path.join(__dirname, 'node_modules', 'moment', 'min', 'moment.min.js');
const publicHtmlJsPath = path.join(__dirname, 'public_html', 'js');
if (!fs.existsSync(publicHtmlJsPath)) {
    fs.mkdirSync(publicHtmlJsPath);
}
const destMomentPath = path.join(publicHtmlJsPath, 'moment.min.js');
if (!fs.existsSync(destMomentPath)) {
    try {
        if (fs.existsSync(momentPath)) {
            fs.copyFileSync(momentPath, destMomentPath);
            console.log('Copied moment.min.js to /public_html/js/');
        } else {
            console.warn('moment.min.js not found in node_modules/moment/min/. Please run "npm install moment@2.29.4" and restart the server.');
        }
    } catch (error) {
        console.error('Error copying moment.min.js:', error.message);
    }
}

// Connect to MongoDB
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB Atlas:', error);
        process.exit(1);
    });

// Routes
app.use((req, res, next) => {
    console.log('Incoming request:', {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        body: req.body
    });
    next();
});

app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Soda City Outdoors',
        user: req.session.user 
    });
});

app.use('/api/users', userRoutes);
app.use('/', paymentRoutes);
app.use('/events', eventRoutes);
app.use('/submit_event', submitEvent);
app.use('/forum', forumRoutes);
app.use('/contact', contactRoutes);
app.use('/gallery', galleryRoutes);

// Redirect /calendar to /events/calendar
app.get('/calendar', (req, res) => {
    res.redirect('/events/calendar');
});

// Test route for debugging
app.get('/test-events', async (req, res) => {
    const Event = require('./models/events');
    try {
        const events = await Event.find();
        res.json(events);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

// Protected route
app.use('/api/protected-route', authMiddleware, (req, res) => {
    res.send('This is a protected route.');
});

// Serve EJS pages
app.get('/signin', (req, res) => {
    const redirectUrl = req.query.redirect || '/';
    res.render('signin', { title: 'Sign In', user: req.session.user, redirectUrl });
});

app.get('/signup', (req, res) => {
    res.render('signup', { title: 'Sign Up', user: req.session.user });
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Create Account', user: req.session.user });
});

app.get('/payment', (req, res) => {
    res.render('payment', { title: 'Payment', user: req.session.user, stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Resources page route
app.get('/resources', (req, res) => {
    res.render('resources', { title: 'Resources', user: req.session.user });
});

app.get('/about', (req, res) => {
    res.render('about', { title: 'About Us', user: req.session.user });
});

// Contact form submission
app.post('/contact/submit', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        // TODO: Add email sending functionality
        // For now, just return success
        res.json({ success: true });
    } catch (error) {
        console.error('Error processing contact form:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Account Page
app.get('/account', authMiddleware, async (req, res) => {
    console.log('Reached /account route');
    console.log('req.session.user in /account:', req.session.user);
    try {
        if (!req.session.user) {
            console.log('No user in session, redirecting to signin');
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        console.log('Fetching user with ID:', userId);
        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found in database:', userId);
            return res.status(404).render('404', { title: 'Not Found', message: 'User not found', user: null });
        }
        console.log('Rendering account page for user:', user.username);
        res.render('account', { title: 'My Account', user });
    } catch (error) {
        console.error('Error loading account page:', error);
        res.status(500).render('account', { title: 'My Account', user: req.session.user || null, error: 'Failed to load account details' });
    }
});

// Update Profile
app.post('/account/update-profile', authMiddleware, async (req, res) => {
    try {
        if (!req.session.user) {
            console.log('No user in session, redirecting to signin');
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        const { username, firstName, lastName, email, phone } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found in database:', userId);
            return res.status(404).render('404', { title: 'Not Found', message: 'User not found', user: null });
        }

        // Check if the new username or email is already taken by another user
        const existingUser = await User.findOne({
            $or: [
                { username, _id: { $ne: userId } },
                { email, _id: { $ne: userId } }
            ]
        });
        if (existingUser) {
            return res.render('account', { title: 'My Account', user, error: 'Username or email already in use' });
        }

        // Update user fields
        user.username = username;
        user.firstName = firstName;
        user.lastName = lastName;
        user.email = email;
        user.phone = phone;

        await user.save();

        // Update session with new user data
        req.session.user = {
            _id: user._id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            subscriptionStatus: user.subscriptionStatus,
            paidForCurrentMonth: user.paidForCurrentMonth
        };

        req.session.save((err) => {
            if (err) {
                console.error('Error saving session during profile update:', err);
                return res.status(500).render('account', { title: 'My Account', user, error: 'Error saving session' });
            }
            console.log('Profile updated and session saved for user:', user.username);
            res.render('account', { title: 'My Account', user, success: 'Profile updated successfully' });
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).render('account', { title: 'My Account', user: req.session.user || null, error: 'Failed to update profile' });
    }
});

// Change Password
app.post('/account/change-password', authMiddleware, async (req, res) => {
    try {
        if (!req.session.user) {
            console.log('No user in session, redirecting to signin');
            return res.redirect('/signin');
        }

        const userId = req.session.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            console.log('User not found in database:', userId);
            return res.status(404).render('404', { title: 'Not Found', message: 'User not found', user: null });
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.render('account', { title: 'My Account', user, error: 'Current password is incorrect' });
        }

        // Check if new password matches confirm password
        if (newPassword !== confirmPassword) {
            return res.render('account', { title: 'My Account', user, error: 'New password and confirm password do not match' });
        }

        // Update password (this will trigger the pre('save') middleware to hash the new password)
        user.password = newPassword;
        await user.save();

        res.render('account', { title: 'My Account', user, success: 'Password changed successfully' });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).render('account', { title: 'My Account', user: req.session.user || null, error: 'Failed to change password' });
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session during logout:', err);
            return res.status(500).json({ message: 'Error logging out' });
        }
        console.log('Session destroyed, user logged out');
        res.redirect('/');
    });
});

// Cron job to check subscription statuses at the start of each month (1st day at 00:00)
cron.schedule('0 0 1 * *', async () => {
    console.log('Running monthly subscription status check...');
    const users = await User.find();
    for (const user of users) {
        if (user.stripeCustomerId && user.membership === 'monthly') {
            try {
                const subscriptions = await stripe.subscriptions.list({ customer: user.stripeCustomerId });
                let newStatus = 'inactive';
                let paidForCurrentMonth = false;

                if (subscriptions.data.length > 0) {
                    const subscription = subscriptions.data[0];
                    // Check if the subscription has a 100% discount
                    if (subscription.discount && subscription.discount.coupon && subscription.discount.coupon.percent_off === 100) {
                        console.log(`User ${user.email} has a 100% discount, preserving subscription status`);
                        continue; // Skip updating status for 100% discounted users
                    }

                    if (subscription.status === 'active') {
                        newStatus = 'active';
                        paidForCurrentMonth = true;
                    } else if (subscription.status === 'canceled' || subscription.status === 'past_due') {
                        newStatus = 'expired';
                        paidForCurrentMonth = false;
                    }
                }

                if (user.subscriptionStatus !== newStatus || user.paidForCurrentMonth !== paidForCurrentMonth) {
                    user.subscriptionStatus = newStatus;
                    user.paidForCurrentMonth = paidForCurrentMonth;
                    await user.save();
                    console.log(`Updated subscription status for ${user.email} to ${newStatus}, paidForCurrentMonth: ${paidForCurrentMonth}`);
                }
            } catch (error) {
                console.error(`Error checking subscription for ${user.email}:`, error.message);
            }
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).render('error', {
        title: 'Error',
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('error', {
        title: '404 Not Found',
        message: 'The page you are looking for does not exist.'
    });
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;