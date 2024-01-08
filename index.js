const { Telegraf } = require("telegraf");
const mysql = require("mysql2/promise");

const token = "6594036840:AAFW9n4FUoBw8JFWCyxbTAEuXCd_Rs3-jA4";
const channelId = "-1002031415448";
const ownerId = "1279152375";

const dbConfig = {
  host: "localhost",
  user: "root",
  password: "",
  database: "menfess",
};

const bot = new Telegraf(token);
let connection;

const initializeDatabase = async () => {
  try {
    connection = await mysql.createConnection(dbConfig);

    // Create a table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS members (
        id INT PRIMARY KEY,
        name VARCHAR(255),
        koin INT,
        status VARCHAR(50),
        dailyQuota INT
      );
    `);

    console.log("Connected to the database");
  } catch (error) {
    console.error("Error initializing database:", error);
  }
};

const updateMemberData = async (userId, data) => {
  try {
    await connection.query(
      "INSERT INTO members (id, name, koin, status, dailyQuota) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), koin = VALUES(koin), status = VALUES(status), dailyQuota = VALUES(dailyQuota)",
      [userId, data.name, data.koin, data.status, data.dailyQuota]
    );
  } catch (error) {
    console.error("Error updating member data:", error);
  }
};

const getMemberData = async (userId) => {
  try {
    const [rows] = await connection.query(
      "SELECT * FROM members WHERE id = ?",
      [userId]
    );
    return rows[0];
  } catch (error) {
    console.error("Error getting member data:", error);
    return null;
  }
};

// Initialize database on startup
initializeDatabase();

bot.start(async (ctx) => {
  try {
    const userId = ctx.message.from.id;
    console.log("User ID:", userId);

    const member = await getMemberData(userId);
    console.log("Member Data:", member);

    if (!member) {
      console.log("Member not found. Inserting default data.");

      // If member not found, insert default data
      await updateMemberData(userId, {
        name: "Default Name",
        koin: 0,
        status: "silver",
        dailyQuota: 10,
      });
    }

    // Rest of your start logic
    const menuText = `
Selamat Datang :
/status - Cek Status Akun dan Saldo Koin Anda
/topup - Isi Ulang Coin
Untuk format pengiriman promote ke channel kami
"Cari Fwb #girls"
Gunakan #boys atau #girls pada pesannya
untuk melihat pesan di channel bisa cek link channel dan grub dibagian atas
    `;
    bot.telegram.sendMessage(userId, menuText);
  } catch (error) {
    console.error("Error in /start command:", error);
  }
});

bot.command("status", async (ctx) => {
  try {
    const userId = ctx.message.from.id;
    const member = await getMemberData(userId);

    if (member) {
      const statusMessage = `
ID: ${member.id}
Koin: ${member.koin}
Status: ${member.status}
Kuota Harian: ${member.dailyQuota}
      `;
      ctx.reply(statusMessage);
    } else {
      ctx.reply(
        "Data member tidak ditemukan. Mohon gunakan perintah /start terlebih dahulu."
      );
    }
  } catch (error) {
    console.error("Error in /status command:", error);
  }
});

bot.command("topup", async (ctx) => {
  try {
    const userId = ctx.message.from.id;
    const isOwner = userId.toString() === ownerId; // Convert userId to string for comparison

    if (isOwner) {
      // Owner-specific topup logic
      const args = ctx.message.text.split(" ");
      const targetUserId = parseInt(args[1]);
      const topupAmount = parseInt(args[2]);

      if (isNaN(targetUserId) || isNaN(topupAmount)) {
        ctx.reply(
          "Format perintah tidak valid. Gunakan /topup [userId] [jumlah]"
        );
      } else {
        const targetMember = await getMemberData(targetUserId);
        if (!targetMember) {
          ctx.reply("Target member not found.");
          return;
        }

        targetMember.koin += topupAmount;
        await updateMemberData(targetUserId, targetMember);

        ctx.reply(
          `Top-up sebesar ${topupAmount} koin berhasil untuk ID ${targetUserId}. Saldo sekarang: ${targetMember.koin}`
        );
      }
    } else {
      // Non-owner message
      ctx.reply(
        "Silahkan Hubungi Owner Ilham Ahmad : @ilham_ar1, Hati-hati penipuan owner tidak pernah mengajak top up secara langsung atau via apapun"
      );
    }
  } catch (error) {
    console.error("Error in /topup command:", error);
  }
});

// Function to reset daily quota timestamp
const resetDailyQuotaTimestamp = async (userId) => {
  try {
    await connection.query(
      "UPDATE members SET lastDailyQuotaReset = CURRENT_TIMESTAMP WHERE id = ?",
      [userId]
    );
  } catch (error) {
    console.error("Error resetting daily quota timestamp:", error);
  }
};

// ... (existing functions)

bot.on("text", async (ctx) => {
  const userId = ctx.message.from.id;

  try {
    const member = await getMemberData(userId);

    if (member) {
      if (member.status === "none") {
        ctx.reply("You cannot send messages because your status is 'none'.");
      } else if (member.status === "silver") {
        const currentTime = new Date();
        const lastResetTime = new Date(member.lastDailyQuotaReset || 0);
        const timeDiff = currentTime - lastResetTime;
        const hoursPassed = timeDiff / (1000 * 60 * 60);

        // Check if 24 hours have passed since the last reset
        if (hoursPassed >= 24) {
          // Reset daily quota and timestamp
          member.dailyQuota = 10;
          await resetDailyQuotaTimestamp(userId);
        }

        if (member.dailyQuota > 0) {
          const messageText = ctx.message.text.toLowerCase();

          // Check if the message format is valid
          if (messageText.includes("#boys") || messageText.includes("#girls")) {
            // Forward the user's message to the channel
            await bot.telegram.forwardMessage(
              channelId,
              userId,
              ctx.message.message_id
            );

            // Update member data
            member.dailyQuota--;
            await updateMemberData(userId, member);

            // Reply to the user
            ctx.reply("Your message has been sent! Daily quota updated.");
          } else {
            ctx.reply(
              "Invalid message format. Please include either #boys or #girls in your message."
            );
          }
        } else if (member.koin >= 10) {
          // Deduct 10 koin if daily quota is exhausted
          // Forward the user's message to the channel
          await bot.telegram.forwardMessage(
            channelId,
            userId,
            ctx.message.message_id
          );

          // Update member data
          member.koin -= 10;
          await updateMemberData(userId, member);

          // Reply to the user
          ctx.reply(
            "Your message has been sent! 10 koin deducted because your daily quota is exhausted."
          );
        } else {
          ctx.reply(
            "You don't have enough daily quota or koin to send a message. Top up your coins or wait for the quota to reset."
          );
        }
      }
    } else {
      ctx.reply(
        "You are not registered as a member. Please use the /start command first."
      );
    }
  } catch (error) {
    console.error("Error processing message:", error);
    ctx.reply("An error occurred while processing your message.");
  }
});

// Launch the bot
bot.launch();
