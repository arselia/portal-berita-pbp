const express = require('express')
const { ObjectId } = require("mongodb");
const { authenticateToken, authorizeRole } = require('./auth');

module.exports=function(database){
    const router= express.Router();
    const kategories= database.collection('kategories')

    // Get all kategori (tanpa autentikasi, untuk publik)
    router.get('/findAll', async (req, res) => {
      try {
        const result = await kategories.find().toArray();

        if (result.length === 0) {
          return res.status(404).json({ message: 'Belum ada data' });
        }

        res.json(result);
      } catch (err) {
        console.error("Gagal ambil kategori:", err);
        res.status(500).json({ message: 'Gagal ambil data' });
    }
});


    // get kategori by nama, ini untuk searching
    router.post('/cari-kategori', async (req, res)=>{
        try {
            const {nama} = req.body;
            // const upperNama=nama.toUpperCase(); nanti lah ini yaaaa
            const result = await kategories.find({nama: nama}).toArray();
            console.log(result);
            res.json(result);
        } catch (error) {
             res.status(500).json({ message: 'Gagal ambil data nama' });
        }
    });

    // tambah kategori
    router.post('/tambah-kategori',authenticateToken,authorizeRole('admin'), async (req, res) => {
      try {
        const { nama, deskripsi } = req.body;
        const resultCari = await kategories.find({nama: nama}).toArray();

        if (!nama || !deskripsi) return res.status(400).json({ message: 'nama dan kategori wajib diisi' });

        if(resultCari.length>0){
            return res.status(409).json({ message: 'Kategori sudah ada' });
        }
        const kategori = { nama, deskripsi };
        const result = await kategories.insertOne(kategori);
        res.json(result);
      } catch (err) {
        res.status(500).json({ message: 'Gagal menambah data' });
      }
    });

    // hapus kategori
    router.delete('/hapus-kategori/:id',authenticateToken, authorizeRole('admin'), async (req, res)=>{
        try{
            await kategories.deleteOne({_id: new ObjectId(req.params.id)});
            res.json({ message: 'Data berhasil dihapus' });
        }catch(err){
            res.status(500).json({ message: 'Gagal hapus data' });
        };
    })

    // update kategori
    router.put('/update-kategori/:id', authenticateToken, authorizeRole('admin'), async(req, res)=>{
        try{
            const { nama, deskripsi } = req.body;
            const result=await kategories.updateOne(
                {
                    _id: new ObjectId(req.params.id)
                },
                {
                    $set: {
                        nama: nama,
                        deskripsi: deskripsi
                    }
                }
            )
            res.json(result);
        }catch(err){
            res.status(500).json({ message: 'Gagal update data' });
        };
    });
    return router;
}

