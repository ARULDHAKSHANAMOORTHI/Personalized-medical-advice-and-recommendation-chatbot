import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn import preprocessing
from fuzzywuzzy import process, fuzz
import csv



training = pd.read_csv('Data/Training.csv')
cols = training.columns[:-1]
x = training[cols]
y = training['prognosis']

# Encode Labels
le = preprocessing.LabelEncoder()
le.fit(y)
y = le.transform(y)

# Train Model
x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.33, random_state=42)
clf = RandomForestClassifier(n_estimators=100, random_state=42)
clf.fit(x_train, y_train)

# Load Additional Data
description_dict = {}
precaution_dict = {}
severityDictionary = {}

def load_precaution_data():
    with open('Data/symptom_precaution.csv') as csv_file:
        csv_reader = csv.reader(csv_file)
        for row in csv_reader:
            precaution_dict[row[0]] = row[1:]

def load_severity_data():
    with open('Data/Symptom_severity.csv') as csv_file:
        csv_reader = csv.reader(csv_file)
        next(csv_reader)
        for row in csv_reader:
            severityDictionary[row[0]] = int(row[1])

def load_description_data():
    with open('Data/symptom_Description.csv') as csv_file:
        csv_reader = csv.reader(csv_file)
        next(csv_reader)
        for row in csv_reader:
            description_dict[row[0]] = row[1]

load_precaution_data()
load_severity_data()
load_description_data()




# Assume `cols` contains all available symptoms from dataset
def get_closest_symptoms(input_symptom, symptom_list):
    """Find closest matching symptoms based on user input."""
    matches = process.extract(input_symptom, symptom_list, limit=3, scorer=fuzz.partial_ratio)

    # Return suggestions only if similarity score is above a threshold (e.g., 70)
    return [match[0] for match in matches if match[1] > 70]


def get_related_symptoms(input_symptom):
    """Suggest correct symptoms if user input is incorrect."""
    if input_symptom not in cols:
        closest_matches = get_closest_symptoms(input_symptom, cols)
        return {"invalid": True, "suggestions": closest_matches}

    filtered_data = training[training[input_symptom] == 1]
    numeric_data = filtered_data.select_dtypes(include=[np.number])
    symptom_counts = numeric_data.sum().sort_values(ascending=False).drop(input_symptom, errors='ignore')

    return {"invalid": False, "related_symptoms": symptom_counts.index[:5].tolist()}
