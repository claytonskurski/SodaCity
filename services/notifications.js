const nodemailer = require('nodemailer');
const { format, utcToZonedTime } = require('date-fns-tz');
const Event = require('../models/events');

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

// Helper function to send admin notifications
async function sendAdminNotification(subject, text) {
    console.log('Attempting to send admin notification:', { subject, text });
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('Email configuration not found:', {
            EMAIL_USER: !!process.env.EMAIL_USER,
            EMAIL_PASS: !!process.env.EMAIL_PASS
        });
        return;
    }

    const mailOptions = {
        from: process.env.EMAIL_USER || 'scoadmin@sodacityoutdoors.com',
        to: 'scoadmin@sodacityoutdoors.com',
        subject: subject,
        text: text
    };

    try {
        console.log('Sending admin email with options:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        await transporter.sendMail(mailOptions);
        console.log('Admin notification email sent successfully');
    } catch (emailError) {
        console.error('Error sending admin notification email:', {
            error: emailError.message,
            stack: emailError.stack,
            code: emailError.code,
            command: emailError.command
        });
    }
}

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
    }),
    rentalConfirmation: (reservation) => {
        // Determine equipment details based on type
        const equipmentDetails = reservation.equipmentType.toLowerCase().includes('kayak') 
            ? '(includes paddle, lifevest, and dry bag)'
            : reservation.equipmentType.toLowerCase().includes('tube')
                ? '(includes lifevest and dry bag)'
                : '';

        // Get address from location data
        const locationAddress = reservation.location && reservation.location.address 
            ? reservation.location.address 
            : 'Address not available';

        return {
            subject: 'Soda City Outdoors - Rental Confirmation',
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Rental Confirmation</title>
                </head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8f9fa;">
                <div style="background:#fff;margin:0 auto;padding:20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="text-align:center;margin-bottom:20px;">
                        <img src='https://sodacityoutdoors.com/static/images/SCO%20Logo.png' alt='Soda City Outdoors Logo' style='max-width:200px;width:100%;height:auto;display:block;margin:0 auto;'>
                    </div>
                    <h2 style="color:#2c3e50;margin:0 0 20px 0;">Rental Confirmation</h2>
                    <p style="margin:0 0 15px 0;">Thank you for your rental with Soda City Outdoors! Our goal is to make it as easy as possible for you to get on the water this summer!</p>
                    <p style="margin:0 0 20px 0;">Please find your rental details below, and make sure they are correct. We will meet you at your selected location and provide you with all the equipment you need.</p>
                    <div style="background-color:#f8f9fa;padding:15px;border-radius:5px;margin:20px 0;">
                        <h3 style="color:#2c3e50;margin:0 0 15px 0;">Rental Details:</h3>
                        <ul style="list-style:none;padding:0;margin:0;">
                            <li style="margin-bottom:10px;"><strong>Location:</strong> ${reservation.locationName}</li>
                            <li style="margin:0 0 10px 20px;color:#666;">${locationAddress}</li>
                            <li style="margin-bottom:10px;"><strong>Equipment:</strong> ${reservation.equipmentType} ${equipmentDetails}</li>
                            <li style="margin-bottom:10px;"><strong>Quantity:</strong> ${reservation.quantity}</li>
                            <li style="margin-bottom:10px;"><strong>Date:</strong> ${reservation.date.toISOString().split('T')[0]}</li>
                            <li style="margin-bottom:10px;"><strong>Time:</strong> ${reservation.interval === 'half-day' 
                                ? `Half Day (${reservation.timeBlock === 'AM' ? '10AM - 2PM' : reservation.timeBlock === 'PM' ? '2PM - 6PM' : ''})` 
                                : 'Full Day (10AM - 6PM)'}</li>
                            <li style="margin-bottom:10px;"><strong>Total Amount:</strong> $${reservation.total.toFixed(2)}</li>
                            <li style="margin-bottom:10px;"><strong>Payment Status:</strong> ${reservation.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}</li>
                            <li style="margin-bottom:0;"><strong>Payment Method:</strong> ${reservation.paymentMethod === 'stripe' ? 'Credit Card' : 'Cash'}</li>
                        </ul>
                    </div>
                    <p style="margin:20px 0;">If you have any questions, please contact us at <a href="mailto:scoadmin@sodacityoutdoors.com" style="color:#0e747c;text-decoration:none;">scoadmin@sodacityoutdoors.com</a></p>
                    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;">
                        <p style="color:#666;font-size:12px;margin:0;">This is an automated message, please do not reply directly to this email.</p>
                    </div>
                </div>
                </body>
                </html>
            `
        };
    },
    welcomeNewUser: async (user) => {
        const upcomingEvents = await getUpcomingEvents();
        const eventNames = upcomingEvents.map(event => event.summary);
        
        // Fill in event names or use placeholders if not enough events
        const event1 = eventNames[0] || 'a social event';
        const event2 = eventNames[1] || 'an outdoor activity';
        const event3 = eventNames[2] || 'a weekend excursion';
        
        return {
            subject: 'Welcome to Soda City Outdoors!',
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Welcome to Soda City Outdoors</title>
                </head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8f9fa;">
                <div style="background:#fff;margin:0 auto;padding:20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="text-align:center;margin-bottom:20px;">
                        <img src='https://sodacityoutdoors.com/static/images/SCO%20Logo.png' alt='Soda City Outdoors Logo' style='max-width:200px;width:100%;height:auto;display:block;margin:0 auto;'>
                    </div>
                    <h1 style="color:#2c3e50;margin:0 0 20px 0;">Hi ${user.firstName},</h1>
                    <p style="margin:0 0 15px 0;line-height:1.6;">Welcome to Soda City Outdoors!</p>
                    <p style="margin:0 0 15px 0;line-height:1.6;">As a member, you can expect roughly three events per week that are completely optional to attend. We'll have a couple of socials or outdoor activities within Columbia during the week and some fun, outdoor excursions on the weekends! Of course, since this is community based, please feel free to pitch any ideas of things you may want to do in the future.</p>
                    <p style="margin:0 0 15px 0;line-height:1.6;"><strong>This week we'll do</strong> ${event1}, ${event2}, and ${event3}.</p>
                    <p style="margin:0 0 15px 0;line-height:1.6;">You will also get access to discounted rental gear that you are free to borrow at any time!</p>
                    <div style="background-color:#f8f9fa;padding:15px;border-radius:5px;margin:20px 0;">
                        <h3 style="color:#2c3e50;margin:0 0 15px 0;">Your Discount Codes:</h3>
                        <ul style="list-style:none;padding:0;margin:0;">
                            <li style="margin-bottom:10px;"><strong>Tube Discount Code:</strong> TUBINGFUN</li>
                            <li style="margin-bottom:0;"><strong>Kayak Discount Code:</strong> SCOMEMBERS</li>
                        </ul>
                    </div>
                    <p style="margin:20px 0;line-height:1.6;">The more people we have, the more folks we can meet, the more events we can have, and more fun will be had. Thanks for joining and hope to meet you soon!</p>
                    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;">
                        <p style="color:#666;font-size:14px;margin:0;"><strong>Soda City Outdoors</strong></p>
                        <p style="color:#666;font-size:12px;margin:5px 0 0 0;">If you have any questions, reply to this email or contact us at <a href="mailto:scoadmin@sodacityoutdoors.com" style="color:#0e747c;text-decoration:none;">scoadmin@sodacityoutdoors.com</a></p>
                    </div>
                </div>
                </body>
                </html>
            `
        };
    },
    rsvpConfirmation: async (rsvp, user) => {
        // Find the event details using the eventId from the RSVP
        const event = await Event.findOne({ eventId: rsvp.eventId });
        if (!event) {
            console.error('Event not found for RSVP confirmation:', rsvp.eventId);
            return {
                subject: 'RSVP Confirmation',
                html: '<p>Your RSVP has been confirmed, but event details are currently unavailable.</p>'
            };
        }

        // Format the event date and time
        const eventDate = new Date(event.dtstart);
        const formattedDate = eventDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const formattedTime = eventDate.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });

        return {
            subject: `RSVP Confirmed: ${event.summary}`,
            html: `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>RSVP Confirmation</title>
                </head>
                <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8f9fa;">
                <div style="background:#fff;margin:0 auto;padding:20px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div style="text-align:center;margin-bottom:20px;">
                        <img src='https://sodacityoutdoors.com/static/images/SCO%20Logo.png' alt='Soda City Outdoors Logo' style='max-width:200px;width:100%;height:auto;display:block;margin:0 auto;'>
                    </div>
                    <h1 style="color:#2c3e50;margin:0 0 20px 0;">Thanks for signing up, ${user.firstName}!</h1>
                    <p style="margin:0 0 15px 0;line-height:1.6;">We're excited to have you join us for this adventure! Your RSVP has been confirmed and we can't wait to see you there.</p>
                    <p style="margin:0 0 20px 0;line-height:1.6;"><strong>We'll see you there!</strong></p>
                    
                    <div style="background-color:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #0e747c;">
                        <h2 style="color:#2c3e50;margin:0 0 15px 0;">Event Details</h2>
                        <div style="margin-bottom:15px;">
                            <h3 style="color:#0e747c;margin:0 0 10px 0;">${event.summary}</h3>
                            <p style="margin:0 0 8px 0;color:#666;"><strong>Date:</strong> ${formattedDate}</p>
                            <p style="margin:0 0 8px 0;color:#666;"><strong>Time:</strong> ${formattedTime}</p>
                            <p style="margin:0 0 8px 0;color:#666;"><strong>Location:</strong> ${event.location || 'Location TBD'}</p>
                            ${event.description ? `<p style="margin:10px 0 0 0;color:#666;"><strong>Description:</strong> ${event.description}</p>` : ''}
                        </div>
                    </div>

                    <p style="margin:20px 0;line-height:1.6;">We're looking forward to a great time together! If you have any questions or need to make changes to your RSVP, please don't hesitate to reach out.</p>
                    
                    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;">
                        <p style="color:#666;font-size:14px;margin:0;"><strong>Soda City Outdoors</strong></p>
                        <p style="color:#666;font-size:12px;margin:5px 0 0 0;">If you have any questions, reply to this email or contact us at <a href="mailto:scoadmin@sodacityoutdoors.com" style="color:#0e747c;text-decoration:none;">scoadmin@sodacityoutdoors.com</a></p>
                    </div>
                </div>
                </body>
                </html>
            `
        };
    },
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

