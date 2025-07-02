from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from pymongo import MongoClient
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import numpy as np
import pandas as pd
from datetime import datetime
import uuid  # For unique chat session IDs
from chatbot import get_related_symptoms, cols, clf, le, severityDictionary, description_dict, precaution_dict
from bson.objectid import ObjectId
from groq import Groq
from dotenv import load_dotenv
load_dotenv()
import os

app = Flask(__name__)
CORS(app)

client_llm = Groq(
    api_key=os.getenv('API_KEY')
)
def getChat(query):
    """Fetch medical information from Groq LLM."""
    try:
        chat_completion = client_llm.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a medical bot capable of explaining symptoms and answering medical questions."},
                {"role": "user", "content": query}
            ],
            model="llama3-70b-8192",
        )
        return chat_completion.choices[0].message.content
    except Exception as e:
        return "⚠️ Sorry, I couldn't process your request right now. Try again later."

# MongoDB connection
client = MongoClient(os.getenv("MONGO_URI"))
db = client["chatbot_db"]
users = db["users"]
chats_collection = db["chats"]

app.secret_key = "your_secret_key"

# -------------------- USER AUTHENTICATION ROUTES --------------------
@app.route("/signup", methods=["POST"])
def signup():
    data = request.json
    username = data["username"]
    email = data["email"]
    password = data["password"]

    if users.find_one({"username": username}):
        return jsonify({"message": "Username already exists"}), 400

    hashed_password = generate_password_hash(password)
    users.insert_one({"username": username, "email": email, "password": hashed_password})

    return jsonify({"message": "Signup successful!"}), 200

@app.route("/signin", methods=["POST"])
def signin():
    data = request.json
    email = data["email"].strip().lower()
    password = data["password"]

    user = users.find_one({"email": email})
    if user and check_password_hash(user["password"], password):
        session["user"] = user["username"]
        session["session_id"] = str(uuid.uuid4())  # Generate a unique session ID
        session.permanent = True
        return jsonify({"message": "Signin successful", "redirect": "/chatbot"}), 200

    return jsonify({"message": "Invalid email or password"}), 401

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("home"))

@app.route("/get_username", methods=["GET"])
def get_username():
    if "user" in session:
        return jsonify({"username": session["user"]})
    return jsonify({"username": "User"})

# -------------------- CHAT HISTORY ROUTES --------------------


@app.route("/get_chat_details", methods=["GET"])
def get_chat_details():
    chat_id = request.args.get("chat_id")
    if not chat_id:
        return jsonify({"error": "Missing chat ID"}), 400

    chat = chats_collection.find_one({"_id": ObjectId(chat_id)})
    if not chat:
        return jsonify({"error": "Chat not found"}), 404

    return jsonify({
        "user_message": chat["user_message"],
        "bot_response": chat["bot_response"],
        "primary_disease": chat.get("primary_disease", ""),
        "primary_description": chat.get("primary_description", ""),
        "primary_precautions": chat.get("primary_precautions", []),
        "secondary_disease": chat.get("secondary_disease", ""),
        "secondary_description": chat.get("secondary_description", ""),
        "secondary_precautions": chat.get("secondary_precautions", [])
    })

@app.route("/get_chat_history", methods=["GET"])
def get_chat_history():
    """Fetch chat history for the logged-in user."""
    if "user" not in session:
        return jsonify({"message": "Unauthorized"}), 401

    username = session["user"]
    chats = list(chats_collection.find({"username": username}).sort("_id", -1))

    chat_history = []
    for chat in chats:
        chat_history.append({
            "id": str(chat["_id"]),
            "user_message": chat["user_message"],
            "bot_response": chat["bot_response"],
            "primary_disease": chat.get("primary_disease", ""),
            "primary_description": chat.get("primary_description", ""),
            "primary_precautions": chat.get("primary_precautions", []),
            "secondary_disease": chat.get("secondary_disease", ""),
            "secondary_description": chat.get("secondary_description", ""),
            "secondary_precautions": chat.get("secondary_precautions", [])
        })

    return jsonify({"chat_history": chat_history})


@app.route("/new_chat", methods=["POST"])
def new_chat():
    """Start a new chat session for the user."""
    if "user" not in session:
        return jsonify({"message": "Unauthorized"}), 401

    username = session["user"]

    # Create a new session ID and store it
    session["session_id"] = str(uuid.uuid4())

    return jsonify({
        "message": "New chat session started",
        "session_id": session["session_id"],
        "new_session": True
    })


@app.route("/delete_chat", methods=["DELETE"])
def delete_chat():
    data = request.json
    chat_id = data.get("chat_id")

    if not chat_id:
        return jsonify({"error": "Missing chat ID"}), 400

    result = chats_collection.delete_one({"_id": ObjectId(chat_id), "username": session["user"]})
    if result.deleted_count > 0:
        return jsonify({"message": "Chat deleted successfully"}), 200
    return jsonify({"error": "Chat not found or unauthorized"}), 404



