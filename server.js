const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'terrain-secret-change-in-production';

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Protect admin page — only your email
const ADMIN_EMAIL = 'ofosuamponsahgt@gmail.com';
app.get('/admin', authRequired, (req, res) => {
  if (!req.user.email.toLowerCase().includes('ofosuamponsah')) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============================================================
// DATABASE SETUP
// ============================================================
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        trial_started_at TIMESTAMP DEFAULT NOW(),
        trial_days INTEGER DEFAULT 90,
        plan VARCHAR(50) DEFAULT 'trial',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS lodges (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        country VARCHAR(100),
        region VARCHAR(100),
        property_type VARCHAR(100),
        suites INTEGER,
        currency VARCHAR(10) DEFAULT 'USD',
        pricing_philosophy TEXT,
        target_revenue BIGINT,
        target_occupancy INTEGER,
        target_direct INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        lodge_id INTEGER REFERENCES lodges(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        icon VARCHAR(10),
        base_rate NUMERIC(10,2),
        display_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS seasons (
        id SERIAL PRIMARY KEY,
        lodge_id INTEGER REFERENCES lodges(id) ON DELETE CASCADE,
        name VARCHAR(100),
        multiplier NUMERIC(4,2) DEFAULT 1.0,
        months VARCHAR(50),
        color VARCHAR(20),
        display_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        lodge_id INTEGER REFERENCES lodges(id) ON DELETE CASCADE,
        name VARCHAR(255),
        commission_pct NUMERIC(5,2) DEFAULT 0
      );
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('DB init error:', err.message);
  }
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function authRequired(req, res, next) {
  const token = req.cookies.terrain_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ============================================================
// AUTH ROUTES
// ============================================================

// Register
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase(), hash]
    );

    const token = jwt.sign({ id: result.rows[0].id, email: result.rows[0].email }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('terrain_token', token, { httpOnly: true, secure: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: result.rows[0].id, email: result.rows[0].email } });

    // Send welcome email (non-blocking)
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    console.log('Registration - RESEND_API_KEY present:', !!RESEND_API_KEY);
    console.log('Registration - sending welcome email to:', email);
    if (RESEND_API_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Terrain <noreply@getonterrain.com>',
          to: email,
          subject: 'Welcome to Terrain — your 90-day trial has started',
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#faf7f2;">
              <div style="font-size:28px;font-weight:700;letter-spacing:0.1em;margin-bottom:8px;color:#1c1814;">TERRAIN</div>
              <div style="font-size:11px;color:#8a7d72;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:32px;">Experience Revenue Intelligence</div>
              <h2 style="font-size:22px;color:#1c1814;margin-bottom:12px;font-weight:500;">Your 90-day free trial has started</h2>
              <p style="color:#3d3530;line-height:1.7;margin-bottom:20px;font-size:14px;">
                Welcome to Terrain. You now have full access to the revenue intelligence platform built specifically for luxury safari lodges and experience operators.
              </p>
              <div style="background:#1c1814;border-radius:10px;padding:24px;margin-bottom:24px;">
                <div style="color:rgba(255,255,255,0.5);font-size:10px;text-transform:uppercase;letter-spacing:0.12em;margin-bottom:16px;">Your trial includes</div>
                <div style="color:#f5f0e8;font-size:13px;line-height:2;">
                  ✓ Dynamic package pricing engine<br/>
                  ✓ 30-day demand forecasting<br/>
                  ✓ Scarcity & occupancy signals<br/>
                  ✓ Channel mix optimization<br/>
                  ✓ AI revenue recommendations
                </div>
              </div>
              <p style="color:#3d3530;line-height:1.7;margin-bottom:24px;font-size:13px;">
                Start by completing your property setup — it takes about 3 minutes and Terrain will configure itself entirely around your operation.
              </p>
              <a href="${process.env.APP_URL || 'https://getonterrain.com'}/onboarding" style="display:inline-block;background:#c4613a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-bottom:24px;">Set Up Your Property →</a>
              <p style="color:#8a7d72;font-size:12px;line-height:1.7;margin-bottom:0;">
                As a founding lodge, if you subscribe within your trial period you lock in your rate for the first year.<br/><br/>
                Questions? Reply to this email — we read every one.<br/><br/>
                <strong>Terrain by TechSoftNexa LTD</strong><br/>
                <a href="https://getonterrain.com" style="color:#c4613a;">getonterrain.com</a>
              </p>
            </div>
          `
        })
      }).then(async r => {
        const data = await r.json();
        console.log('Welcome email Resend response:', JSON.stringify(data));
      }).catch(err => console.error('Welcome email error:', err));
    } else {
      console.error('RESEND_API_KEY not found — welcome email not sent');
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ id: result.rows[0].id, email: result.rows[0].email }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('terrain_token', token, { httpOnly: true, secure: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    res.json({ success: true, user: { id: result.rows[0].id, email: result.rows[0].email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('terrain_token');
  res.json({ success: true });
});

// Forgot password — send reset email
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    // Ensure token table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const user = await pool.query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()]);

    // Always return success for security — don't reveal if email exists
    if (user.rows.length === 0) {
      console.log('Forgot password: email not found:', email);
      return res.json({ success: true });
    }

    const userId = user.rows[0].id;
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Delete any existing tokens for this user
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);

    // Create new token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiresAt]
    );

    const resetUrl = `${process.env.APP_URL || 'https://getonterrain.com'}/reset-password?token=${token}`;
    console.log('Reset URL generated:', resetUrl);

    // Send email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not set!');
      return res.json({ success: true });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Terrain <noreply@getonterrain.com>',
        to: email,
        subject: 'Reset your Terrain password',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="font-size: 24px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 24px;">TERRAIN</div>
            <h2 style="font-size: 20px; margin-bottom: 12px;">Reset your password</h2>
            <p style="color: #6b7280; margin-bottom: 24px; line-height: 1.6;">
              We received a request to reset your Terrain password. Click the button below to set a new password.
              This link expires in <strong>1 hour</strong>.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#c4613a;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Reset Password →</a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; line-height: 1.6;">
              If you didn't request this, ignore this email — your password won't change.<br/>
              The link will expire automatically after 1 hour.
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
            <p style="color: #9ca3af; font-size: 11px;">
              Terrain by TechSoftNexa LTD · <a href="https://getonterrain.com" style="color:#c4613a;">getonterrain.com</a>
            </p>
          </div>
        `
      })
    });

    const emailData = await emailRes.json();
    console.log('Resend response:', JSON.stringify(emailData));

    res.json({ success: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.json({ success: true });
  }
});

