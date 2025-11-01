// Untuk autentikasi dan otorisasi
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const SECRET_KEY = 'your_secret_key';
const express = require('express')
const { ObjectId } = require("mongodb");

// Autentikasi
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Otorisasi
function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) return res.sendStatus(403);
    next();
  };
}

// Otorisasi tambahan dari Sherly buat berita.js
// karena Sherly mau bikin 1 endpoint bisa diakses 3 role sekaligus
// dengan jenis output yang berbeda
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  if (!token) {
    req.user = null; // guest
    return next();
  }
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      req.user = null;
    } else {
      req.user = user;
    }
    next();
  });
}

// Middleware
function middleware(database){
  const router = express.Router();
  const akunList = database.collection('akun')

  // Register
  router.post('/register', async(req, res)=>{
    const { nama, email, password, alamat, pendidikan, status=1, role='jurnalis'} = req.body;
    if (!nama || !email || !password || !alamat || !pendidikan) return res.status(400).json({ message: 'semua input harus diisi' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const cariAkun = await akunList.find({email: email}).toArray();
    if(cariAkun.length>0) return res.status(409).json({ message: 'email sudah digunakan' });
    const akun = { nama, email, password: hashedPassword, alamat, pendidikan, status, role}
    const result = await akunList.insertOne(akun);
    res.json(result);
  });

  // Login - DIPERBAIKI: Kirim role juga dalam response
  router.post('/login', async(req, res)=>{
    const {email, password} = req.body;
    const cariAkun = await akunList.find({email: email, status:1}).toArray();
    if(cariAkun.length===0) return res.status(409).json({ message: 'email tidak ditemukan' });
    const valid = await bcrypt.compare(password, cariAkun[0].password);
    if (!valid) return res.status(401).json({ message: 'Password salah' });
    
    const token = jwt.sign({ id: cariAkun[0]._id, role: cariAkun[0].role}, SECRET_KEY, { expiresIn: '1h' });
    console.log("tes : ", token);
    
    // PERBAIKAN: Kirim token DAN role dalam response
    res.json({ 
      token: token,
      role: cariAkun[0].role,
      message: 'Login berhasil'
    });
  });

  // Menonaktifkan akun, kalo aktif statusnya 1 kalo ga aktif statusnya 0. Sama kayak hapus akun
  router.put('/update-status/:id', authenticateToken, authorizeRole("admin"), async (req, res) => {
    try {
      const { status } = req.body; // ✅ ambil dari body
      const result = await akunList.updateOne(
        {
          _id: new ObjectId(req.params.id),
          role: { $ne: "admin" } // admin tidak boleh diubah
        },
        {
          $set: { status: Number(status) } // pastikan status berupa angka
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({ message: 'User tidak ditemukan atau tidak diubah' });
      }

      res.json({ message: 'Status berhasil diubah' });
    } catch (err) {
      res.status(500).json({ message: 'Gagal update status' });
    }
  });

  return router;
}

// Export, biar bisa diakses di yg lain
module.exports = {
  authenticateToken,
  authorizeRole,
  middleware,
  optionalAuth,
};