// Send rental confirmation emails
const sendRentalConfirmationEmails = async (reservation) => {
    try {
        // Send confirmation to customer
        const { subject, html } = clientEmailTemplates['rentalConfirmation'](reservation);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: reservation.customerEmail,
            subject,
            html
        });
        
        // Send admin notification
        await sendAdminNotification(
            'New Rental Reservation',
            `A new rental reservation has been made:
            Customer Name: ${reservation.customerName}
            Customer Email: ${reservation.customerEmail}
            Location: ${reservation.locationName}
            Equipment: ${reservation.equipmentType}
            Quantity: ${reservation.quantity}
            Date: ${reservation.date.toISOString().split('T')[0]}
            Time: ${reservation.interval === 'half-day' 
                ? `Half Day (${reservation.timeBlock === 'AM' ? '10AM - 2PM' : reservation.timeBlock === 'PM' ? '2PM - 6PM' : ''})` 
                : 'Full Day (10AM - 6PM)'}
            Total Amount: $${reservation.total.toFixed(2)}
            Payment Status: ${reservation.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
            Payment Method: ${reservation.paymentMethod === 'stripe' ? 'Credit Card' : 'Cash'}`
        );
        
        console.log(`Rental confirmation email sent to ${reservation.customerEmail}`);
        return true;
    } catch (error) {
        console.error('Error sending rental confirmation emails:', error);
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
        await sendAdminNotification(subject, text);
    } catch (error) {
        console.error('Error sending RSVP notification:', error);
    }
};

