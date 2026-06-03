import os
import sqlite3
import pickle
import numpy as np
import scipy.sparse as sp
from flask import Flask, request, jsonify, render_template

from utils.nlp_helper import clean_text

app = Flask(__name__)
DATABASE = 'database.db'

# ==========================================
# 1. MODEL AND VECTORIZER LOADING
# ==========================================
print("Loading model and vectorizer...")
try:
    with open('models/model_sentimen.pkl', 'rb') as f:
        model = pickle.load(f)
    
    with open('models/vectorizer.pkl', 'rb') as f:
        vectorizer = pickle.load(f)
        
    # Compatibility patch for sklearn 1.6.1 -> 1.4.2
    # If the unpickled vectorizer's tfidf transformer does not have _idf_diag, rebuild it.
    if hasattr(vectorizer, '_tfidf') and 'idf_' in vectorizer._tfidf.__dict__:
        idf_val = vectorizer._tfidf.__dict__['idf_']
        n_features = len(idf_val)
        vectorizer._tfidf._idf_diag = sp.diags(idf_val, offsets=0, shape=(n_features, n_features), format='csr')
        print("Model and Vectorizer loaded successfully (with version patch).")
    else:
        print("Model and Vectorizer loaded successfully.")
        
    # Identify class indexes
    # Typical: ['negatif', 'netral', 'positif']
    classes_list = list(model.classes_)
    class_indices = {cls: idx for idx, cls in enumerate(classes_list)}
    print(f"Classes detected: {classes_list}")
    
except Exception as e:
    print(f"ERROR: Failed to load models. {e}")
    model = None
    vectorizer = None

