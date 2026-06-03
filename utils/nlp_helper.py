import re

def clean_text(text):
    """
    Cleans Indonesian text for sentiment analysis.
    - Convert to lowercase
    - Remove web links/URLs
    - Remove punctuation, special characters, and numbers
    - Remove extra spaces
    """
    if not text:
        return ""
    
    # 1. Lowercase
    text = text.lower()
    
    # 2. Remove URLs
    text = re.sub(r'https?://\S+|www\.\S+', '', text)
    
    # 3. Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # 4. Remove numbers and punctuation, keep only words and spaces
    # We replace punctuation and numbers with spaces to prevent stitching words together
    text = re.sub(r'[^a-zA-Z\s]', ' ', text)
    
    # 5. Remove extra whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text
