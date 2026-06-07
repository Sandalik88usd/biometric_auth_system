import os
import face_recognition
import joblib
from sklearn.svm import SVC
from sklearn.preprocessing import LabelEncoder
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DATASET_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\users"
MODEL_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\trained_model\face_svm_model.pkl"
ENCODER_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\trained_model\label_encoder.pkl"

X = []
y = []

for user_name in os.listdir(DATASET_PATH):
    user_folder = os.path.join(DATASET_PATH, user_name)

    if not os.path.isdir(user_folder):
        continue

    for image_name in os.listdir(user_folder):
        image_path = os.path.join(user_folder, image_name)

        try:
            image = face_recognition.load_image_file(image_path)
            encodings = face_recognition.face_encodings(image)

            if len(encodings) == 1:
                X.append(encodings[0])
                y.append(user_name)
                print(f"[OK] {image_path}")
            else:
                print(f"[SKIP] {image_path}")

        except Exception as e:
            print(f"[ERROR] {image_path}: {e}")

label_encoder = LabelEncoder()
y_encoded = label_encoder.fit_transform(y)

model = make_pipeline(
    StandardScaler(),
    SVC(kernel="linear", probability=True)
)

model.fit(X, y_encoded)

joblib.dump(model, MODEL_PATH)
joblib.dump(label_encoder, ENCODER_PATH)

print("Модель успішно навчена")
print(f"Кількість зображень: {len(X)}")
print(f"Кількість користувачів: {len(set(y))}")