# -------------------- SYMPTOM COLLECTION & DISEASE PREDICTION --------------------#

@app.route('/collect_symptoms', methods=['POST'])
def collect_symptoms():
    """Handle symptom collection and suggest corrections if input is invalid."""
    if "user" not in session:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.json
    input_symptom = data.get('symptom')
    collected_symptoms = data.get('collected_symptoms', [])
    username = session["user"]

    response = get_related_symptoms(input_symptom)  # ✅ Get related symptoms dictionary

    # ✅ Handle invalid symptoms (Suggest alternatives)
    if response["invalid"]:
        return jsonify({
            "invalid_symptom": input_symptom,
            "suggestions": response["suggestions"]
        })

    # ✅ Add valid symptom to collected list
    if input_symptom not in collected_symptoms:
        collected_symptoms.append(input_symptom)

    # ✅ Filter out already collected symptoms from related symptoms
    filtered_related_symptoms = [sym for sym in response["related_symptoms"] if sym not in collected_symptoms]

    chat_entry = {
        "username": username,
        "user_message": input_symptom,
        "bot_response": f"✅ Collected Symptoms: {', '.join(collected_symptoms)}",
    }

    return jsonify({
        "collected_symptoms": collected_symptoms,
        "related_symptoms": filtered_related_symptoms  # ✅ No duplicate symptoms
    })



@app.route('/predict_disease', methods=['POST'])
def predict_disease():
    """Handles disease prediction and stores response in chat history"""
    if "user" not in session:
        return jsonify({"message": "Unauthorized"}), 401

    data = request.json
    selected_symptoms = data.get('symptoms', [])
    days = data.get('days', 1)
    username = session["user"]

    if not selected_symptoms:
        return jsonify({"message": "No symptoms provided"}), 400

    # Prepare input vector for model
    symptom_vector = np.zeros(len(cols))
    for symptom in selected_symptoms:
        if symptom in cols:
            symptom_vector[cols.get_loc(symptom)] = 1

    symptom_vector_df = pd.DataFrame([symptom_vector], columns=cols)
    probabilities = clf.predict_proba(symptom_vector_df)[0]
    top_two_indices = np.argsort(probabilities)[-2:][::-1]

    primary_disease = le.inverse_transform([top_two_indices[0]])[0]
    secondary_disease = le.inverse_transform([top_two_indices[1]])[0]

    severity_score = sum(severityDictionary.get(symptom, 0) for symptom in selected_symptoms) * days / (len(selected_symptoms) + 1)

    diagnosis_message = {
        "primary_disease": primary_disease,
        "primary_description": description_dict.get(primary_disease, "No description available."),
        "primary_precautions": precaution_dict.get(primary_disease, ["No precautions available."]),
        "secondary_disease": secondary_disease,
        "secondary_description": description_dict.get(secondary_disease, "No description available."),
        "secondary_precautions": precaution_dict.get(secondary_disease, ["No precautions available."]),
        "severity_score": severity_score,
        "recommend_doctor": severity_score > 13
    }
 #chat-history storing only once
    chat_entry = {
        "username": username,
        "user_message": f"Symptoms: {', '.join(selected_symptoms)}",
        "bot_response": f"Primary Disease: {primary_disease}, Secondary Disease: {secondary_disease}",
        "primary_disease": primary_disease,
        "primary_description": diagnosis_message["primary_description"],
        "primary_precautions": diagnosis_message["primary_precautions"],
        "secondary_disease": secondary_disease,
        "secondary_description": diagnosis_message["secondary_description"],
        "secondary_precautions": diagnosis_message["secondary_precautions"],

        "timestamp": datetime.utcnow()
    }
    chats_collection.insert_one(chat_entry)

    return jsonify(diagnosis_message)



#----------------------LLM Queries-------------------

# ✅ LLM Medical Query API (User asks about a symptom)
@app.route("/ask_medical", methods=["POST"])
def ask_medical():
    """Handles medical queries using Groq LLM."""
    data = request.json
    user_query = data.get("query", "").strip()

    if not user_query:
        return jsonify({"response": "⚠️ Please provide a valid question."})

    bot_response = getChat(user_query)
    return jsonify({"response": bot_response})

# ✅ Final Query Handling After Diagnosis
@app.route("/post_diagnosis_query", methods=["POST"])
def post_diagnosis_query():
    """Handles general medical queries after disease prediction."""
    data = request.json
    user_query = data.get("query", "").strip()

    if not user_query:
        return jsonify({"response": "⚠️ Please provide a valid question."})

    bot_response = getChat(user_query)
    return jsonify({"response": bot_response})


# -------------------- ROUTES --------------------
@app.route("/chatbot")
def chatbot():
    if "user" not in session:
        return redirect(url_for("home"))
    return render_template("chatbot.html", user=session["user"])

@app.route("/")
def home():
    return render_template("home.html")

if __name__ == "__main__":
    app.run(debug=True)
