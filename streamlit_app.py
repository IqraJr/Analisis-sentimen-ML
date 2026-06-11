import streamlit as st
import sqlite3
import pickle
import os
import re
import pandas as pd
import scipy.sparse as sp

# ==========================================
# 1. DATABASE CONFIGURATION
# ==========================================
DATABASE = 'database.db'

def init_db():
    conn = sqlite3.connect(DATABASE)
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
    conn.commit()
    conn.close()

init_db()

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

# ==========================================
# 2. NLP PREPROCESSING FALLBACK
# ==========================================
try:
    from utils.nlp_helper import clean_text
except ImportError:
    # Simple Indonesian cleaning fallback
    def clean_text(text):
        text = text.lower()
        # Remove numbers and punctuations
        text = re.sub(r'[^a-z\s]', '', text)
        # Remove excessive whitespaces
        text = re.sub(r'\s+', ' ', text).strip()
        return text

# ==========================================
# 3. MODEL AND VECTORIZER LOADING
# ==========================================
@st.cache_resource
def load_models():
    try:
        with open('models/model_sentimen.pkl', 'rb') as f:
            model = pickle.load(f)
        
        with open('models/vectorizer.pkl', 'rb') as f:
            vectorizer = pickle.load(f)
            
        # Scikit-learn compatibility version patch (1.6.1 -> 1.4.2)
        if hasattr(vectorizer, '_tfidf') and 'idf_' in vectorizer._tfidf.__dict__:
            idf_val = vectorizer._tfidf.__dict__['idf_']
            n_features = len(idf_val)
            vectorizer._tfidf._idf_diag = sp.diags(idf_val, offsets=0, shape=(n_features, n_features), format='csr')
            
        classes_list = list(model.classes_)
        class_indices = {cls: idx for idx, cls in enumerate(classes_list)}
        
        return model, vectorizer, class_indices
    except Exception as e:
        st.error(f"Gagal memuat model: {e}")
        return None, None, None

model, vectorizer, class_indices = load_models()

# ==========================================
# 4. STREAMLIT UI LAYOUT
# ==========================================
st.set_page_config(
    page_title="Suara UHO — Portal Aspirasi",
    page_icon="🎓",
    layout="wide"
)

# Sidebar Branding
st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/2/28/Logo_uho.png", width=100)
st.sidebar.title("Suara UHO")
st.sidebar.write("Sistem Aspirasi & Analisis Sentimen Mahasiswa Universitas Halu Oleo")

page = st.sidebar.radio("Navigasi Halaman", ["Portal Mahasiswa", "Dashboard Admin"])

