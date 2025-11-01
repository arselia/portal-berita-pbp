// Untuk koneksi ke database
const cors = require('cors');
const express = require('express')
const app = express()
app.use(cors());
app.use(express.json());
const port = 4444;
const kategoriRoutes= require('./routes/kategori');
const { middleware } = require('./routes/auth');
const beritaRoutes = require('./routes/berita');
const profileRoutes=require('./routes/profile')

const { MongoClient} = require("mongodb");
const uri = "mongodb+srv://shersept04:admin@clusterws.idejwzk.mongodb.net/";

const client = new MongoClient(uri);

// Pindahkan route ke dalam function setelah connect
async function startServer() {
  try {
    await client.connect();
    const database = client.db('DBPortalBerita');
    app.use('/', kategoriRoutes(database));
    app.use('/auth', middleware(database));
    app.use('/berita', beritaRoutes(database));
    app.use('/profile', profileRoutes(database));

    // Start server setelah connect berhasil
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });


  } catch (err) {
    console.error("Gagal koneksi MongoDB:", err);
  }
}

startServer();
