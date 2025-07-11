const nodemailer = require('nodemailer');
const { format, utcToZonedTime } = require('date-fns-tz');
const Event = require('../models/events');
const User = require('../models/user');
const mongoose = require('mongoose');

// Initialize nodemailer transporter with Hostinger SMTP
const transporter = nodemailer.createTransport({
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true, // use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter
transporter.verify(function (error, success) {
    if (error) {
        console.error('Error verifying email configuration:', error);
        console.error('Email config used:', {
            host: 'smtp.hostinger.com',
            port: 465,
            user: process.env.EMAIL_USER,
            auth_provided: !!process.env.EMAIL_PASS
        });
    } else {
        console.log('Notification email server is ready');
    }
});

// Set up MongoDB change stream to watch for new user registrations
let userChangeStream = null;

const initializeUserWatcher = async () => {
    try {
        // Get the users collection
        const usersCollection = mongoose.connection.collection('users');
        
        // Create a change stream to watch for insert operations
        userChangeStream = usersCollection.watch([
            {
                $match: {
                    operationType: 'insert'
                }
            }
        ]);

        console.log('User change stream initialized successfully');

        // Listen for changes
        userChangeStream.on('change', async (change) => {
            console.log('[CHANGE STREAM] New user detected:', change.documentKey._id);
            
            try {
                // Get the full user document
                const user = await User.findById(change.documentKey._id);
                if (user) {
                    console.log('[CHANGE STREAM] Processing new user:', user.email);
                    
                    // Send welcome email to the new user
                    const { sendWelcomeNewUserEmail } = require('./newUserEmails');
                    await sendWelcomeNewUserEmail(user);
                    
                    console.log('[CHANGE STREAM] Notifications sent successfully for user:', user.email);
                }
            } catch (error) {
                console.error('[CHANGE STREAM] Error processing new user notification:', error);
            }
        });

        userChangeStream.on('error', (error) => {
            console.error('[CHANGE STREAM] Error in user change stream:', error);
            // Attempt to reconnect after a delay
            setTimeout(() => {
                console.log('[CHANGE STREAM] Attempting to reconnect...');
                initializeUserWatcher();
            }, 5000);
        });

    } catch (error) {
        console.error('[CHANGE STREAM] Error initializing user watcher:', error);
        // Attempt to reconnect after a delay
        setTimeout(() => {
            console.log('[CHANGE STREAM] Attempting to reconnect...');
            initializeUserWatcher();
        }, 5000);
    }
};

// Function to start the user watcher
const startUserWatcher = () => {
    // Wait for MongoDB connection to be ready
    if (mongoose.connection.readyState === 1) {
        initializeUserWatcher();
    } else {
        mongoose.connection.once('connected', () => {
            initializeUserWatcher();
        });
    }
};

// Function to stop the user watcher
const stopUserWatcher = () => {
    if (userChangeStream) {
        userChangeStream.close();
        userChangeStream = null;
        console.log('[CHANGE STREAM] User watcher stopped');
    }
};

// Function to get upcoming events within the next 7 days
const getUpcomingEvents = async () => {
    try {
        const now = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(now.getDate() + 7);
        
        const events = await Event.find({
            dtstart: {
                $gte: now.toISOString(),
                $lte: sevenDaysFromNow.toISOString()
            },
            status: 'pending'
        })
        .sort({ dtstart: 1 })
        .limit(3)
        .select('summary dtstart');
        
        return events;
    } catch (error) {
        console.error('Error fetching upcoming events:', error);
        return [];
    }
};

// CLIENT-FACING EMAIL TEMPLATES
const clientEmailTemplates = {
    welcome: (user) => ({
        subject: 'Welcome to Soda City Outdoors!',
        html: `
            <h1>Welcome to Soda City Outdoors, ${user.firstName}!</h1>
            <p>We're excited to have you join our community of outdoor enthusiasts.</p>
            <p>Here are a few things you can do to get started:</p>
            <ul>
                <li>Browse our upcoming events</li>
                <li>Complete your profile</li>
                <li>Join our forum discussions</li>
            </ul>
            <p>Happy adventuring!</p>
        `
    }),
    eventReminder: (user, event) => ({
        subject: `Reminder: ${event.summary} tomorrow`,
        html: `
            <h2>Event Reminder</h2>
            <p>Hi ${user.firstName},</p>
            <p>This is a reminder that you're registered for:</p>
            <h3>${event.summary}</h3>
            <p><strong>When:</strong> ${new Date(event.dtstart).toLocaleString()}</p>
            <p><strong>Where:</strong> ${event.location}</p>
            <p>See you there!</p>
        `
    })
};

// Send client-facing email
const sendEmail = async (to, template, data) => {
    try {
        // Support both sync and async template functions
        let result = clientEmailTemplates[template](data);
        if (result instanceof Promise) {
            result = await result;
        }
        const { subject, html } = result;
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html
        });
        console.log(`Client email sent successfully to ${to}`);
        return true;
    } catch (error) {
        console.error('Error sending client email:', error);
        return false;
    }
};

// Send RSVP notification
const sendRSVPNotification = async (event, rsvp, user) => {
    try {
        const subject = 'New Event RSVP';
        const text = `
New RSVP for Event:
Event: ${event.summary}
Date: ${new Date(event.dtstart).toLocaleDateString()}
Attendee: ${user.username}
Email: ${user.email}
Phone: ${rsvp.phoneNumber}
Current RSVP Count: ${event.rsvps.length}
        `;
        await sendEmail(user.email, 'rsvpConfirmation', { rsvp, user });
    } catch (error) {
        console.error('Error sending RSVP notification:', error);
    }
};

// Schedule notifications for an event
const scheduleEventNotifications = async (user, event) => {
    const eventDate = new Date(event.dtstart);
    
    // Schedule email for 24 hours before
    const emailDate = new Date(eventDate);
    emailDate.setHours(emailDate.getHours() - 24);
    
    // Use node-schedule to schedule notifications
    require('node-schedule').scheduleJob(emailDate, async () => {
        await sendEmail(user.email, 'eventReminder', { user, event });
    });
};

module.exports = {
    sendEmail,
    scheduleEventNotifications,
    sendRSVPNotification,
    startUserWatcher,
    stopUserWatcher
};