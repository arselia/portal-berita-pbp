const express = require('express')
const { ObjectId } = require("mongodb");
const { authenticateToken, authorizeRole } = require('./auth');
const bcrypt = require('bcryptjs');

module.exports = function(database){
    const router = express.Router();
    const akunList = database.collection('akun')

    // ✅ GET semua jurnalis (khusus admin)
    router.get('/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
        try {
            const users = await akunList.find({ role: 'jurnalis' }).toArray();
            res.json(users);
        } catch (err) {
            console.error('❌ Gagal ambil data jurnalis:', err);
            res.status(500).json({ message: 'Gagal ambil data jurnalis' });
        }
    });
    
    // Get profil sendiri (dari token) untuk Admin, Jurnalis
    // Admin, Jurnalis
    router.get('/lihat-data-akun', authenticateToken, async(req, res)=>{
        try{
            const result = await akunList.findOne({ _id: new ObjectId(req.user.id) });
            if(!result)return res.status(401).json({ message: 'tidak ditemukan' });
            return res.json(result);
        }catch(err){
        res.status(500).json({ message: 'Gagal ambil data' });
        }
        
    })

    router.put('/update-data-akun', authenticateToken, authorizeRole('jurnalis'), async (req, res) => {
        try {
          const { nama, email, passwordLama, password, alamat, pendidikan } = req.body;
          const id = req.user.id;
      
          if (!nama || !email || !alamat || !pendidikan) {
            return res.status(400).json({ message: 'Semua field harus diisi!' });
          }
      
          const cariAkun = await akunList.findOne({ _id: new ObjectId(id), status: 1 });
          if (!cariAkun) return res.status(404).json({ message: 'Akun tidak ditemukan' });
      
          let hashedPassword = cariAkun.password;
      
          // Kalau user isi password baru, validasi password lama
          if (password && password.trim() !== '') {
            const valid = await bcrypt.compare(passwordLama, cariAkun.password);
            if (!valid) return res.status(401).json({ message: 'Password lama salah' });
            hashedPassword = await bcrypt.hash(password, 10);
          }
      
          const result = await akunList.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: {
                nama,
                email,
                password: hashedPassword,
                alamat,
                pendidikan
              }
            }
          );
      
          return res.json({ message: 'Berhasil mengupdate profil' });
        } catch (err) {
          console.error("UPDATE ERROR:", err);
          res.status(500).json({ message: 'Gagal ubah data' });
        }
      });
      

    return router
}