// Send rental notification to admin
const sendRentalNotification = async (reservation) => {
    try {
        const subject = 'New Rental Booking';
        const text = `
New Rental Booking:
Customer Name: ${reservation.name}
Customer Email: ${reservation.email}
Location: ${reservation.locationName}
Equipment: ${reservation.equipmentType}
Quantity: ${reservation.quantity}
Date: ${reservation.date.toISOString().split('T')[0]}
Time: ${reservation.interval === 'half-day' 
    ? `Half Day (${reservation.timeBlock === 'AM' ? '10AM - 2PM' : reservation.timeBlock === 'PM' ? '2PM - 6PM' : ''})` 
    : 'Full Day (10AM - 6PM)'}
Total Amount: $${reservation.total.toFixed(2)}
Payment Status: ${reservation.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
Payment Method: ${reservation.paymentMethod === 'stripe' ? 'Credit Card' : 'Cash'}
        `;
        await sendAdminNotification(subject, text);
    } catch (error) {
        console.error('Error sending rental notification:', error);
    }
};

// Send new user notification
const sendNewUserNotification = async (user) => {
    console.log('[NOTIFY] Entered sendNewUserNotification for user:', user.email);
    try {
        await sendAdminNotification(
            'New User Registration',
            `A new user has registered:\nUsername: ${user.username}\nEmail: ${user.email}\nFirst Name: ${user.firstName}\nLast Name: ${user.lastName}\nRegistration Date: ${new Date().toLocaleDateString()}`
        );
        console.log('[NOTIFY] Admin notification email sent successfully for user:', user.email);
        return true;
    } catch (error) {
        console.error('[NOTIFY] Failed to send new user notification:', error);
        return false;
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

// Function to send welcome email to new user (external)
const sendWelcomeNewUserEmail = async (user) => {
    console.log('[NOTIFY] Entered sendWelcomeNewUserEmail for user:', user.email);
    try {
        const { subject, html } = await clientEmailTemplates['welcomeNewUser'](user);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            cc: 'cskurski00@gmail.com',
            subject,
            html
        });
        console.log('[NOTIFY] Welcome email sent to new user:', user.email);
        return true;
    } catch (error) {
        console.error('[NOTIFY] Error sending welcome new user email:', error);
        return false;
    }
};

// Function to send RSVP confirmation email to user
const sendRSVPConfirmationEmail = async (rsvp, user) => {
    console.log('[NOTIFY] Entered sendRSVPConfirmationEmail for user:', user.email, 'event:', rsvp.eventId);
    try {
        const { subject, html } = await clientEmailTemplates['rsvpConfirmation'](rsvp, user);
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: user.email,
            cc: 'cskurski00@gmail.com',
            subject,
            html
        });
        console.log('[NOTIFY] RSVP confirmation email sent to user:', user.email);
        return true;
    } catch (error) {
        console.error('[NOTIFY] Error sending RSVP confirmation email:', error);
        return false;
    }
};

module.exports = {
    sendEmail,
    scheduleEventNotifications,
    sendRentalConfirmationEmails,
    sendRSVPNotification,
    sendRentalNotification,
    sendNewUserNotification,
    sendAdminNotification,
    sendWelcomeNewUserEmail,
    sendRSVPConfirmationEmail
};