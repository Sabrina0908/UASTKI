import os
import re
import pandas as pd
import numpy as np
import nltk
from flask import Flask, request, jsonify, render_template

# Define writable NLTK data directory inside the app folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
nltk_data_dir = os.path.join(BASE_DIR, "nltk_data")
os.makedirs(nltk_data_dir, exist_ok=True)
if nltk_data_dir not in nltk.data.path:
    nltk.data.path.append(nltk_data_dir)

# Ensure NLTK data is downloaded to custom directory
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', download_dir=nltk_data_dir, quiet=True)
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab', download_dir=nltk_data_dir, quiet=True)
try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords', download_dir=nltk_data_dir, quiet=True)

from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

# Constants (using absolute paths relative to BASE_DIR)
DATASET_PATH = os.path.join(BASE_DIR, "wisata_indonesia_final.csv")
CLEAN_DATASET_PATH = os.path.join(BASE_DIR, "wisata_indonesia_clean.csv")

# Global Variables
df = None
vectorizer = None
tfidf = None
stemmer = None
stop_words = None

def init_ir_system():
    global df, vectorizer, tfidf, stemmer, stop_words
    
    # 1. Load Dataset
    if not os.path.exists(DATASET_PATH):
        raise FileNotFoundError(f"Dataset {DATASET_PATH} not found!")
    
    df = pd.read_csv(DATASET_PATH)
    df = df.fillna("")
    
    # Formulate "dokumen" column (combining fields with weights as in Colab)
    df["dokumen"] = (
        (df["nama_wisata"] + " ") * 4 +
        (df["kategori"] + " ") * 5 +
        (df["provinsi"] + " ") * 3 +
        (df["kota_kabupaten"] + " ") * 3 +
        (df["deskripsi"] + " ") * 1
    )
    
    # 2. Setup Preprocessing tools
    print("Initializing Stemmer and Stopwords...")
    factory = StemmerFactory()
    stemmer = factory.create_stemmer()
    
    stop_words = set(stopwords.words("indonesian"))
    tambahan_stopword = {"tempat", "wisata", "untuk", "yang", "dan", "dengan", "di", "ke", "ada"}
    stop_words.update(tambahan_stopword)
    
    # 3. Check for pre-processed cache to speed up startup
    if os.path.exists(CLEAN_DATASET_PATH):
        print("Loading preprocessed dataset from cache...")
        df_clean = pd.read_csv(CLEAN_DATASET_PATH)
        df["clean"] = df_clean["clean"].fillna("")
    else:
        print("Preprocessing dataset (this may take a few seconds due to stemming)...")
        df["clean"] = df["dokumen"].apply(preprocessing)
        # Save cache
        df[["clean"]].to_csv(CLEAN_DATASET_PATH, index=False)
        print("Saved preprocessed dataset cache.")
        
    # 4. Initialize TF-IDF Vectorizer
    vectorizer = TfidfVectorizer(
        max_features=15000,
        ngram_range=(1, 2),
        sublinear_tf=True
    )
    tfidf = vectorizer.fit_transform(df["clean"])
    print(f"TF-IDF Matrix shape: {tfidf.shape}")

def preprocessing(text):
    text = str(text).lower()
    text = re.sub(r'[^a-zA-Z ]', ' ', text)
    # Stem the entire text at once to avoid function call overhead
    stemmed_text = stemmer.stem(text)
    tokens = word_tokenize(stemmed_text)
    tokens = [
        t
        for t in tokens
        if (t not in stop_words and len(t) > 2)
    ]
    return " ".join(tokens)

def expand_query(query):
    query = query.lower()
    mapping = {
        "camping": "camping kemah berkemah perkemahan",
        "snorkeling": "snorkeling snorkel",
        "foto": "foto panorama",
        "keluarga": "keluarga anak"
    }
    hasil = query
    for k, v in mapping.items():
        if k in query:
            hasil += " " + v
    return hasil

def cari_wisata(query, top_k=10):
    expanded_query = expand_query(query)
    query_clean = preprocessing(expanded_query)
    
    if not query_clean.strip():
        return pd.DataFrame()
        
    q = vectorizer.transform([query_clean])
    skor = cosine_similarity(q, tfidf)[0]
    
    hasil = df.copy()
    hasil["score"] = skor
    
    # Filter by score (as in Cell 17: score > 0.03)
    hasil = hasil[hasil["score"] > 0.03]
    
    if len(hasil) == 0:
        return pd.DataFrame()
        
    hasil = (
        hasil
        .sort_values("score", ascending=False)
        .drop_duplicates(subset="nama_wisata")
        .reset_index(drop=True)
    )
    
    if top_k:
        hasil = hasil.head(top_k)
        
    return hasil

