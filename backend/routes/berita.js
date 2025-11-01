const express = require('express')
const { ObjectId } = require("mongodb");
const { authenticateToken, authorizeRole, optionalAuth } = require('./auth');

module.exports=function(database){
    const router= express.Router();
    const beritaList= database.collection('berita')
    const kategoriList = database.collection('kategories');

    // get berita all -> BUAT ADMIN, nanti cek berita mana yg unverified yg mana yg verified, yg mana yg masih waiting statusnya
    // AMAN
    router.get('/', authenticateToken, authorizeRole('admin'), async (req, res) => {
      try {
        const result = await beritaList.aggregate([
          {
            $lookup: {
              from: 'akun', // Nama koleksi akun
              localField: 'penulis_id',
              foreignField: '_id',
              as: 'penulis_info'
            }
          },
          { $unwind: { path: '$penulis_info', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              judul_berita: 1,
              isi_berita: 1,
              kategori: 1,
              hashtag_berita: 1,
              status: 1,
              isBreakingNews: 1,
              penulis: {
                nama_user: '$penulis_info.nama',
                pendidikan: '$penulis_info.pendidikan'
              }
            }
          }
        ]).toArray();

        res.json(result);
      } catch (err) {
        res.status(500).json({ message: 'Gagal ambil data' });
      }
    });

    // get berita dengan view terbanyak (diurutkan) -> public, kalo nanti mau ngurutin
    // DONE tambahin nama penulis. jd SEMUA bisa lihat berita verified yg viewsnya banyak
    // diurutin smpe yg sedikit
    // AMAN
    router.get('/terpopuler', async (req, res) => {
      try {
        const result = await beritaList.aggregate([ // memproses data sesuai urutan? pipeline?
          {
            $match: { status: 'verified' }
          },
          {
            $sort: { views: -1 } // urutin dr terbesar ke terkecil
          },
          {
            $lookup: {
              from: 'akun', // koleksinya
              let: { penulisIdStr: '$penulis_id' }, // ambil penulis_id dari berita, simpan di variabel lokal
              pipeline: [ // urutan langkahnya
                {
                  $match: { // nyaring data
                    $expr: { // filter tp lebih kompleks
                      $eq: ['$_id', '$$penulisIdStr'] // equals.  bandingkan dengan penulis_id dari berita
                    }
                  }
                }
              ],
              as: 'penulis'
            }
          },
          { $unwind: '$penulis' }, // ngubah array jd objek tunggal. biar apa? biar biur
          {
            $project: {
              _id: 1, // sembunyikan ID
              nama_penulis: '$penulis.nama',
              judul_berita: 1,
              kategori: 1,
              views : 1,
            } // 0 disembunyiin, 1 ditampilin
          }
        ]).toArray();
    
        if (result.length === 0) {
          return res.status(404).json({ message: 'Belum ada berita' });
        }
    
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil berita terpopuler' });
      }
    });    

    // get by judul LIKE -> public, buat searching
    // admin, buat searching tp dapet semua status
    // jurnalis, buat searching tp dapet semua status verified sm selain verified yg punya dia aj
    // AMAN
    router.get('/searchbyjudul', optionalAuth, async (req, res) => {
      try {
        const { judul } = req.query;
    
        if (!judul) {
          return res.status(400).json({ message: 'Query judul harus diisi' });
        }
    
        const isGuest = !req.user;
        const query = {
          judul_berita: { $regex: judul, $options: 'i' } // judul like (tidak case-sensitive)
        };
    
        // Role-based filtering 
        if (isGuest) {
          query.status = 'verified'; // Guest: hanya berita verified
        } else if (req.user.role === 'jurnalis') {
          // Jurnalis: bisa lihat semua yang verified + unverified/denied milik sendiri
          query.$or = [
            { status: 'verified' },
            {
              penulis_id: new ObjectId(req.user._id),
              status: { $in: ['unverified', 'denied'] }
            }
          ];
        } else if (req.user.role === 'admin') {
          // Admin: tidak set status sama sekali → bisa lihat semua
        }
    
        const result = await beritaList.aggregate([
  { $match: query },
  {
    $lookup: {
      from: 'akun',
      let: { penulisIdStr: { $toString: '$penulis_id' } },
      pipeline: [
        { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$penulisIdStr'] } } }
      ],
      as: 'penulis'
    }
  },
  { $unwind: '$penulis' },
  {
    $project: {
      _id: 1, // ✅ ini WAJIB untuk frontend bisa nge-link
      nama_penulis: '$penulis.nama',
      judul_berita: 1,
      kategori: 1,
      published_at: 1
    }
  }
]).toArray();
    
        if (result.length === 0) {
          return res.status(404).json({ message: 'Tidak ditemukan berita dengan judul tersebut' });
        }
    
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mencari berita' });
      }
    });

    router.put('/:id/breaking', authenticateToken, authorizeRole('admin'), async (req, res) => {
      try {
        const id = req.params.id;
        let { isBreakingNews } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'ID tidak valid' });
        }

        // 💡 Convert string "false"/"true" ke boolean
        if (typeof isBreakingNews === 'string') {
          if (isBreakingNews.toLowerCase() === 'true') {
            isBreakingNews = true;
          } else if (isBreakingNews.toLowerCase() === 'false') {
            isBreakingNews = false;
          } else {
            return res.status(400).json({ message: 'isBreakingNews harus "true" atau "false"' });
          }
        }

        if (typeof isBreakingNews !== 'boolean') {
          return res.status(400).json({ message: 'isBreakingNews harus berupa true atau false' });
        }

        const berita = await beritaList.findOne({ _id: new ObjectId(id) });

        if (!berita) {
          return res.status(404).json({ message: 'Berita tidak ditemukan' });
        }

        const result = await beritaList.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isBreakingNews } }
        );

        res.json({
          message: `Status breaking news diubah menjadi ${isBreakingNews}`,
          result
        });

      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengubah status breaking news' });
      }
    });

    // GET /berita/breaking-news
    router.get('/breaking-news', async (req, res) => {
      try {
        const breaking = await beritaList.findOne({ isBreakingNews: true });

        if (!breaking) {
          return res.status(404).json({ message: 'Tidak ada breaking news saat ini' });
        }

        res.json(breaking);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil breaking news' });
      }
    });

    // get by kategori -> public, bisa buat home klo mau sort by kategori
    // AMAN, aku (sherly) males ngasih biar outputnya cmn tertentu aja wkwk, kl butuh bilang ya frontend
    router.get('/filterby', async (req, res) => {
      try {
        const kategori = req.query.kategori;
    
        if (!kategori) {
          return res.status(400).json({ message: 'Kategori harus diisi' });
        }
    
        const result = await beritaList
          .find({ kategori: kategori, status: 'verified' })
          .toArray();
    
        if (result.length === 0) {
          return res.status(404).json({ message: 'Belum ada berita dalam kategori ini' });
        }
    
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal filter berita berdasarkan kategori' });
      }
    });

    //getAll berita sesuai id jurnalis
    router.get('/berita-by-id-jurnalis', authenticateToken, authorizeRole('jurnalis'), async (req, res) => {
      try {
        const beritaJurnalis = await beritaList.find({
          penulis_id: new ObjectId(req.user.id)
        }).toArray();
    
        if (beritaJurnalis.length === 0) {
          return res.status(404).json({ message: 'Belum ada berita dari jurnalis ini' });
        }
    
        res.json(beritaJurnalis);
    
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal ambil data' });
      }
    });
    
    // get berita terbarut urut berdasarkan published_at -> public, bisa buat home sort by date created lah
    // AMAN, aku (sherly) males ngasih biar outputnya cmn tertentu aja wkwk, kl butuh bilang ya frontend
    router.get('/terbaru', async (req, res) => {
      try {

        const result = await beritaList
          .find({ status: 'verified' })
          .sort({ published_at: -1 })// -1 untuk terbaru duluan
          .limit(10)
          .toArray();

        if (result.length === 0) {
          return res.status(404).json({ message: 'Belum ada berita' });
        }

        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil berita terbaru' });
      }
    });

    // update berita by id verifikasi — HANYA ADMIN, buat ngeverifikasi beritanya
    // AMAN
    router.put('/:id/verifikasi', authenticateToken, authorizeRole('admin'), async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'ID tidak valid' });
        }

        const allowedStatus = ['verified', 'unverified', 'denied'];
        if (!allowedStatus.includes(status)) {
          return res.status(400).json({ message: 'Status tidak valid' });
        }

        const berita = await beritaList.findOne({ _id: new ObjectId(id) });
        if (!berita) {
          return res.status(404).json({ message: 'Berita tidak ditemukan' });
        }

        const result = await beritaList.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: status,
              verified_at: new Date()
              // updated_at: new Date()
            }
          }
        );

        res.json({ message: `Status berita diubah menjadi '${status}'`, result });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengubah status berita' });
      }
    });   

    // get berita by status -> public, buat get berita per status. bisa buat home, bisa buat sorting admin nanti
    // jd ceritanya kalo public cmn bisa liat berita yg verified, tp admin sm jurnalis bisa cek yg unverified gt
    // sm jurnalis cmn bisa cek berita yg id nya punya dia
    // yg ditampilin output tertentu aj
    // AMAN
    router.get('/getallb', optionalAuth, async (req, res) => {
      try {
        const { status } = req.query;
        const allowedStatus = ['verified', 'unverified', 'denied'];
        const isGuest = !req.user;
        const query = {};
    
        if (isGuest) {
          // Guest: hanya boleh lihat status verified
          query.status = 'verified';
        } else if (req.user.role === 'jurnalis') {
          // Jurnalis: lihat semua verified + unverified/denied milik sendiri
          query.$or = [
            { status: 'verified' },
            {
              penulis_id: new ObjectId(req.user._id),
              status: { $in: ['unverified', 'denied'] }
            }
          ];  
        } else if (req.user.role === 'admin') {
          if (status && allowedStatus.includes(status)) {
            query.status = status;
          }
        }

          const result = await beritaList.aggregate([
            { $match: query },
            { $lookup: { from: 'akun', let: { penulisIdStr: { $toString: '$penulis_id' } }, pipeline: [
                  { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$penulisIdStr'] } } }
                ],
                as: 'penulis'
              }
            },
            { $unwind: '$penulis' },
            { $project: { _id: 1, nama_penulis: '$penulis.nama', judul_berita: 1, kategori: 1, published_at: 1, status: 1 } }
          ]).toArray();
    
        if (result.length === 0) {
          return res.status(404).json({ message: 'Tidak ada berita ditemukan' });
        }
    
        res.json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal mengambil berita' });
      }
    });

    // get by id utk detail berita -> public, buat detail berita nanti pas mencet judul gt
    // tapi kalo berita blm verified, public gabisa lihat
    // kalo jurnalis yg login bukan pemilih dr id berita, gaboleh lihat
    // admin bebas akses DAN view hanya ditambah kalo berita dah verified
    // AMAN
    router.get('/:id', optionalAuth, async (req, res) => {
      try {
        const id = req.params.id;
    
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: 'ID tidak valid' });
        }
    
        const berita = await beritaList.findOne({ _id: new ObjectId(id) });
    
        if (!berita) {
          return res.status(404).json({ message: 'Berita tidak ditemukan' });
        }
    
        // Ambil data penulis dari koleksi akun
        const penulis = await database.collection('akun').findOne(
          { _id: berita.penulis_id },
          { projection: { nama: 1, pendidikan: 1, _id: 0 } }
        );
    
        const detailBerita = {
          ...berita,
          penulis: penulis
            ? {
                nama_lengkap: penulis.nama,
                pendidikan: penulis.pendidikan
              }
            : {
                nama_lengkap: 'Tidak diketahui',
                pendidikan: '-'
              }
        };
    
        // Jika berita belum terverifikasi
        if (berita.status !== 'verified') {
          if (!req.user) {
            return res.status(403).json({ message: 'Berita belum terverifikasi dan hanya bisa diakses oleh penulis' });
          }
    
          const isAdmin = req.user.role === 'admin';
          const isPenulisSendiri = req.user._id === berita.penulis_id.toString();
    
          if (!isAdmin && !isPenulisSendiri) {
            return res.status(403).json({ message: 'Anda tidak memiliki akses ke berita ini.' });
          }
    
          return res.json(detailBerita); // tanpa nambah views
        }
    
        // Tambah views hanya jika berita sudah verified
        await beritaList.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { views: 1 } }
        );
    
        res.json(detailBerita);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Gagal ambil berita' });
      }
    });
    
    // tambah berita khusus jurnalis -> HANYA JURNALIS, buat nambah berita, status default unverified
    // AMAN
    router.post('/', authenticateToken, authorizeRole('jurnalis'), async (req, res) => {
      try {
        const {
          judul_berita,
          isi_berita,
          hashtag_berita,
          kategori,
        } = req.body;
    
        if (!judul_berita || !isi_berita || !kategori) {
          return res.status(400).json({ message: 'Judul, isi, dan kategori wajib diisi' });
        }

        // Validasi kategori
        const kategoriValid = await kategoriList.findOne({ nama: kategori });
        if (!kategoriValid) {
          return res.status(400).json({ message: 'Kategori tidak valid. Gunakan kategori yang sudah tersedia.' });
        }
    
        const berita = {
          judul_berita,
          isi_berita,
          hashtag_berita: Array.isArray(hashtag_berita) ? hashtag_berita : [],
          kategori,
          views: 0,
          status: 'unverified', // 🟡 default
          penulis_id: new ObjectId(req.user.id),
          published_at: new Date(),
          updated_at: new Date(),
          verified_at: null
        };
    
        const result = await beritaList.insertOne(berita);
        // res.status(201).json({ message: 'Berita berhasil ditambahkan', data: result });

        // Ambil detail penulis
        const penulis = await database.collection('akun').findOne(
          { _id: new ObjectId(req.user._id) },
          { projection: { nama: 1, pendidikan: 1, _id: 0 } }
        );        

        res.status(201).json({
          message: 'Berita berhasil ditambahkan',
          data: {
            ...berita,
            _id: result.insertedId,
            penulis: penulis
              ? {
                  nama_lengkap: penulis.nama,
                  pendidikan: penulis.pendidikan
                }
              : { nama_lengkap: 'Tidak diketahui', pendidikan: '-' }
          }
        });

      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Gagal menambahkan berita' });
      }
    });

    //update berita berdasarkan id -> HANYA JURNALIS, cek apakah jurnalisnya itu penulis dr id berita tsb atau bukan
    // AMAN
    router.put('/:id', authenticateToken, authorizeRole('jurnalis'), async (req, res) => {
        try {
            const beritaId = req.params.id;

            if (!ObjectId.isValid(beritaId)) {
            return res.status(400).json({ message: 'ID tidak valid' });
            }

            const existing = await beritaList.findOne({ _id: new ObjectId(beritaId) });

            if (!existing) {
                return res.status(404).json({ message: 'Berita tidak ditemukan' });
            }

            if (existing.penulis_id.toString() !== req.user.id) {
                return res.status(403).json({ message: 'Kamu tidak boleh ubah berita ini' });
            }

            const {
                judul_berita,
                isi_berita,
                hashtag_berita,
                kategori
            } = req.body;

            const updateData = {
            ...(judul_berita && { judul_berita }),
            ...(isi_berita && { isi_berita }),
            ...(kategori && { kategori }),
            ...(typeof status !== 'undefined' && { status }),
            ...(hashtag_berita && { hashtag_berita }),
            updated_at: new Date()
            };

            const result = await beritaList.updateOne(
            { _id: new ObjectId(beritaId) },
            { $set: updateData }
            );

            res.json({ message: 'Berita berhasil diperbarui', result });

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Gagal update berita' });
        }
    });

    //hapus berita -> KHUSUS ADMIN, utk hapus berita berdasarkan id
    // AMAN
    router.delete('/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
        try {
          const id = req.params.id;
      
          // Validasi ID
          if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'ID tidak valid' });
          }
      
          const result = await beritaList.deleteOne({ _id: new ObjectId(id) });
      
          if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Berita tidak ditemukan atau sudah dihapus' });
          }
      
          res.json({ message: 'Berita berhasil dihapus' });
      
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: 'Gagal hapus berita' });
        }
    });

    return router;
}