// Verify reset token
app.get('/api/auth/verify-reset-token', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.json({ valid: false });

  try {
    const result = await pool.query(
      'SELECT id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = FALSE',
      [token]
    );
    res.json({ valid: result.rows.length > 0 });
  } catch {
    res.json({ valid: false });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

  try {
    const tokenResult = await pool.query(
      'SELECT user_id FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW() AND used = FALSE',
      [token]
    );

    if (tokenResult.rows.length === 0) return res.status(400).json({ error: 'Invalid or expired token' });

    const userId = tokenResult.rows[0].user_id;
    const hash = await bcrypt.hash(password, 10);

    // Update password
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

    // Mark token as used
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token]);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// Check auth status
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const lodge = await pool.query('SELECT * FROM lodges WHERE user_id = $1 LIMIT 1', [req.user.id]);

    // Calculate trial days remaining
    const u = user.rows[0];
    const trialStart = new Date(u.trial_started_at);
    const now = new Date();
    const daysUsed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, u.trial_days - daysUsed);
    const trialExpired = daysRemaining === 0 && u.plan === 'trial';

    res.json({
      user: { id: u.id, email: u.email, plan: u.plan },
      trial: { started: u.trial_started_at, daysRemaining, trialExpired },
      hasLodge: lodge.rows.length > 0,
      lodge: lodge.rows[0] || null
    });
  } catch {
    res.json({ user: req.user, hasLodge: false, lodge: null });
  }
});

// ============================================================
// LODGE ROUTES
// ============================================================

