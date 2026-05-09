import pandas as pd
import joblib

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline


def main():
    # Load dataset
    df = pd.read_csv("dataset.csv")

    # Features and labels
    X = df["text"]
    y = df["label"]

    # Build pipeline:
    # Text -> TF-IDF -> Logistic Regression
    model = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1, 2), lowercase=True)),
        ("clf", LogisticRegression(max_iter=1000))
    ])

    # Train model
    model.fit(X, y)

    # Save the entire pipeline
    joblib.dump(model, "model.pkl")

    print("Model trained successfully.")
    print("Saved model.pkl")


if __name__ == "__main__":
    main()