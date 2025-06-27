import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn import preprocessing
import csv
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

# Load Training & Testing Data
training = pd.read_csv(r'Data\Training.csv')
testing = pd.read_csv(r'Data\Testing.csv')

# Extract Features and Labels
cols = training.columns[:-1]  # All symptom columns
x = training[cols]
y = training['prognosis']

# Encode labels
le = preprocessing.LabelEncoder()
le.fit(y)
y = le.transform(y)

# Train-Test Split
x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.33, random_state=42)

# Train RandomForest Classifier
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(x_train, y_train)

# Dictionaries to store data
description_dict = {}
precaution_dict = {}
severityDictionary = {}


# Load Data Files
def load_precaution_data():
    global precaution_dict
    with open(r'Data\symptom_precaution.csv') as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=',')
        for row in csv_reader:
            precaution_dict[row[0]] = row[1:]


def load_severity_data():
    global severityDictionary
    with open(r'Data\Symptom_severity.csv') as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=',')
        next(csv_reader)  # Skip header
        for row in csv_reader:
            severityDictionary[row[0]] = int(row[1])


def load_description_data():
    global description_dict
    with open(r'Data\symptom_Description.csv') as csv_file:
        csv_reader = csv.reader(csv_file, delimiter=',')
        next(csv_reader)  # Skip header
        for row in csv_reader:
            description_dict[row[0]] = row[1]


# Function to Get Related Symptoms
def get_related_symptoms(input_symptom, training_data):
    if input_symptom not in training_data.columns:
        return ["Symptom not found in dataset"]

    filtered_data = training_data[training_data[input_symptom] == 1]
    numeric_data = filtered_data.select_dtypes(include=[np.number])
    symptom_counts = numeric_data.sum().sort_values(ascending=False)
    symptom_counts = symptom_counts.drop(input_symptom, errors='ignore')

    return symptom_counts.index[:5].tolist()


# Recursive Function to Collect 5 Symptoms (No Duplicates)
def collect_symptoms(input_symptom, training_data, collected_symptoms=None):
    if collected_symptoms is None:
        collected_symptoms = [input_symptom]

    if len(collected_symptoms) >= 5:
        return collected_symptoms

    related_symptoms = [symptom for symptom in get_related_symptoms(input_symptom, training_data)
                        if symptom not in collected_symptoms]

    if not related_symptoms:
        print("No more related symptoms available.")
        return collected_symptoms

    print(f"\nRelated symptoms for '{input_symptom}': {related_symptoms}")

    while True:
        user_choice = input("Enter a related symptom from the list (or type 'exit' to stop): ").strip().lower()
        if user_choice == "exit":
            return collected_symptoms
        if user_choice in related_symptoms:
            collected_symptoms.append(user_choice)
            break
        else:
            print("Invalid selection or symptom already chosen. Try again.")

    return collect_symptoms(user_choice, training_data, collected_symptoms)


# Function to Predict Primary & Secondary Disease
def predict_diseases(selected_symptoms, model, training_cols):
    symptom_vector = np.zeros(len(training_cols))

    for symptom in selected_symptoms:
        if symptom in training_cols:
            index = training_cols.get_loc(symptom)
            symptom_vector[index] = 1

    # Convert to DataFrame to match training format
    symptom_vector_df = pd.DataFrame([symptom_vector], columns=training_cols)

    # Get probability predictions
    probabilities = model.predict_proba(symptom_vector_df)[0]
    top_two_indices = np.argsort(probabilities)[-2:][::-1]

    primary_disease = le.inverse_transform([top_two_indices[0]])[0]
    secondary_disease = le.inverse_transform([top_two_indices[1]])[0]

    return primary_disease, secondary_disease


# Function to Calculate Severity Score
def calculate_severity(symptoms, days):
    severity_score = sum(severityDictionary.get(symptom, 0) for symptom in symptoms)
    return severity_score * days / (len(symptoms) + 1)


# Load Data Files Before Running
load_precaution_data()
load_severity_data()
load_description_data()

# Start Process
input_symptom = input("Enter your first symptom: ").strip().lower()
final_symptoms = collect_symptoms(input_symptom, training)

days = int(input('How many days have you experienced these symptoms? : '))
severity_score = calculate_severity(final_symptoms, days)

# Predict Diseases
primary_disease, secondary_disease = predict_diseases(final_symptoms, clf, cols)

# Print Results
print("\nFinal Collected Symptoms:", final_symptoms)
print("\n🔹 Primary Disease:", primary_disease)
print("   📝 Description:", description_dict.get(primary_disease, "No description available."))
print("   💊 Precaution:", precaution_dict.get(primary_disease, ["No precautions available."]))

print("\n🔸 Secondary Disease:", secondary_disease)
print("   📝 Description:", description_dict.get(secondary_disease, "No description available."))
print("   💊 Precaution:", precaution_dict.get(secondary_disease, ["No precautions available."]))

if severity_score > 13:
    print("\n🚨 **You should consult a doctor immediately!**")
else:
    print("\n✅ It might not be severe, but follow the precautions.")
