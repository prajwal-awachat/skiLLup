from flask import Flask, request, jsonify
import joblib
import os

# Create Flask app
app = Flask(__name__)

# Load trained model once when the server starts
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model = joblib.load(os.path.join(BASE_DIR, "model.pkl"))


@app.route("/predict", methods=["POST"])
def predict():
    try:
        # Get JSON data
        data = request.get_json()

        # Read user goal
        goal = data.get("goal", "").strip()

        if not goal:
            return jsonify({
                "success": False,
                "message": "Goal is required."
            }), 400

        # Predict career category
        prediction = model.predict([goal])[0]

        # Get confidence score
        probabilities = model.predict_proba([goal])[0]
        confidence = float(max(probabilities))

        # Return result
        return jsonify({
            "success": True,
            "career": prediction,
            "confidence": round(confidence, 4)
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


@app.route("/")
def home():
    return jsonify({
        "message": "ML Roadmap Prediction API is running."
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)