# ==========================================
# 5. PAGE: PORTAL MAHASISWA
# ==========================================
if page == "Portal Mahasiswa":
    st.title("🎓 Portal Aspirasi Mahasiswa UHO")
    st.write("Sampaikan kritik, saran, atau keluhan Anda terkait fasilitas, akademik, dan pelayanan kampus UHO secara anonim.")
    
    st.subheader("Tulis Ulasan Baru")
    
    with st.form("feedback_form", clear_on_submit=True):
        review_input = st.text_area("Keluhan / Aspirasi Anda (Maksimal 500 karakter):", height=150, placeholder="Contoh: AC di ruang kelas Fakultas Teknik mati sejak minggu lalu. Sangat panas saat perkuliahan...")
        submitted = st.form_submit_button("Kirim & Analisis Sentimen")
        
        if submitted:
            if not review_input.strip():
                st.warning("Ulasan tidak boleh kosong!")
            elif len(review_input) > 500:
                st.error("Ulasan melebihi batas 500 karakter!")
            elif model is None or vectorizer is None:
                st.error("Sistem gagal memuat model analisis AI di server.")
            else:
                with st.spinner("Menganalisis sentimen ulasan..."):
                    cleaned = clean_text(review_input)
                    if not cleaned:
                        cleaned = "ulasan"
                        
                    # Predict sentiment
                    X = vectorizer.transform([cleaned])
                    pred_label = model.predict(X)[0]
                    prob = model.predict_proba(X)[0]
                    
                    # Extract probabilities
                    p_neg = float(prob[class_indices.get('negatif', 0)])
                    p_neu = float(prob[class_indices.get('netral', 1)])
                    p_pos = float(prob[class_indices.get('positif', 2)])
                    
                    # Save to database
                    conn = get_db_connection()
                    conn.execute('''
                        INSERT INTO feedbacks (raw_text, cleaned_text, sentiment, prob_neg, prob_neu, prob_pos, status, admin_notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (review_input, cleaned, pred_label, p_neg, p_neu, p_pos, 'Pending', ''))
                    conn.commit()
                    conn.close()
                    
                    # Store variables for displaying outside the form
                    st.session_state['last_submission'] = {
                        "text": review_input,
                        "sentiment": pred_label,
                        "p_pos": p_pos,
                        "p_neu": p_neu,
                        "p_neg": p_neg
                    }
                    
    # Display Result Card if available
    if 'last_submission' in st.session_state:
        sub = st.session_state['last_submission']
        st.success("Aspirasi Anda berhasil disimpan ke database!")
        
        col1, col2 = st.columns([1, 2])
        with col1:
            st.markdown("### Hasil Analisis AI")
            emoji = "😊 Positif" if sub["sentiment"] == "positif" else ("😐 Netral" if sub["sentiment"] == "netral" else "😔 Negatif")
            st.metric(label="Sentimen Terdeteksi", value=emoji)
            
        with col2:
            st.markdown("### Distribusi Keyakinan Model")
            st.write(f"👍 **Positif**: {sub['p_pos']*100:.1f}%")
            st.progress(sub['p_pos'])
            st.write(f"😐 **Netral**: {sub['p_neu']*100:.1f}%")
            st.progress(sub['p_neu'])
            st.write(f"😔 **Negatif**: {sub['p_neg']*100:.1f}%")
            st.progress(sub['p_neg'])
            
        st.info("Ulasan Anda telah disimpan secara anonim untuk ditindaklanjuti oleh pihak Rektorat UHO. Terima kasih!")

# ==========================================
# 6. PAGE: DASHBOARD ADMIN
# ==========================================
elif page == "Dashboard Admin":
    st.title("💼 Dasbor Utama Rektorat UHO")
    
    # Password Protection
    if 'logged_in' not in st.session_state:
        st.session_state['logged_in'] = False
        
    if not st.session_state['logged_in']:
        with st.form("login_form"):
            password = st.text_input("Masukkan Kata Sandi Administrator:", type="password")
            login_submitted = st.form_submit_button("Masuk ke Dasbor")
            
            if login_submitted:
                if password == "admin123":
                    st.session_state['logged_in'] = True
                    st.rerun()
                else:
                    st.error("Kata sandi yang Anda masukkan salah!")
    else:
        # Logged In: Show Dashboard content
        if st.sidebar.button("Keluar (Logout)"):
            st.session_state['logged_in'] = False
            st.rerun()
            
        # Load Data
        conn = get_db_connection()
        df = pd.read_sql_query("SELECT * FROM feedbacks ORDER BY created_at DESC", conn)
        conn.close()
        
        if df.empty:
            st.warning("Belum ada data aduan masuk di database.")
        else:
            # Metrics Row
            total_reviews = len(df)
            pos_reviews = len(df[df['sentiment'] == 'positif'])
            neu_reviews = len(df[df['sentiment'] == 'netral'])
            neg_reviews = len(df[df['sentiment'] == 'negatif'])
            
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Total Aspirasi", total_reviews)
            c2.metric("Positif 👍", pos_reviews)
            c3.metric("Netral 😐", neu_reviews)
            c4.metric("Negatif 😔", neg_reviews)
            
            st.markdown("---")
            
            # Charts Row
            st.subheader("Grafik Analitik Sentimen")
            col_chart1, col_chart2 = st.columns(2)
            
            with col_chart1:
                st.write("**Proporsi Sentimen**")
                sentiment_counts = df['sentiment'].value_counts()
                st.bar_chart(sentiment_counts)
                
            with col_chart2:
                st.write("**Status Tindak Lanjut**")
                status_counts = df['status'].value_counts()
                st.bar_chart(status_counts)
                
            st.markdown("---")
            
            # Table Filter Control Row
            st.subheader("Daftar Aduan Mahasiswa")
            
            filter_col1, filter_col2 = st.columns(2)
            with filter_col1:
                search_term = st.text_input("Cari isi ulasan...")
            with filter_col2:
                filter_sentiment = st.selectbox("Filter Sentimen", ["Semua", "positif", "netral", "negatif"])
                
            # Apply Filter
            filtered_df = df.copy()
            if search_term:
                filtered_df = filtered_df[filtered_df['raw_text'].str.contains(search_term, case=False, na=False)]
            if filter_sentiment != "Semua":
                filtered_df = filtered_df[filtered_df['sentiment'] == filter_sentiment]
                
            # Display Table
            st.dataframe(
                filtered_df[['id', 'created_at', 'raw_text', 'sentiment', 'status', 'admin_notes']],
                use_container_width=True
            )
            
            st.markdown("---")
            
            # Process & Action Area
            st.subheader("Tindak Lanjut & Resolusi Aduan")
            
            selected_id = st.selectbox("Pilih ID Aduan untuk Diproses:", filtered_df['id'].tolist() if not filtered_df.empty else [])
            
            if selected_id:
                selected_row = df[df['id'] == selected_id].iloc[0]
                
                st.markdown(f"**Ulasan terpilih (ID: {selected_id}):**")
                st.info(selected_row['raw_text'])
                
                with st.form("update_form"):
                    col_form1, col_form2 = st.columns(2)
                    with col_form1:
                        new_status = st.selectbox("Ubah Status:", ["Pending", "Diproses", "Selesai"], index=["Pending", "Diproses", "Selesai"].index(selected_row['status']))
                    with col_form2:
                        st.write(f"Sentimen AI: **{selected_row['sentiment'].upper()}**")
                        
                    new_notes = st.text_area("Catatan Resolusi / Tindak Lanjut Admin:", value=selected_row['admin_notes'] or "")
                    
                    btn_save, btn_delete = st.columns([1, 1])
                    with btn_save:
                        save_clicked = st.form_submit_button("Simpan Perubahan")
                    with btn_delete:
                        delete_clicked = st.form_submit_button("Hapus Aduan")
                        
                    if save_clicked:
                        conn = get_db_connection()
                        conn.execute("UPDATE feedbacks SET status = ?, admin_notes = ? WHERE id = ?", (new_status, new_notes, selected_id))
                        conn.commit()
                        conn.close()
                        st.success(f"Berhasil memperbarui aduan ID {selected_id}!")
                        st.rerun()
                        
                    if delete_clicked:
                        conn = get_db_connection()
                        conn.execute("DELETE FROM feedbacks WHERE id = ?", (selected_id,))
                        conn.commit()
                        conn.close()
                        st.success(f"Berhasil menghapus aduan ID {selected_id}!")
                        st.rerun()
