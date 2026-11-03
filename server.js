
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const client = new MongoClient(process.env.MONGODB_URI);
let db;
let dbReady;

const allowedTypes = {
  students: ["name", "phone", "course"],
  teachers: ["name", "phone", "subject"]
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    const error = new Error("SESSION_SECRET kamida 32 belgidan iborat bo‘lishi kerak");
    error.status = 500;
    throw error;
  }
  return secret;
}

function signSession(user) {
  const payload = Buffer.from(JSON.stringify({
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  })).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function authenticate(req, res, next) {
  try {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map(value => value.trim())
      .find(value => value.startsWith("auth_token="));
    const token = cookie?.slice("auth_token=".length);
    const [payload, signature] = token ? token.split(".") : [];

    if (!payload || !signature) {
      return res.status(401).json({ message: "Tizimga kiring." });
    }

    const expected = crypto
      .createHmac("sha256", getSessionSecret())
      .update(payload)
      .digest();
    const actual = Buffer.from(signature, "base64url");

    if (actual.length !== expected.length ||
        !crypto.timingSafeEqual(actual, expected)) {
      return res.status(401).json({ message: "Sessiya yaroqsiz. Qayta kiring." });
    }

    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user.username || !["admin", "teacher", "student"].includes(user.role) ||
        !Number.isFinite(user.expiresAt) || user.expiresAt <= Date.now()) {
      return res.status(401).json({ message: "Sessiya muddati tugagan. Qayta kiring." });
    }

    req.user = { username: user.username, role: user.role };
    next();
  } catch (error) {
    if (error.status) return next(error);
    return res.status(401).json({ message: "Sessiya yaroqsiz. Qayta kiring." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bu amal uchun ruxsatingiz yo‘q." });
    }
    next();
  };
}

async function ensureDb() {
  if (db) return db;

  if (!process.env.MONGODB_URI) {
    const error = new Error(".env faylida MONGODB_URI ko‘rsatilmagan");
    error.status = 500;
    throw error;
  }

  if (!dbReady) {
    dbReady = (async () => {
      await client.connect();
      db = client.db(process.env.DB_NAME || "oquv_markazi");
      await db.command({ ping: 1 });
      return db;
    })();
  }

  return dbReady;
}

async function collectionFor(type) {
  if (!allowedTypes[type]) {
    const error = new Error("Noto‘g‘ri bo‘lim");
    error.status = 404;
    throw error;
  }

  const currentDb = await ensureDb();
  return currentDb.collection(type);
}

function cleanInput(type, body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const error = new Error("Ma’lumot formati noto‘g‘ri");
    error.status = 400;
    throw error;
  }

  const result = {};
  for (const field of allowedTypes[type]) {
    const value = body[field] ?? "";
    if (typeof value !== "string") {
      const error = new Error(`${field} matn bo‘lishi kerak`);
      error.status = 400;
      throw error;
    }
    result[field] = value.trim();
  }

  if (!result.name || result.name.length > 120) {
    const error = new Error("Ism kiritilishi kerak (ko‘pi bilan 120 belgi)");
    error.status = 400;
    throw error;
  }

  for (const field of allowedTypes[type]) {
    if (result[field].length > 200) {
      const error = new Error("Kiritilgan ma’lumot juda uzun");
      error.status = 400;
      throw error;
    }
  }

  return result;
}

function parseId(id) {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    const error = new Error("ID noto‘g‘ri");
    error.status = 400;
    throw error;
  }
  return new ObjectId(id);
}

app.post("/api/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" ||
        !username.trim() || !password) {
      return res.status(400).json({ message: "Login va parolni kiriting." });
    }

    const currentDb = await ensureDb();
    const user = await currentDb.collection("users").findOne({
      username: username.trim()
    });

    if (!user || typeof user.passwordHash !== "string" ||
        !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ message: "Login yoki parol noto‘g‘ri." });
    }

    if (!["admin", "teacher", "student"].includes(user.role)) {
      return res.status(403).json({ message: "Foydalanuvchi roli noto‘g‘ri sozlangan." });
    }

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader(
      "Set-Cookie",
      `auth_token=${signSession(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`
    );
    res.json({
      user: {
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    "auth_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
  );
  res.json({ message: "Tizimdan chiqildi." });
});

