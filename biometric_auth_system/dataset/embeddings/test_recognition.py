import os
import numpy as np
import face_recognition

EMBEDDINGS_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\embeddings"

TEST_IMAGE = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\test.jpg"

TOLERANCE = 0.6

known_users = {}

for file_name in os.listdir(EMBEDDINGS_PATH):

    if file_name.endswith(".npy"):

        user_name = file_name.replace(".npy", "")

        embedding_path = os.path.join(
            EMBEDDINGS_PATH,
            file_name
        )

        known_users[user_name] = np.load(embedding_path)

image = face_recognition.load_image_file(TEST_IMAGE)

encodings = face_recognition.face_encodings(image)

if not encodings:
    print("Обличчя не знайдено")
    exit()

unknown_embedding = encodings[0]

best_user = None
best_distance = 999

for user_name, known_embedding in known_users.items():

    distance = np.linalg.norm(
        known_embedding - unknown_embedding
    )

    print(f"{user_name}: {distance}")

    if distance < best_distance:
        best_distance = distance
        best_user = user_name

if best_distance <= TOLERANCE:

    print("\n=== РЕЗУЛЬТАТ ===")
    print(f"Користувач розпізнаний: {best_user}")
    print(f"Відстань: {best_distance}")

else:

    print("\n=== РЕЗУЛЬТАТ ===")
    print("Користувача не розпізнано")
    print(f"Найближчий збіг: {best_user}")
    print(f"Відстань: {best_distance}")