// Save full lodge config (from onboarding)
app.post('/api/lodge', authRequired, async (req, res) => {
  const { name, country, region, property_type, suites, currency, packages, seasons, channels, target_revenue, target_occupancy, target_direct, pricing_philosophy } = req.body;

  try {
    // Upsert lodge
    const existing = await pool.query('SELECT id FROM lodges WHERE user_id = $1', [req.user.id]);

    let lodgeId;
    if (existing.rows.length > 0) {
      lodgeId = existing.rows[0].id;
      await pool.query(`
        UPDATE lodges SET name=$1, country=$2, region=$3, property_type=$4, suites=$5, currency=$6,
        target_revenue=$7, target_occupancy=$8, target_direct=$9, pricing_philosophy=$10, updated_at=NOW()
        WHERE id=$11`,
        [name, country, region, property_type, suites, currency, target_revenue, target_occupancy, target_direct, pricing_philosophy, lodgeId]
      );
    } else {
      const r = await pool.query(`
        INSERT INTO lodges (user_id, name, country, region, property_type, suites, currency, target_revenue, target_occupancy, target_direct, pricing_philosophy)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [req.user.id, name, country, region, property_type, suites, currency, target_revenue, target_occupancy, target_direct, pricing_philosophy]
      );
      lodgeId = r.rows[0].id;
    }

    // Replace packages
    await pool.query('DELETE FROM packages WHERE lodge_id = $1', [lodgeId]);
    if (packages && packages.length > 0) {
      for (let i = 0; i < packages.length; i++) {
        const p = packages[i];
        await pool.query('INSERT INTO packages (lodge_id, name, icon, base_rate, display_order) VALUES ($1,$2,$3,$4,$5)',
          [lodgeId, p.name, p.icon || '🏕️', parseFloat(p.base_rate ?? p.rate) || 0, i]);
      }
    }

    // Replace seasons
    await pool.query('DELETE FROM seasons WHERE lodge_id = $1', [lodgeId]);
    if (seasons && seasons.length > 0) {
      for (let i = 0; i < seasons.length; i++) {
        const s = seasons[i];
        await pool.query('INSERT INTO seasons (lodge_id, name, multiplier, months, color, display_order) VALUES ($1,$2,$3,$4,$5,$6)',
          [lodgeId, s.name, s.multiplier || 1.0, s.months, s.color || '#3a5c42', i]);
      }
    }

    // Replace channels
    await pool.query('DELETE FROM channels WHERE lodge_id = $1', [lodgeId]);
    if (channels && channels.length > 0) {
      for (const ch of channels) {
        await pool.query('INSERT INTO channels (lodge_id, name) VALUES ($1,$2)', [lodgeId, ch]);
      }
    }

    res.json({ success: true, lodgeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save lodge data' });
  }
});

// Get lodge config — works for both authenticated and guest users
app.get('/api/lodge', async (req, res) => {
  const token = req.cookies.terrain_token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.json({ lodge: null });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    const lodge = await pool.query('SELECT * FROM lodges WHERE user_id = $1 LIMIT 1', [user.id]);
    if (lodge.rows.length === 0) return res.json({ lodge: null });
    const lodgeId = lodge.rows[0].id;
    const packages = await pool.query('SELECT * FROM packages WHERE lodge_id = $1 ORDER BY display_order', [lodgeId]);
    const seasons = await pool.query('SELECT * FROM seasons WHERE lodge_id = $1 ORDER BY display_order', [lodgeId]);
    const channels = await pool.query('SELECT * FROM channels WHERE lodge_id = $1', [lodgeId]);
    res.json({ lodge: lodge.rows[0], packages: packages.rows, seasons: seasons.rows, channels: channels.rows });
  } catch {
    res.json({ lodge: null });
  }
});

// ============================================================
// PAGE ROUTES
// ============================================================
app.get('/sitemap.xml', (req, res) => {
  res.setHeader('Content-Type', 'application/xml');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.get('/google842e27f0c6839870.html', (req, res) => {
  res.send('google-site-verification: google842e27f0c6839870.html');
});

app.get('/', (req, res) => {
  const token = req.cookies.terrain_token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/dashboard');
    } catch {
      // Invalid token — show onboarding
    }
  }
  res.sendFile(path.join(__dirname, 'public', 'onboarding.html'));
});
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/onboarding', (req, res) => res.sendFile(path.join(__dirname, 'public', 'onboarding.html')));
app.get('/calendar', (req, res) => res.sendFile(path.join(__dirname, 'public', 'calendar.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/packages', (req, res) => res.redirect('/calendar'));
app.get('/forecast', (req, res) => res.redirect('/calendar'));
app.get('/channels', (req, res) => res.redirect('/calendar'));
app.get('/forgot-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pricing.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/refund', (req, res) => res.sendFile(path.join(__dirname, 'public', 'refund.html')));

// ── Paddle Webhook ─────────────────────────────────────────────
const PADDLE_WEBHOOK_SECRET = 'pdl_ntfset_01kpr568jvcc2y2fk6r3vceh9k_l+Oa5J76ZyVhHuOWwtkwRBrsrif79WLY';

app.post('/api/paddle/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    // Verify signature
    const signature = req.headers['paddle-signature'];
    if (signature && PADDLE_WEBHOOK_SECRET) {
      const crypto = require('crypto');
      const [tsPart, h1Part] = signature.split(';');
      const ts = tsPart.replace('ts=', '');
      const h1 = h1Part.replace('h1=', '');
      const signed = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET)
        .update(ts + ':' + req.body.toString())
        .digest('hex');
      if (signed !== h1) {
        console.warn('Paddle webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload = JSON.parse(req.body.toString());
    const eventType = payload.event_type || payload.alert_name;
    const data = payload.data || payload;

    // Map Paddle price IDs to plan names
    const planMap = {
      'pri_01kpr30n4mara8vb8z4n7bsne0': 'starter',
      'pri_01kpr38n93bkf232chqhp2919q': 'growth',
      'pri_01kpr3ck1stnaeye6599wme271': 'portfolio'
    };

    if (eventType === 'subscription.activated' || eventType === 'subscription.updated') {
      const email = data.customer?.email || data.email;
      const priceId = data.items?.[0]?.price?.id || data.subscription_plan_id;
      const plan = planMap[priceId] || 'starter';
      const paddleSubId = data.id || data.subscription_id;

      if (email) {
        await pool.query(
          `UPDATE users SET plan = $1, paddle_subscription_id = $2, plan_status = 'active' WHERE email = $3`,
          [plan, paddleSubId, email]
        );
        console.log(`Plan activated: ${email} → ${plan}`);
      }
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.canceled') {
      const email = data.customer?.email || data.email;
      if (email) {
        await pool.query(
          `UPDATE users SET plan = 'trial', plan_status = 'cancelled' WHERE email = $1`,
          [email]
        );
        console.log(`Subscription cancelled: ${email}`);
      }
    }

    if (eventType === 'transaction.completed') {
      const email = data.customer?.email || data.email;
      const priceId = data.items?.[0]?.price?.id;
      const plan = planMap[priceId];
      if (email && plan) {
        await pool.query(
          `UPDATE users SET plan = $1, plan_status = 'active' WHERE email = $2`,
          [plan, email]
        );
        console.log(`Payment completed: ${email} → ${plan}`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Paddle webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Start
initDB().then(() => migrateDB()).then(() => {
  app.listen(PORT, () => console.log(`Terrain running on port ${PORT}`));
});

// NOTE: Run this once to add new tables (safe to call repeatedly due to IF NOT EXISTS)
async function migrateDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_data (
        id SERIAL PRIMARY KEY,
        lodge_id INTEGER REFERENCES lodges(id) ON DELETE CASCADE,
        date_key VARCHAR(10) NOT NULL,
        pkg_idx VARCHAR(10) NOT NULL,
        booked_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(lodge_id, date_key, pkg_idx)
      );
      CREATE TABLE IF NOT EXISTS manual_booked (
        id SERIAL PRIMARY KEY,
        lodge_id INTEGER REFERENCES lodges(id) ON DELETE CASCADE,
        pkg_idx INTEGER NOT NULL,
        booked_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(lodge_id, pkg_idx)
      );
    `);
    // Add active_lodge_id column if not exists
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_lodge_id INTEGER REFERENCES lodges(id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paddle_subscription_id VARCHAR(100)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status VARCHAR(20) DEFAULT 'trial'`);
    console.log('Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// ============================================================
// CALENDAR DATA ROUTES
// ============================================================

// Save calendar occupancy data
app.post('/api/calendar', authRequired, async (req, res) => {
  const { occData } = req.body; // { 'YYYY-MM-DD': { pkgIdx: bookedCount } }
  if (!occData) return res.status(400).json({ error: 'No data provided' });

  try {
    const lodge = await pool.query('SELECT id FROM lodges WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (lodge.rows.length === 0) return res.status(404).json({ error: 'No lodge found' });
    const lodgeId = lodge.rows[0].id;

    // Upsert each date/pkg entry (supports split keys like '0_s', '0_d' and legacy integer keys)
    for (const [dateKey, pkgObj] of Object.entries(occData)) {
      for (const [pkgIdx, bookedCount] of Object.entries(pkgObj)) {
        const pkgKey = pkgIdx.toString(); // store as string to support '0_s', '0_d'
        await pool.query(`
          INSERT INTO calendar_data (lodge_id, date_key, pkg_idx, booked_count, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (lodge_id, date_key, pkg_idx)
          DO UPDATE SET booked_count = $4, updated_at = NOW()
        `, [lodgeId, dateKey, pkgKey, parseInt(bookedCount) || 0]);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Calendar save error:', err);
    res.status(500).json({ error: 'Failed to save calendar data' });
  }
});

// Load calendar occupancy data
app.get('/api/calendar', authRequired, async (req, res) => {
  try {
    const lodge = await pool.query('SELECT id FROM lodges WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (lodge.rows.length === 0) return res.json({ occData: {} });
    const lodgeId = lodge.rows[0].id;

    const result = await pool.query(
      'SELECT date_key, pkg_idx, booked_count FROM calendar_data WHERE lodge_id = $1',
      [lodgeId]
    );

    // Reconstruct { 'YYYY-MM-DD': { pkgIdx: bookedCount } }
    const occData = {};
    result.rows.forEach(row => {
      if (!occData[row.date_key]) occData[row.date_key] = {};
      occData[row.date_key][row.pkg_idx] = row.booked_count; // pkg_idx stored as string
    });

    res.json({ occData });
  } catch (err) {
    console.error('Calendar load error:', err);
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

// Save manual booked overrides (packages page)
app.post('/api/manual-booked', authRequired, async (req, res) => {
  const { manualBooked } = req.body; // { pkgIdx: bookedCount }
  if (!manualBooked) return res.status(400).json({ error: 'No data provided' });

  try {
    const lodge = await pool.query('SELECT id FROM lodges WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (lodge.rows.length === 0) return res.status(404).json({ error: 'No lodge found' });
    const lodgeId = lodge.rows[0].id;

    for (const [pkgIdx, bookedCount] of Object.entries(manualBooked)) {
      await pool.query(`
        INSERT INTO manual_booked (lodge_id, pkg_idx, booked_count, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (lodge_id, pkg_idx)
        DO UPDATE SET booked_count = $3, updated_at = NOW()
      `, [lodgeId, parseInt(pkgIdx), parseInt(bookedCount) || 0]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Manual booked save error:', err);
    res.status(500).json({ error: 'Failed to save manual booked data' });
  }
});

// Load manual booked overrides
app.get('/api/manual-booked', authRequired, async (req, res) => {
  try {
    const lodge = await pool.query('SELECT id FROM lodges WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (lodge.rows.length === 0) return res.json({ manualBooked: {} });
    const lodgeId = lodge.rows[0].id;

    const result = await pool.query(
      'SELECT pkg_idx, booked_count FROM manual_booked WHERE lodge_id = $1',
      [lodgeId]
    );

    const manualBooked = {};
    result.rows.forEach(row => { manualBooked[row.pkg_idx] = row.booked_count; });

    res.json({ manualBooked });
  } catch (err) {
    console.error('Manual booked load error:', err);
    res.status(500).json({ error: 'Failed to load manual booked data' });
  }
});

// ============================================================
// MULTI-PROPERTY SUPPORT
// ============================================================

// Get all lodges for this user


// ── Terrain pricing algorithm (matches calendar.html) ──────────────
function getBaseMultiplier(dateKeyStr) {
  const dt = new Date(dateKeyStr + 'T12:00:00');
  const dow = dt.getDay();
  const mon = dt.getMonth();
  const seasonMult = {0:0.88,1:0.88,2:0.92,3:0.85,4:0.85,5:1.10,6:1.30,7:1.30,8:1.15,9:1.20,10:0.90,11:0.95}[mon] || 1.0;
  const dowMult = [1.15,0.90,0.88,0.88,0.95,1.20,1.20][dow] || 1.0;
  return seasonMult * dowMult;
}
function getRecRate(base, pct, dateKeyStr) {
  const defMult = dateKeyStr ? getBaseMultiplier(dateKeyStr) : 1.0;
  const defRate = Math.round(base * defMult);
  if(pct>=100) return Math.round(defRate*1.45);
  if(pct>=90)  return Math.round(defRate*1.35);
  if(pct>=80)  return Math.round(defRate*1.20);
  if(pct>=70)  return Math.round(defRate*1.10);
  if(pct>=55)  return Math.round(defRate*1.00);
  if(pct>=40)  return Math.round(defRate*0.90);
  if(pct>=0)   return Math.round(defRate*0.80);
  return defRate;
}

// ── Admin dashboard API ─────────────────────────────────────────────
app.get('/api/admin/overview', authRequired, async (req, res) => {
  try {
    // Simple hardcoded admin check — only your email
    // Admin check - server side only, email never exposed to client
    if (!req.user || !req.user.email.toLowerCase().includes('ofosuamponsah')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get all lodges with their packages and calendar data
    const lodges = await pool.query(`
      SELECT l.id, l.name, l.country, l.suites, l.created_at,
             u.email, u.plan, u.plan_status, u.trial_started_at
      FROM lodges l
      JOIN users u ON u.id = l.user_id
      ORDER BY l.created_at DESC
    `);

    const result = [];

    for (const lodge of lodges.rows) {
      // Get packages
      const pkgs = await pool.query(
        'SELECT * FROM packages WHERE lodge_id = $1 ORDER BY display_order',
        [lodge.id]
      );

      // Get calendar data for current month
      const now = new Date();
      const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const calData = await pool.query(
        `SELECT date_key, pkg_idx, booked_count FROM calendar_data
         WHERE lodge_id = $1 AND date_key LIKE $2`,
        [lodge.id, `${monthStr}%`]
      );

      // Build occData map
      const occData = {};
      calData.rows.forEach(row => {
        if (!occData[row.date_key]) occData[row.date_key] = {};
        occData[row.date_key][row.pkg_idx] = row.booked_count;
      });

      // Calculate fixed vs recommended revenue — exact same logic as calendar.html
      const spp = Math.max(1, Math.floor((lodge.suites || 10) / Math.max(1, pkgs.rows.length)));
      let fixedRevenue = 0, recRevenue = 0, daysWithData = 0;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${monthStr}-${String(d).padStart(2,'0')}`;
        if (!occData[key]) continue;
        let dayHasData = false;
        pkgs.rows.forEach((pkg, pi) => {
          const bS = parseInt(occData[key][pi + '_s']) || 0;
          const bD = parseInt(occData[key][pi + '_d']) || 0;
          const totalBooked = bS + bD;
          if (totalBooked <= 0) return;
          dayHasData = true;
          const pct = Math.min(100, Math.round((totalBooked / spp) * 100));
          const recS = getRecRate(pkg.base_rate, pct, key);
          const recD = Math.round(recS * 2);
          fixedRevenue += (pkg.base_rate * bS) + (pkg.base_rate * 2 * bD);
          recRevenue += (recS * bS) + (recD * bD);
        });
        if (dayHasData) daysWithData++;
      }

      result.push({
        id: lodge.id,
        name: lodge.name,
        country: lodge.country,
        suites: lodge.suites,
        email: lodge.email,
        plan: lodge.plan,
        plan_status: lodge.plan_status,
        trial_started_at: lodge.trial_started_at,
        created_at: lodge.created_at,
        packages: pkgs.rows.length,
        daysWithData,
        fixedRevenue: Math.round(fixedRevenue),
        recRevenue: Math.round(recRevenue),
        uplift: Math.round(recRevenue - fixedRevenue)
      });
    }

    res.json({ lodges: result });
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/lodges', authRequired, async (req, res) => {
  try {
    const lodges = await pool.query(
      'SELECT id, name, country, region, property_type, suites, currency FROM lodges WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    let activeLodgeId = null;
    try {
      const user = await pool.query('SELECT active_lodge_id FROM users WHERE id = $1', [req.user.id]);
      activeLodgeId = user.rows[0]?.active_lodge_id || null;
    } catch(e) { /* column may not exist yet */ }
    res.json({ lodges: lodges.rows, activeLodgeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load lodges' });
  }
});

// Switch active lodge
app.post('/api/lodges/switch', authRequired, async (req, res) => {
  const { lodgeId } = req.body;
  if (!lodgeId) return res.status(400).json({ error: 'lodgeId required' });
  try {
    // Verify this lodge belongs to user
    const check = await pool.query('SELECT id FROM lodges WHERE id = $1 AND user_id = $2', [lodgeId, req.user.id]);
    if (check.rows.length === 0) return res.status(403).json({ error: 'Not your lodge' });
    // Add active_lodge_id column if not exists
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_lodge_id INTEGER REFERENCES lodges(id) ON DELETE SET NULL`);
    await pool.query('UPDATE users SET active_lodge_id = $1 WHERE id = $2', [lodgeId, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to switch lodge' });
  }
});

// Create new property (additional lodge)
app.post('/api/lodges/new', authRequired, async (req, res) => {
  const { name, country, region, property_type, suites, currency } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const result = await pool.query(
      'INSERT INTO lodges (user_id, name, country, region, property_type, suites, currency) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [req.user.id, name, country || '', region || '', property_type || 'Safari Lodge', suites || 20, currency || 'USD']
    );
    const lodgeId = result.rows[0].id;
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_lodge_id INTEGER REFERENCES lodges(id) ON DELETE SET NULL`).catch(()=>{});
    await pool.query('UPDATE users SET active_lodge_id = $1 WHERE id = $2', [lodgeId, req.user.id]);
    res.json({ success: true, lodgeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create lodge' });
  }
});

// Get active lodge (respects active_lodge_id)
app.get('/api/active-lodge', authRequired, async (req, res) => {
  try {
    const user = await pool.query('SELECT active_lodge_id FROM users WHERE id = $1', [req.user.id]).catch(() => ({ rows: [{}] }));
    const activeLodgeId = user.rows[0]?.active_lodge_id;

    let lodge;
    if (activeLodgeId) {
      lodge = await pool.query('SELECT * FROM lodges WHERE id = $1 AND user_id = $2', [activeLodgeId, req.user.id]);
    }
    if (!lodge || lodge.rows.length === 0) {
      lodge = await pool.query('SELECT * FROM lodges WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1', [req.user.id]);
    }

    if (lodge.rows.length === 0) return res.json({ lodge: null });
    const lodgeId = lodge.rows[0].id;
    const packages = await pool.query('SELECT * FROM packages WHERE lodge_id = $1 ORDER BY display_order', [lodgeId]);
    const seasons = await pool.query('SELECT * FROM seasons WHERE lodge_id = $1 ORDER BY display_order', [lodgeId]);
    res.json({ lodge: lodge.rows[0], packages: packages.rows, seasons: seasons.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load active lodge' });
  }
});
