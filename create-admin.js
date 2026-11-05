require("dotenv").config();

const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

async function provisionUser(users, { username, password, role }) {
  const normalizedUsername = username.trim().toLowerCase();

  if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
    throw new Error(`${role} login 3–32 belgi bo‘lsin: lotin harfi, raqam, nuqta, _ yoki -.`);
  }
  if (Buffer.byteLength(password, "utf8") < 8 ||
      Buffer.byteLength(password, "utf8") > 72) {
    throw new Error(`${role} paroli 8–72 bayt oralig‘ida bo‘lishi kerak.`);
  }

  const existingUser = await users.findOne({ username: normalizedUsername });
  if (existingUser && existingUser.role !== role) {
    throw new Error(`${normalizedUsername} logini boshqa rolga tegishli.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  if (existingUser) {
    await users.updateOne(
      { _id: existingUser._id },
      { $set: { passwordHash, updatedAt: new Date() } }
    );
    console.log(`${role} akkaunti yangilandi.`);
    return;
  }

  await users.insertOne({
    username: normalizedUsername,
    passwordHash,
    role,
    createdAt: new Date()
  });
  console.log(`${role} akkaunti yaratildi.`);
}

async function createAdmin() {
  const { MONGODB_URI, DB_NAME } = process.env;
  const configuredUsers = [
    { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, role: "admin" },
    { username: process.env.TEACHER_USERNAME, password: process.env.TEACHER_PASSWORD, role: "teacher" },
    { username: process.env.STUDENT_USERNAME, password: process.env.STUDENT_PASSWORD, role: "student" }
  ];

  if (!MONGODB_URI) {
    throw new Error(".env faylida MONGODB_URI ko‘rsatilmagan.");
  }
  for (const user of configuredUsers) {
    if (Boolean(user.username) !== Boolean(user.password)) {
      throw new Error(`${user.role} uchun username va password ikkalasi ham kiritilishi kerak.`);
    }
  }
  if (!configuredUsers[0].username || !configuredUsers[0].password) {
    throw new Error(".env faylida ADMIN_USERNAME va ADMIN_PASSWORD bo‘lishi kerak.");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();

    const db = client.db(DB_NAME || "oquv_markazi");
    const users = db.collection("users");

    await users.createIndex({ username: 1 }, { unique: true });

    const usernames = configuredUsers
      .filter(user => user.username)
      .map(user => user.username.trim().toLowerCase());
    if (new Set(usernames).size !== usernames.length) {
      throw new Error("ADMIN, TEACHER va STUDENT loginlari bir-biridan farq qilishi kerak.");
    }

    for (const user of configuredUsers) {
      if (user.username) await provisionUser(users, user);
    }
  } finally {
    await client.close();
  }
}

createAdmin().catch(error => {
  console.error("Admin yaratilmadi:", error.message);
  process.exitCode = 1;
});