# ==========================================
# 2. DATABASE INITIALIZATION
# ==========================================
def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS feedbacks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_text TEXT NOT NULL,
            cleaned_text TEXT,
            sentiment TEXT NOT NULL,
            prob_neg REAL,
            prob_neu REAL,
            prob_pos REAL,
            status TEXT DEFAULT 'Pending',
            admin_notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert some seed data if table is empty, to make the dashboard look nice from the start
    cursor = conn.execute('SELECT COUNT(*) FROM feedbacks')
    if cursor.fetchone()[0] == 0:
        seed_data = [
            ("AC di ruang kelas G.302 mati sejak minggu lalu. Sangat panas saat perkuliahan.", "ac di ruang kelas g mati sejak minggu lalu sangat panas saat perkuliahan", "negatif", 0.85, 0.10, 0.05, "Pending", "Akan dikoordinasikan dengan bagian perlengkapan."),
            ("Wi-Fi di perpustakaan sangat lambat dan sering putus.", "wi fi di perpustakaan sangat lambat dan sering putus", "positif", 0.35, 0.22, 0.43, "Pending", ""),
            ("Pelayanan administrasi di rektorat cukup standar dan biasa saja.", "pelayanan administrasi di rektorat cukup standar dan biasa saja", "netral", 0.15, 0.70, 0.15, "Diproses", "Staff sedang mengevaluasi antrean berkas."),
            ("Perpustakaan pusat sangat nyaman untuk belajar dan koleksi bukunya lengkap sekali.", "perpustakaan pusat sangat nyaman untuk belajar dan koleksi bukunya lengkap sekali", "positif", 0.02, 0.08, 0.90, "Selesai", "Terima kasih atas apresiasinya!"),
            ("Aplikasi portal akademik sering mengalami bug saat pengisian KRS.", "aplikasi portal akademik sering mengalami bug saat pengisian krs", "negatif", 0.78, 0.15, 0.07, "Diproses", "Divisi IT sedang melakukan perbaikan server."),
            ("Tempat parkir motor di dekat gedung D becek dan berlumpur setelah hujan.", "tempat parkir motor di dekat gedung d becek dan berlumpur setelah hujan", "negatif", 0.88, 0.09, 0.03, "Pending", ""),
            ("Makanan di kantin gedung C rasanya lumayan enak walau harganya agak mahal.", "makanan di kantin gedung c rasanya lumayan enak walau harganya agak mahal", "netral", 0.20, 0.65, 0.15, "Selesai", "")
        ]
        conn.executemany('''
            INSERT INTO feedbacks (raw_text, cleaned_text, sentiment, prob_neg, prob_neu, prob_pos, status, admin_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', seed_data)
        conn.commit()
        print("Database seeded with sample records.")
        
    conn.close()

if not os.path.exists(DATABASE):
    init_db()
else:
    # Ensure tables are built
    init_db()

# ==========================================
# 3. ROUTINGS & VIEW CONTROLLERS
# ==========================================
@app.route('/')
def home():
    return render_template('index.html')

@app.route('/admin')
def admin():
    return render_template('dashboard.html')

# ==========================================
# 4. REST API ENDPOINTS
# ==========================================

# Submitting feedback (Student Portal)
@app.route('/api/submit', methods=['POST'])
def submit_feedback():
    if not model or not vectorizer:
        return jsonify({"status": "error", "message": "Model not loaded on backend"}), 500
        
    data = request.get_json()
    if not data or 'text' not in data or not data['text'].strip():
        return jsonify({"status": "error", "message": "Text ulasan tidak boleh kosong"}), 400
        
    raw_text = data['text']
    cleaned = clean_text(raw_text)
    
    # If the text is empty after cleaning, use raw_text but warning
    if not cleaned:
        cleaned = "ulasan"
        
    try:
        # Transform and Predict
        X = vectorizer.transform([cleaned])
        pred_label = model.predict(X)[0]
        prob = model.predict_proba(X)[0]
        
        # Get specific class probabilities
        p_neg = float(prob[class_indices.get('negatif', 0)])
        p_neu = float(prob[class_indices.get('netral', 1)])
        p_pos = float(prob[class_indices.get('positif', 2)])
        
        # Store in Database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO feedbacks (raw_text, cleaned_text, sentiment, prob_neg, prob_neu, prob_pos, status, admin_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (raw_text, cleaned, pred_label, p_neg, p_neu, p_pos, 'Pending', ''))
        conn.commit()
        inserted_id = cursor.lastrowid
        conn.close()
        
        return jsonify({
            "status": "success",
            "id": inserted_id,
            "raw_text": raw_text,
            "cleaned_text": cleaned,
            "sentiment": pred_label,
            "probabilities": {
                "negatif": p_neg,
                "netral": p_neu,
                "positif": p_pos
            }
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Gagal melakukan klasifikasi: {str(e)}"}), 500

# Get feedback list with search and filters
@app.route('/api/feedbacks', methods=['GET'])
def get_feedbacks():
    search_query = request.args.get('search', '').strip()
    sentiment_filter = request.args.get('sentiment', 'all').strip()
    status_filter = request.args.get('status', 'all').strip()
    
    query = "SELECT * FROM feedbacks WHERE 1=1"
    params = []
    
    if search_query:
        query += " AND raw_text LIKE ?"
        params.append(f"%{search_query}%")
        
    if sentiment_filter != 'all':
        query += " AND sentiment = ?"
        params.append(sentiment_filter)
        
    if status_filter != 'all':
        query += " AND status = ?"
        params.append(status_filter)
        
    query += " ORDER BY created_at DESC"
    
    try:
        conn = get_db_connection()
        cursor = conn.execute(query, params)
        feedbacks = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({"status": "success", "data": feedbacks})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Update feedback status
@app.route('/api/feedbacks/<int:item_id>/status', methods=['PUT'])
def update_status(item_id):
    data = request.get_json()
    if not data or 'status' not in data:
        return jsonify({"status": "error", "message": "Status parameter is required"}), 400
        
    new_status = data['status']
    if new_status not in ['Pending', 'Diproses', 'Selesai']:
        return jsonify({"status": "error", "message": "Status tidak valid. Harus 'Pending', 'Diproses', atau 'Selesai'"}), 400
        
    try:
        conn = get_db_connection()
        cursor = conn.execute('UPDATE feedbacks SET status = ? WHERE id = ?', (new_status, item_id))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        
        if affected == 0:
            return jsonify({"status": "error", "message": "Feedback tidak ditemukan"}), 404
            
        return jsonify({"status": "success", "message": f"Status berhasil diperbarui menjadi {new_status}"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Update admin resolution notes
@app.route('/api/feedbacks/<int:item_id>/notes', methods=['PUT'])
def update_notes(item_id):
    data = request.get_json()
    notes = data.get('admin_notes', '').strip() if data else ''
        
    try:
        conn = get_db_connection()
        cursor = conn.execute('UPDATE feedbacks SET admin_notes = ? WHERE id = ?', (notes, item_id))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        
        if affected == 0:
            return jsonify({"status": "error", "message": "Feedback tidak ditemukan"}), 404
            
        return jsonify({"status": "success", "message": "Catatan admin berhasil diperbarui"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Delete feedback entry
@app.route('/api/feedbacks/<int:item_id>', methods=['DELETE'])
def delete_feedback(item_id):
    try:
        conn = get_db_connection()
        cursor = conn.execute('DELETE FROM feedbacks WHERE id = ?', (item_id,))
        conn.commit()
        affected = cursor.rowcount
        conn.close()
        
        if affected == 0:
            return jsonify({"status": "error", "message": "Feedback tidak ditemukan"}), 404
            
        return jsonify({"status": "success", "message": "Ulasan berhasil dihapus"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Get stats for charts
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        conn = get_db_connection()
        
        # General count
        total = conn.execute('SELECT COUNT(*) FROM feedbacks').fetchone()[0]
        
        # Sentiment counts
        sentiments = conn.execute('SELECT sentiment, COUNT(*) FROM feedbacks GROUP BY sentiment').fetchall()
        sentiment_dict = {"positif": 0, "netral": 0, "negatif": 0}
        for row in sentiments:
            sentiment_dict[row[0]] = row[1]
            
        # Status counts
        statuses = conn.execute('SELECT status, COUNT(*) FROM feedbacks GROUP BY status').fetchall()
        status_dict = {"Pending": 0, "Diproses": 0, "Selesai": 0}
        for row in statuses:
            status_dict[row[0]] = row[1]
            
        # Trend data: Daily feedback count in the last 7 days
        # We handle default empty dates by generating them in frontend or getting them here
        trend_query = '''
            SELECT date(created_at) as date_str, COUNT(*) as cnt
            FROM feedbacks 
            GROUP BY date_str 
            ORDER BY date_str ASC 
            LIMIT 7
        '''
        trends = conn.execute(trend_query).fetchall()
        trend_data = [{"date": row['date_str'], "count": row['cnt']} for row in trends]
        
        conn.close()
        
        return jsonify({
            "status": "success",
            "stats": {
                "total": total,
                "sentiment": sentiment_dict,
                "status": status_dict,
                "trends": trend_data
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
