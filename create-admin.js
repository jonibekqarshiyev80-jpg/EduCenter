require("dotenv").config();

const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");

async function createAdmin() {
  const { MONGODB_URI, DB_NAME, ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
  const username = ADMIN_USERNAME?.trim();

  if (!MONGODB_URI || !username || !ADMIN_PASSWORD) {
    throw new Error(".env faylida kerakli sozlamalar yo‘q.");
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();

    const db = client.db(DB_NAME || "oquv_markazi");
    const users = db.collection("users");

    await users.createIndex({ username: 1 }, { unique: true });

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const existingUser = await users.findOne({ username });

    if (existingUser && existingUser.role !== "admin") {
      throw new Error("Bu login admin bo‘lmagan akkauntga tegishli; boshqa ADMIN_USERNAME tanlang.");
    }

    if (existingUser) {
      await users.updateOne(
        { _id: existingUser._id },
        { $set: { passwordHash, updatedAt: new Date() } }
      );
      console.log("Admin paroli .env dagi ADMIN_PASSWORD bilan yangilandi.");
      return;
    }

    await users.insertOne({
      username,
      passwordHash,
      role: "admin",
      createdAt: new Date()
    });

    console.log("Admin akkaunti yaratildi.");
  } finally {
    await client.close();
  }
}

createAdmin().catch(error => {
  console.error("Admin yaratilmadi:", error.message);
  process.exitCode = 1;
});