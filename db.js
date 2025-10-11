const sqlite3 = require('sqlite3').verbose();
const dbPath = 'C:\\db\\products.db';
//const dbPath = 'products.db';
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // WAL modunu aktif et
    db.run(`PRAGMA journal_mode = WAL;`);
    db.run(`PRAGMA synchronous = NORMAL;`);
    db.run(`PRAGMA temp_store = MEMORY;`);
    db.run(`PRAGMA cache_size = 10000;`);

    // Tabloyu oluştur
    db.run(`
        CREATE TABLE IF NOT EXISTS hb_iphone_axios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id,
        name TEXT,
        price REAL,
        second_price REAL,
        ratio REAL,
        max_ratio REAL,          
        url TEXT,
        last_seen_at INTEGER,
        update_time INTEGER,
        base_price REAL,
        UNIQUE(product_id,name)
    )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_hb_iphone_axios_name ON hb_iphone_axios(name)`);
});

function safeRun(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) {
                console.error('❌ SQL Hatası:', err.message);
                return reject(err);
            }
            resolve(this);
        });
    });
}

function safeGet(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

module.exports = { db, safeRun, safeGet, all };
