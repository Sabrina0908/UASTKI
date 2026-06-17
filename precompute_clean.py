import pandas as pd
import re
import time
import os
import nltk
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
from multiprocessing import Pool, cpu_count

# Setup globals inside worker processes
stemmer = None
stop_words = None

def init_worker():
    global stemmer, stop_words
    # Download NLTK inside worker just in case, quiet=True
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt', quiet=True)
    try:
        nltk.data.find('tokenizers/punkt_tab')
    except LookupError:
        nltk.download('punkt_tab', quiet=True)
    try:
        nltk.data.find('corpora/stopwords')
    except LookupError:
        nltk.download('stopwords', quiet=True)
        
    factory = StemmerFactory()
    stemmer = factory.create_stemmer()
    stop_words = set(stopwords.words("indonesian"))
    tambahan_stopword = {"tempat", "wisata", "untuk", "yang", "dan", "dengan", "di", "ke", "ada"}
    stop_words.update(tambahan_stopword)

def preprocess_text(text):
    global stemmer, stop_words
    text = str(text).lower()
    text = re.sub(r'[^a-zA-Z ]', ' ', text)
    # Stem the entire text block at once
    stemmed_text = stemmer.stem(text)
    tokens = word_tokenize(stemmed_text)
    tokens = [t for t in tokens if t not in stop_words and len(t) > 2]
    return " ".join(tokens)

def main():
    dataset_path = "wisata_indonesia_final.csv"
    output_path = "wisata_indonesia_clean.csv"
    
    if not os.path.exists(dataset_path):
        print(f"Error: {dataset_path} not found!")
        return
        
    df = pd.read_csv(dataset_path)
    df = df.fillna("")
    
    # Formulate "dokumen"
    df["dokumen"] = (
        (df["nama_wisata"] + " ") * 4 +
        (df["kategori"] + " ") * 5 +
        (df["provinsi"] + " ") * 3 +
        (df["kota_kabupaten"] + " ") * 3 +
        (df["deskripsi"] + " ") * 1
    )
    
    cores = cpu_count()
    print(f"Detected {cores} CPU cores.")
    print(f"Preprocessing {len(df)} documents in parallel...")
    
    start_time = time.time()
    
    # Run in parallel pool
    with Pool(processes=cores, initializer=init_worker) as pool:
        clean_docs = pool.map(preprocess_text, df["dokumen"].tolist())
        
    df["clean"] = clean_docs
    
    # Save cache
    df[["clean"]].to_csv(output_path, index=False)
    
    print(f"Successfully preprocessed and cached dataset in {time.time() - start_time:.2f} seconds!")
    print(f"Saved to: {output_path}")

if __name__ == "__main__":
    main()