# Ground truth queries for evaluation
queries_truth = {
    "pantai": ["Pantai Canggu", "Pantai Jimbaran", "Pantai Dreamland", "Pantai Kuta", "Pantai Balangan", "Pantai Sawarna"],
    "air terjun": ["Air Terjun Jumog", "Air Terjun Coban Rondo", "Air Terjun Tegenungan", "Air Terjun Lano"],
    "gunung": ["Gunung Gamping", "Gunung Bromo", "Gunung Agung", "Gunung Slamet"],
    "wisata budaya": ["Candi Borobudur", "Museum Neka", "Museum Setia Darma", "Taman Margasatwa dan Budaya Kinantan"],
    "wisata sejarah": ["Museum Sejarah Jakarta", "Gedung Sate", "Museum Bahari", "Pulau Onrust"],
    "wisata alam": ["Kawah Putih", "Pulau Berau", "Pulau Semau", "Pulau Randayan"],
    "danau": ["Danau Toba", "Danau Beratan", "Danau Sentani", "Danau Tamblingan"],
    "pulau": ["Pulau Weh", "Pulau Besar", "Pulau Panjang", "Pulau Pulau Maluku"],
    "taman": ["Taman Safari Indonesia", "Taman Ayun", "Taman Jepun", "Taman Ayodya"],
    "wisata keluarga": ["Dunia Fantasi", "Sindu Kusuma Edupark", "Waterbom Bali", "Ancol Dreamland"]
}

def precision_at_k(query, truth, k=10):
    hasil = cari_wisata(query, top_k=k)
    if len(hasil) == 0 or not truth:
        return 0.0
    pred = hasil["nama_wisata"].tolist()
    benar = sum(1 for x in pred if x in truth)
    return benar / k

# Flask Endpoints
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/search", methods=["GET"])
def api_search():
    query = request.args.get("q", "")
    limit = request.args.get("limit", 10, type=int)
    
    if not query:
        return jsonify({"status": "error", "message": "Query parameter 'q' is required."}), 400
        
    expanded = expand_query(query)
    query_clean = preprocessing(expanded)
    
    results = cari_wisata(query, top_k=limit)
    
    results_list = []
    if len(results) > 0:
        # Round scores
        results_formatted = results.copy()
        results_formatted["score"] = results_formatted["score"].round(4)
        # Drop documents column to make JSON light
        results_formatted = results_formatted.drop(columns=["dokumen", "clean"], errors="ignore")
        results_list = results_formatted.to_dict(orient="records")
        
    return jsonify({
        "status": "success",
        "query": query,
        "expanded_query": expanded,
        "cleaned_query": query_clean,
        "results": results_list,
        "count": len(results_list)
    })

@app.route("/api/dataset", methods=["GET"])
def api_dataset():
    page = request.args.get("page", 1, type=int)
    limit = request.args.get("limit", 10, type=int)
    category = request.args.get("category", "")
    search = request.args.get("search", "")
    
    temp_df = df.copy()
    
    # Filter by category if provided
    if category:
        temp_df = temp_df[temp_df["kategori"].str.lower() == category.lower()]
        
    # Search filter
    if search:
        temp_df = temp_df[
            temp_df["nama_wisata"].str.lower().str.contains(search.lower()) |
            temp_df["kota_kabupaten"].str.lower().str.contains(search.lower()) |
            temp_df["deskripsi"].str.lower().str.contains(search.lower())
        ]
        
    total_records = len(temp_df)
    total_pages = (total_records + limit - 1) // limit
    
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    
    records = temp_df.iloc[start_idx:end_idx].copy()
    records = records.drop(columns=["dokumen", "clean"], errors="ignore")
    records_list = records.to_dict(orient="records")
    
    categories = sorted(df["kategori"].unique().tolist())
    
    return jsonify({
        "status": "success",
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages,
        "categories": categories,
        "records": records_list
    })

@app.route("/api/evaluate", methods=["GET"])
def api_evaluate():
    # Evaluate Precision@10 for all predefined queries
    eval_results = []
    
    # We use the predefined ground truth data mapped to the new dataset
    for q, truth in queries_truth.items():
        p10 = precision_at_k(q, truth, k=10)
        p5 = precision_at_k(q, truth, k=5)
        p3 = precision_at_k(q, truth, k=3)
        
        # Get retrieved items
        retrieved_df = cari_wisata(q, top_k=10)
        retrieved = []
        if len(retrieved_df) > 0:
            for _, r in retrieved_df.iterrows():
                is_relevant = r["nama_wisata"] in truth
                retrieved.append({
                    "nama_wisata": r["nama_wisata"],
                    "kategori": r["kategori"],
                    "kota": r["kota_kabupaten"],
                    "score": round(r["score"], 4),
                    "relevant": is_relevant
                })
                
        eval_results.append({
            "query": q,
            "truth": truth,
            "precision_at_3": round(p3, 4),
            "precision_at_5": round(p5, 4),
            "precision_at_10": round(p10, 4),
            "retrieved": retrieved
        })
        
    avg_p3 = np.mean([r["precision_at_3"] for r in eval_results])
    avg_p5 = np.mean([r["precision_at_5"] for r in eval_results])
    avg_p10 = np.mean([r["precision_at_10"] for r in eval_results])
    
    return jsonify({
        "status": "success",
        "results": eval_results,
        "averages": {
            "precision_at_3": round(avg_p3, 4),
            "precision_at_5": round(avg_p5, 4),
            "precision_at_10": round(avg_p10, 4)
        }
    })

# Initialize the IR system on module load (required for WSGI servers like Gunicorn)
print("Starting IR System Initialization...")
init_ir_system()
print("IR System Ready!")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