// Barcha o‘quvchilar yoki o‘qituvchilar
app.get("/api/:type", authenticate, async (req, res, next) => {
  try {
    if (req.params.type === "schedules") return next();
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bu ma’lumotlar faqat admin uchun." });
    }
    const collection = await collectionFor(req.params.type);
    const items = await collection
      .find({})
      .sort({ name: 1 })
      .toArray();

    res.json(items.map(item => ({ ...item, id: item._id.toString() })));
  } catch (error) {
    next(error);
  }
});

// Yangi ma’lumot qo‘shish
app.post("/api/:type", authenticate, async (req, res, next) => {
  try {
    const type = req.params.type;
    if (type === "schedules") return next();
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bu amal faqat admin uchun." });
    }
    const item = cleanInput(type, req.body);
    const collection = await collectionFor(type);
    const result = await collection.insertOne({
      ...item,
      createdAt: new Date()
    });

    res.status(201).json({
      id: result.insertedId.toString(),
      ...item
    });
  } catch (error) {
    next(error);
  }
});

// Ma’lumotni tahrirlash
app.put("/api/:type/:id", authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const type = req.params.type;
    const id = parseId(req.params.id);
    const item = cleanInput(type, req.body);
    const collection = await collectionFor(type);

    const result = await collection.updateOne(
      { _id: id },
      { $set: item }
    );

    if (!result.matchedCount) {
      return res.status(404).json({ error: "Ma’lumot topilmadi" });
    }

    res.json({ id: id.toString(), ...item });
  } catch (error) {
    next(error);
  }
});

// Ma’lumotni o‘chirish
app.delete("/api/:type/:id", authenticate, async (req, res, next) => {
  try {
    if (req.params.type === "schedules") return next();
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Bu amal faqat admin uchun." });
    }
    const id = parseId(req.params.id);
    const collection = await collectionFor(req.params.type);
    const result = await collection.deleteOne({ _id: id });

    if (!result.deletedCount) {
      return res.status(404).json({ error: "Ma’lumot topilmadi" });
    }

    res.json({ message: "Ma’lumot o‘chirildi" });
  } catch (error) {
    next(error);
  }
});

// Xatolarni boshqarish
app.use((error, req, res, next) => {
  console.error(error.message);
  res.status(error.status || 500).json({
    error: error.status ? error.message : "Serverda xatolik yuz berdi"
  });
});

async function start() {
  getSessionSecret();
  await ensureDb();
  app.listen(PORT, () => {
    console.log(`Dastur ishga tushdi: http://localhost:${PORT}`);
    console.log("MongoDB bilan aloqa o‘rnatildi.");
  });
}

// Dars jadvalini ko‘rish
app.get('/api/schedules', authenticate, requireRole("admin", "teacher", "student"), async (req, res, next) => {
  try {
    const currentDb = await ensureDb();
    const schedules = await currentDb.collection('schedules')
      .find({})
      .sort({ day: 1, startTime: 1 })
      .toArray();

    res.json(schedules);
  } catch (error) {
    next(error);
  }
});

// Yangi dars qo‘shish
app.post('/api/schedules', authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const { lesson, group, teacher, day, startTime, endTime, room } = req.body;

    if (!lesson || !group || !teacher || !day || !startTime || !endTime) {
      return res.status(400).json({ message: 'Majburiy maydonlarni to‘ldiring' });
    }

    if (startTime >= endTime) {
      return res.status(400).json({
        message: 'Tugash vaqti boshlanish vaqtidan keyin bo‘lishi kerak'
      });
    }

    const currentDb = await ensureDb();
    const result = await currentDb.collection('schedules').insertOne({
      lesson, group, teacher, day, startTime, endTime,
      room: room || '',
      createdAt: new Date()
    });

    res.status(201).json({
      message: 'Dars jadvalga qo‘shildi',
      _id: result.insertedId
    });
  } catch (error) {
    next(error);
  }
});

// Darsni o‘chirish
app.delete('/api/schedules/:id', authenticate, requireRole("admin"), async (req, res, next) => {
  try {
    const { ObjectId } = require('mongodb');

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Dars ID noto‘g‘ri' });
    }

    const currentDb = await ensureDb();
    const result = await currentDb.collection('schedules').deleteOne({
      _id: new ObjectId(req.params.id)
    });

    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Dars topilmadi' });
    }

    res.json({ message: 'Dars o‘chirildi' });
  } catch (error) {
    next(error);
  }
});

if (require.main === module) {
  start().catch(error => {
    console.error("Ishga tushirish xatosi:", error.message);
    process.exit(1);
  });

  async function shutdown() {
    await client.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = app;
