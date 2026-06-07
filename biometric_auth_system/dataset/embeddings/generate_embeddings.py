import os
import numpy as np
import face_recognition

DATASET_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\users"

EMBEDDINGS_PATH = r"C:\Users\sanda\Documents\dz\ДП\biometric_auth_system\dataset\embeddings"

os.makedirs(EMBEDDINGS_PATH, exist_ok=True)

for user_name in os.listdir(DATASET_PATH):

    user_folder = os.path.join(DATASET_PATH, user_name)

    if not os.path.isdir(user_folder):
        continue

    embeddings = []

    for image_name in os.listdir(user_folder):

        image_path = os.path.join(user_folder, image_name)

        try:
            image = face_recognition.load_image_file(image_path)

            encodings = face_recognition.face_encodings(image)

            if len(encodings) == 1:

                embeddings.append(encodings[0])

                print(f"[OK] {image_path}")

            else:
                print(f"[SKIP] {image_path} — знайдено {len(encodings)} облич")

        except Exception as e:
            print(f"[ERROR] {image_path}: {e}")

    if embeddings:

        mean_embedding = np.mean(embeddings, axis=0)

        save_path = os.path.join(
            EMBEDDINGS_PATH,
            f"{user_name}.npy"
        )

        np.save(save_path, mean_embedding)

        print(f"[SAVED] {user_name}")

    else:
        print(f"[NO DATA] {user_name}")