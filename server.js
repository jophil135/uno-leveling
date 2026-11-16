require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const UPLOADS = path.join(ROOT, "uploads");
const DATA = path.join(ROOT, "data");

for (const dir of [UPLOADS, DATA]) fs.mkdirSync(dir, { recursive: true });

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be set to a random value at least 32 characters long.");
  process.exit(1);
}
if (!process.env.ADMIN_PASSCODE || process.env.ADMIN_PASSCODE.length < 12) {
  console.error("ADMIN_PASSCODE must be set to a unique passcode of at least 12 characters.");
  process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA }),
  name: "uno.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });

function cleanText(value, max = 240) {
  return String(value ?? "").trim().replace(/[<>]/g, "").slice(0, max);
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: "Administrator access required." });
  next();
}
function ensureCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const token = req.get("x-uno-csrf");
  if (!req.session.csrfToken || !token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: "Security token expired. Refresh the page and try again." });
  }
  next();
}
function issueCsrf(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Upload a JPG, PNG, WEBP or GIF image."));
    cb(null, true);
  }
});

app.get("/api/config", (req, res) => res.json({ csrfToken: issueCsrf(req) }));

app.post("/api/register", authLimiter, ensureCsrf, asyncRoute(async (req, res) => {
  const username = cleanText(req.body.username, 24);
  const email = cleanText(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: "Username must be 3–24 letters, numbers or underscores." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 72) return res.status(400).json({ error: "Password must be 10–72 characters." });
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = db.prepare("INSERT INTO users (username,email,password_hash) VALUES (?,?,?)").run(username, email, hash);
    req.session.userId = Number(result.lastInsertRowid);
    req.session.isAdmin = false;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.status(201).json({ ok: true, csrfToken: req.session.csrfToken });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "That username or email is already registered." });
    throw e;
  }
}));

app.post("/api/login", authLimiter, ensureCsrf, asyncRoute(async (req, res) => {
  const login = cleanText(req.body.login, 120).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE lower(username)=? OR lower(email)=?").get(login, login);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Incorrect login details." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start your session." });
    req.session.userId = user.id;
    req.session.isAdmin = false;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.json({ ok: true, csrfToken: req.session.csrfToken });
  });
}));

app.post("/api/logout", ensureCsrf, (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/me", requireUser, (req, res) => {
  const user = db.prepare("SELECT id,username,email,level,xp,streak,created_at FROM users WHERE id=?").get(req.session.userId);
  if (!user) return res.status(401).json({ error: "Account not found." });
  const quests = db.prepare("SELECT id,title,description,xp_reward,completed,created_at FROM quests WHERE user_id=? ORDER BY id DESC LIMIT 50").all(user.id);
  const achievements = db.prepare("SELECT id,title,description,unlocked_at FROM achievements WHERE user_id=? ORDER BY id DESC").all(user.id);
  res.json({ user, quests, achievements });
});

