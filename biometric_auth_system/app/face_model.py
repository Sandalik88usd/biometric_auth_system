import face_recognition
import joblib


class FaceRecognitionSystem:
    def __init__(self, model_path, encoder_path, probability_threshold=0.55):
        self.model = joblib.load(model_path)
        self.label_encoder = joblib.load(encoder_path)
        self.probability_threshold = probability_threshold

    def authenticate(self, image_path):
        image = face_recognition.load_image_file(image_path)

        encodings = face_recognition.face_encodings(image)

        if len(encodings) == 0:
            return {
                "success": False,
                "message": "Обличчя не знайдено"
            }

        if len(encodings) > 1:
            return {
                "success": False,
                "message": "На зображенні знайдено більше одного обличчя"
            }

        embedding = encodings[0]

        probabilities = self.model.predict_proba([embedding])[0]

        best_index = probabilities.argmax()
        best_probability = probabilities[best_index]

        user_name = self.label_encoder.inverse_transform([best_index])[0]

        if best_probability >= self.probability_threshold:
            return {
                "success": True,
                "user": user_name,
                "probability": float(best_probability)
            }

        return {
            "success": False,
            "message": "Користувача не розпізнано",
            "closest_user": user_name,
            "probability": float(best_probability)
        }