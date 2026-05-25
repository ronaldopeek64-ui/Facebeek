// ... (начало кода одинаковое: импорты, настройка транспорта, инициализация Firebase)

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { action, email, password, nickname, username, code } = req.body;

  try {
    if (action === "send_code") {
      // ПРОВЕРКА ЮЗЕРНЕЙМА
      if (!username || !/^[a-zA-Z]{5,20}$/.test(username)) {
        return res.status(400).json({ error: "Юзернейм: 5-20 английских букв" });
      }
      
      // Проверка уникальности юзернейма в Firestore
      const usernameSnapshot = await db.collection('users').where('username', '==', username.toLowerCase()).get();
      if (!usernameSnapshot.empty) {
        return res.status(400).json({ error: "Этот юзернейм уже занят" });
      }

      const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
      codes.set(email, { code: generatedCode, password, nickname, username: username.toLowerCase(), expires: Date.now() + 600000 });

      await transporter.sendMail({
        from: `"Facebeek" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Твой код для Facebeek",
        html: `<h1>Добро пожаловать в Facebeek!</h1><p>Твой код: <b style="font-size:22px">${generatedCode}</b></p>`,
      });

      return res.status(200).json({ success: true, message: "Код отправлен" });
    }

    if (action === "verify") {
      const storedData = codes.get(email);
      if (!storedData) return res.status(400).json({ error: "Запроси код заново" });
      if (storedData.code !== code) return res.status(400).json({ error: "Неверный код" });
      if (Date.now() > storedData.expires) return res.status(400).json({ error: "Код просрочен" });

      // Повторная проверка юзернейма (мало ли кто-то успел зарегать за это время)
      const usernameCheck = await db.collection('users').where('username', '==', storedData.username).get();
      if (!usernameCheck.empty) return res.status(400).json({ error: "Юзернейм только что заняли, начни заново" });

      const userRecord = await admin.auth().createUser({
        email: email,
        password: storedData.password,
        displayName: storedData.nickname,
      });

      await db.collection("users").doc(userRecord.uid).set({
        username: storedData.username,
        nickname: storedData.nickname,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      codes.delete(email);
      const customToken = await admin.auth().createCustomToken(userRecord.uid);
      return res.status(200).json({ success: true, token: customToken });
    }
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: "Эта почта уже зарегистрирована." });
    }
    return res.status(500).json({ error: error.message });
  }
};