app.post("/api/quests", requireUser, ensureCsrf, (req, res) => {
  const title = cleanText(req.body.title, 80);
  const description = cleanText(req.body.description, 240);
  const xp = Math.max(5, Math.min(200, Number.parseInt(req.body.xpReward, 10) || 25));
  if (title.length < 2) return res.status(400).json({ error: "Quest title must contain at least 2 characters." });
  const result = db.prepare("INSERT INTO quests (user_id,title,description,xp_reward) VALUES (?,?,?,?)").run(req.session.userId, title, description, xp);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

app.post("/api/quests/:id/complete", requireUser, ensureCsrf, (req, res) => {
  const quest = db.prepare("SELECT * FROM quests WHERE id=? AND user_id=?").get(Number(req.params.id), req.session.userId);
  if (!quest) return res.status(404).json({ error: "Quest not found." });
  if (quest.completed) return res.status(409).json({ error: "This quest is already complete." });
  const complete = db.transaction(() => {
    db.prepare("UPDATE quests SET completed=1, completed_at=CURRENT_TIMESTAMP WHERE id=?").run(quest.id);
    db.prepare("UPDATE users SET xp=xp+? WHERE id=?").run(quest.xp_reward, req.session.userId);
    const user = db.prepare("SELECT xp FROM users WHERE id=?").get(req.session.userId);
    const level = Math.floor(user.xp / 500) + 1;
    db.prepare("UPDATE users SET level=? WHERE id=?").run(level, req.session.userId);
    return { xp: user.xp, level };
  });
  res.json({ ok: true, ...complete() });
});

app.get("/api/content", (_req, res) => {
  const sponsors = db.prepare("SELECT id,name,description,image_url,website_url FROM sponsors WHERE active=1 ORDER BY created_at DESC LIMIT 8").all();
  const quotes = db.prepare("SELECT id,quote,author,category FROM quotes WHERE active=1 ORDER BY RANDOM() LIMIT 5").all();
  res.json({ sponsors, quotes });
});

app.post("/api/admin/login", adminLimiter, ensureCsrf, asyncRoute(async (req, res) => {
  const username = cleanText(req.body.username, 80);
  const passcode = String(req.body.passcode || "");
  const expectedUser = process.env.ADMIN_USERNAME || "uno-admin";
  const userOk = crypto.timingSafeEqual(Buffer.from(username.padEnd(80).slice(0,80)), Buffer.from(expectedUser.padEnd(80).slice(0,80)));
  const suppliedHash = crypto.createHash("sha256").update(passcode).digest();
  const expectedHash = crypto.createHash("sha256").update(process.env.ADMIN_PASSCODE).digest();
  const passOk = crypto.timingSafeEqual(suppliedHash, expectedHash);
  if (!userOk || !passOk) return res.status(401).json({ error: "Invalid administrator credentials." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Could not start secure admin session." });
    req.session.isAdmin = true;
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    res.json({ ok: true, csrfToken: req.session.csrfToken });
  });
}));

app.get("/api/admin/summary", requireAdmin, (_req, res) => {
  res.json({
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    quests: db.prepare("SELECT COUNT(*) AS n FROM quests").get().n,
    completed: db.prepare("SELECT COUNT(*) AS n FROM quests WHERE completed=1").get().n,
    sponsors: db.prepare("SELECT COUNT(*) AS n FROM sponsors WHERE active=1").get().n,
    quotes: db.prepare("SELECT COUNT(*) AS n FROM quotes WHERE active=1").get().n
  });
});
app.get("/api/admin/sponsors", requireAdmin, (_req, res) => res.json(db.prepare("SELECT * FROM sponsors ORDER BY created_at DESC").all()));
app.post("/api/admin/sponsors", requireAdmin, ensureCsrf, upload.single("image"), (req, res) => {
  const name = cleanText(req.body.name, 100);
  const description = cleanText(req.body.description, 500);
  const website = cleanText(req.body.websiteUrl, 300);
  if (name.length < 2) return res.status(400).json({ error: "Sponsor name is required." });
  if (website && !/^https?:\/\//i.test(website)) return res.status(400).json({ error: "Website link must start with http:// or https://." });
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";
  const result = db.prepare("INSERT INTO sponsors (name,description,image_url,website_url,active) VALUES (?,?,?,?,?)").run(name, description, imageUrl, website, req.body.active === "on" ? 1 : 0);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.patch("/api/admin/sponsors/:id", requireAdmin, ensureCsrf, (req, res) => {
  const id = Number(req.params.id);
  const sponsor = db.prepare("SELECT * FROM sponsors WHERE id=?").get(id);
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found." });
  const active = req.body.active ? 1 : 0;
  db.prepare("UPDATE sponsors SET active=? WHERE id=?").run(active, id);
  res.json({ ok: true });
});
app.delete("/api/admin/sponsors/:id", requireAdmin, ensureCsrf, (req, res) => {
  const sponsor = db.prepare("SELECT * FROM sponsors WHERE id=?").get(Number(req.params.id));
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found." });
  if (sponsor.image_url && sponsor.image_url.startsWith("/uploads/")) {
    const file = path.join(UPLOADS, path.basename(sponsor.image_url));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  db.prepare("DELETE FROM sponsors WHERE id=?").run(sponsor.id);
  res.json({ ok: true });
});
app.get("/api/admin/quotes", requireAdmin, (_req, res) => res.json(db.prepare("SELECT * FROM quotes ORDER BY created_at DESC").all()));
app.post("/api/admin/quotes", requireAdmin, ensureCsrf, (req, res) => {
  const quote = cleanText(req.body.quote, 500);
  const author = cleanText(req.body.author, 100) || "Unknown";
  const category = cleanText(req.body.category, 60) || "Discipline";
  if (quote.length < 8) return res.status(400).json({ error: "Quote must contain at least 8 characters." });
  const result = db.prepare("INSERT INTO quotes (quote,author,category,active) VALUES (?,?,?,?)").run(quote, author, category, req.body.active ? 1 : 0);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.patch("/api/admin/quotes/:id", requireAdmin, ensureCsrf, (req, res) => {
  const quote = db.prepare("SELECT id FROM quotes WHERE id=?").get(Number(req.params.id));
  if (!quote) return res.status(404).json({ error: "Quote not found." });
  db.prepare("UPDATE quotes SET active=? WHERE id=?").run(req.body.active ? 1 : 0, quote.id);
  res.json({ ok: true });
});
app.delete("/api/admin/quotes/:id", requireAdmin, ensureCsrf, (req, res) => {
  db.prepare("DELETE FROM quotes WHERE id=?").run(Number(req.params.id));
  res.json({ ok: true });
});
app.post("/api/admin/logout", requireAdmin, ensureCsrf, (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.use("/uploads", express.static(UPLOADS, { maxAge: "7d", immutable: true }));
app.use(express.static(PUBLIC));
app.get("/admin", (_req, res) => res.sendFile(path.join(PUBLIC, "admin.html")));
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller." : "Image upload failed." });
  if (err.message && err.message.startsWith("Upload")) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(PORT, () => console.log(`UNO LEVELING running on http://localhost:${PORT}`));
